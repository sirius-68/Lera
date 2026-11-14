import { RawPara } from './types';

/**
 * Finding a book's real table of contents.
 *
 * A PDF reader shows chapters and sections because the file carries an
 * outline, or because the book prints a contents page. Font size alone can't
 * do that in a long book — covers, title pages and running heads all use big
 * type. So, in order of trust:
 *   1. the outline (bookmarks) stored in the file,
 *   2. a printed contents page, read line by line,
 *   3. numbered headings ("3.2 The Chain Rule") and, last, type size.
 * Covers, copyright pages, the contents page itself, prefaces and the index
 * are left out: they are not lessons.
 */

export interface TocEntry {
  title: string;
  /** 1 = chapter, 2 = section, 3 = subsection. */
  level: number;
  /** 1-based page in the file, when the outline gives one. */
  page?: number;
}

const FRONT = /^(cover|front\s*cover|half\s*title|title(\s*page)?|copyright|imprint|contents|table\s+of\s+contents|brief\s+contents|detailed\s+contents|preface|foreword|acknowledge?ments?|dedication|about\s+(the\s+)?(author|book|this\s+book)s?|how\s+to\s+use\s+this\s+book|list\s+of\s+(figures|tables)|to\s+the\s+(student|instructor|teacher)|оглавление|содержание|предисловие)\b/i;
const BACK = /^(index|subject\s+index|bibliography|references|further\s+reading|credits|colophon|about\s+the\s+authors?|back\s*cover|предметный\s+указатель|литература)\b/i;
const LABEL_ONLY = /^(chapter|unit|part|section|module|lesson|глава|раздел)\s+(\d+|[ivxlc]+)\.?$/i;
const CONTENTS_HEAD = /^(table\s+of\s+)?contents$|^(brief|detailed)\s+contents$|^оглавление$|^содержание$/i;
/** "1.2 The Limit of a Function ........ 35" */
const TOC_LINE = /^(.{2,110}?)[\s.·…_]*[\s.·…]\s*(\d{1,4}|[ivxlc]{1,7})$/i;
const NUMBERED = /^(?:(?:chapter|unit|part|section|module|lesson|глава)\s+)?(\d{1,2}(?:\.\d{1,2}){0,3})[.:)]?\s+\S/i;

export const isFrontTitle = (t: string): boolean => FRONT.test(t.trim());
export const isBackTitle = (t: string): boolean => BACK.test(t.trim());

/** Titles compared without numbering, case or punctuation. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/^(chapter|unit|part|section|module|lesson|глава|раздел)\s+(\d+|[ivxlc]+)[.:)]?\s*/i, '')
    .replace(/^\d+(\.\d+)*[.:)]?\s+/, '')
    .replace(/[^a-z0-9а-яё]+/gi, '');
}

const depthOf = (text: string): number | null => {
  const m = NUMBERED.exec(text.trim());
  return m ? m[1].split('.').length : null;
};

const words = (s: string): number => (s.match(/\S+/g) ?? []).length;

/** Entries read off printed contents pages, plus which pages those are. */
export function readContentsPages(paras: RawPara[]): { entries: TocEntry[]; pages: Set<number> } {
  const byPage = new Map<number, RawPara[]>();
  for (const p of paras) {
    const pg = p.page ?? 1;
    byPage.set(pg, [...(byPage.get(pg) ?? []), p]);
  }
  const pages = new Set<number>();
  const rows: { title: string; x: number; depth: number | null; bold: boolean }[] = [];
  let inContents = false;
  const limit = Math.max(12, Math.ceil(byPage.size * 0.12));
  for (const [pg, joined] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
    if (pg > limit && !inContents) break;
    // two contents lines sometimes arrive glued together: "7.1 … 160 7.2 … 166"
    const list = joined.flatMap((p) => p.text.split(/(?<=\s\d{1,4})\s+(?=(?:chapter\s+)?\d{1,2}(?:\.\d{1,2})*\.?\s+[A-ZА-Я])/i).map((text) => ({ ...p, text })));
    const hits = list.filter((p) => TOC_LINE.test(p.text.trim()) && /[A-Za-zА-Яа-я]{2,}/.test(p.text));
    const headed = list.some((p) => CONTENTS_HEAD.test(p.text.trim()));
    const dense = hits.length >= 4 && hits.length >= list.length * 0.5;
    if (!(dense && (headed || inContents)) && !(headed && hits.length >= 3)) {
      if (inContents) break;
      continue;
    }
    inContents = true;
    pages.add(pg);
    for (const p of hits) {
      const m = TOC_LINE.exec(p.text.trim());
      if (!m) continue;
      const title = m[1].replace(/[\s.·…_]+$/, '').trim();
      if (title.length < 2 || CONTENTS_HEAD.test(title)) continue;
      rows.push({ title, x: p.x ?? 0, depth: depthOf(title), bold: !!p.bold });
    }
  }
  if (rows.length < 3) return { entries: [], pages: new Set() };
  // nesting: from the numbering when the book numbers its sections, otherwise from how far each line is indented
  const numbered = rows.filter((r) => r.depth !== null).length >= rows.length * 0.5;
  const xs = [...new Set(rows.map((r) => Math.round(r.x / 6)))].sort((a, b) => a - b);
  const entries = rows.map((r): TocEntry => {
    let level: number;
    if (numbered) level = r.depth ?? 1;
    else level = xs.length > 1 ? xs.indexOf(Math.round(r.x / 6)) + 1 : 1;
    return { title: r.title, level: Math.max(1, Math.min(3, level)) };
  });
  return { entries, pages };
}

export interface Structured {
  paras: RawPara[];
  /** How the headings were decided — for the note shown after reading. */
  via: 'outline' | 'contents' | 'numbering' | 'type';
  /** Pages left out as cover, contents, preface or index. */
  skipped: number;
  title?: string;
}

/**
 * Decide which paragraphs are chapter, section and subsection headings, and drop the pages that are not lessons.
 * `outline` is the file's own bookmark list, when it has one.
 */
export function applyBookStructure(input: RawPara[], outline: TocEntry[], pageCount: number): Structured {
  const paras = input.map((p) => ({ ...p }));
  const long = pageCount >= 12;
  let via: Structured['via'] = 'type';
  const drop = new Set<number>();
  let title: string | undefined;

  const contents = readContentsPages(paras);
  let entries: TocEntry[] = [];
  const usable = outline.filter((e) => e.title.trim().length > 0);
  if (usable.filter((e) => !isFrontTitle(e.title) && !isBackTitle(e.title)).length >= 3) {
    entries = usable;
    via = 'outline';
  } else if (contents.entries.length >= 3) {
    entries = contents.entries;
    via = 'contents';
  }

  // the contents pages themselves are never content
  paras.forEach((p, i) => {
    if (contents.pages.has(p.page ?? -1)) drop.add(i);
  });
  const afterContents = contents.pages.size ? Math.max(...contents.pages) : 0;

  if (entries.length) {
    // normalise levels so the shallowest real entry is 1
    const real = entries.filter((e) => !isFrontTitle(e.title) && !isBackTitle(e.title));
    const top = Math.min(...real.map((e) => e.level));
    const matched: { at: number; entry: TocEntry }[] = [];
    const used = new Set<number>();
    let cursor = 0;
    for (const e of entries) {
      const key = norm(e.title);
      if (key.length < 2) continue;
      let found = -1;
      const fits = (i: number): boolean => {
        const p = paras[i];
        if (used.has(i) || drop.has(i) || p.text.length > e.title.length + 40) return false;
        const k = norm(p.text);
        if (!k) return false;
        return k === key || (k.length >= 4 && key.includes(k) && k.length >= key.length * 0.6) || (key.length >= 4 && k.includes(key) && key.length >= k.length * 0.6);
      };
      if (e.page !== undefined) {
        for (let i = 0; i < paras.length && found < 0; i++) {
          const pg = paras[i].page ?? 0;
          if ((pg === e.page || pg === e.page + 1) && fits(i)) found = i;
        }
      } else {
        for (let i = cursor; i < paras.length && found < 0; i++) {
          if ((paras[i].page ?? 0) <= afterContents) continue;
          const headingLike = (paras[i].scale ?? 1) > 1.04 || !!paras[i].bold || paras[i].level !== undefined || paras[i].text.length <= e.title.length + 12;
          if (headingLike && fits(i)) found = i;
        }
      }
      if (found < 0) {
        // the outline names a page but the heading text wasn't found there: still start the section on that page
        if (e.page !== undefined) {
          const first = paras.findIndex((p, i) => (p.page ?? 0) >= (e.page as number) && !used.has(i));
          if (first >= 0) matched.push({ at: first - 0.5, entry: e });
        }
        continue;
      }
      used.add(found);
      cursor = found + 1;
      matched.push({ at: found, entry: e });
    }

    if (matched.filter((m) => Number.isInteger(m.at)).length >= 2 || matched.length >= 3) {
      matched.sort((a, b) => a.at - b.at);
      // everything before the first real entry is front matter — and so is anything that comes before
      // "Contents" or "Preface" in the list (a cover or title page under its own name)
      const early = matched.slice(0, Math.max(3, Math.ceil(matched.length * 0.3)));
      let lastFront = -1;
      early.forEach((m, k) => {
        if (isFrontTitle(m.entry.title)) lastFront = k;
      });
      const firstReal = matched.find((m, k) => k > lastFront && !isFrontTitle(m.entry.title) && !isBackTitle(m.entry.title));
      const start = firstReal ? Math.ceil(firstReal.at) : 0;
      for (let i = 0; i < start; i++) drop.add(i);
      // sections the contents list as preface, index … go too
      matched.forEach((m, k) => {
        if (!isFrontTitle(m.entry.title) && !isBackTitle(m.entry.title)) return;
        const depth = m.entry.level;
        const next = matched.slice(k + 1).find((n) => n.entry.level <= depth);
        const end = next ? Math.ceil(next.at) : paras.length;
        for (let i = Math.max(0, Math.ceil(m.at)); i < end; i++) drop.add(i);
      });
      const deepest = Math.min(3, Math.max(...real.map((e) => e.level - top + 1)));
      // headings the contents don't mention become sub-headings inside their section
      paras.forEach((p, i) => {
        if (p.level === undefined || used.has(i)) return;
        if (p.level === 0) title = title ?? p.text;
        p.level = long || p.level > 0 ? Math.min(3, deepest + 1) : p.level;
      });
      const inserted: { before: number; para: RawPara }[] = [];
      for (const m of matched) {
        const level = Math.max(1, Math.min(3, m.entry.level - top + 1));
        if (Number.isInteger(m.at)) {
          const p = paras[m.at];
          p.level = level;
          p.list = undefined;
          p.text = m.entry.title.replace(/\s+/g, ' ').trim().length >= p.text.length * 0.6 ? p.text : m.entry.title;
          // "Chapter 3" printed on its own line above the title
          const prev = paras[m.at - 1];
          if (prev && LABEL_ONLY.test(prev.text.trim())) drop.add(m.at - 1);
        } else if (!isFrontTitle(m.entry.title) && !isBackTitle(m.entry.title)) {
          inserted.push({ before: Math.ceil(m.at), para: { text: m.entry.title, level, page: m.entry.page } });
        }
      }
      const out: RawPara[] = [];
      paras.forEach((p, i) => {
        for (const ins of inserted) if (ins.before === i) out.push(ins.para);
        if (!drop.has(i)) out.push(p);
      });
      const skippedPages = new Set(paras.filter((_, i) => drop.has(i)).map((p) => p.page ?? 0));
      const keptPages = new Set(out.map((p) => p.page ?? 0));
      return { paras: out, via, skipped: [...skippedPages].filter((pg) => !keptPages.has(pg)).length, title };
    }
    via = 'type';
  }

  // no usable contents: leave out an obvious cover and copyright page, then trust numbering and type size
  if (long) {
    const byPage = new Map<number, number[]>();
    paras.forEach((p, i) => byPage.set(p.page ?? 1, [...(byPage.get(p.page ?? 1) ?? []), i]));
    for (const [pg, idx] of byPage) {
      if (pg > 6) continue;
      const text = idx.map((i) => paras[i].text).join(' ');
      const n = words(text);
      const cover = pg === 1 && n < 70;
      const legal = n < 260 && /©|copyright|all rights reserved|isbn|printed in/i.test(text);
      if (cover || legal) {
        if (cover) title = title ?? paras[idx.find((i) => paras[i].level !== undefined) ?? idx[0]].text;
        idx.forEach((i) => drop.add(i));
      }
    }
  }
  const kept = paras.filter((_, i) => !drop.has(i));
  const headings = kept.filter((p) => p.level !== undefined && p.level > 0);
  const numberedHeads = headings.filter((p) => depthOf(p.text) !== null);
  if (numberedHeads.length >= 3 && numberedHeads.length >= headings.length * 0.4) {
    via = 'numbering';
    const minDepth = Math.min(...numberedHeads.map((p) => depthOf(p.text) as number));
    const maxDepth = Math.min(3, Math.max(...numberedHeads.map((p) => (depthOf(p.text) as number) - minDepth + 1)));
    for (const p of headings) {
      const d = depthOf(p.text);
      p.level = d !== null ? Math.max(1, Math.min(3, d - minDepth + 1)) : Math.min(3, maxDepth + 1);
    }
    kept.forEach((p, i) => {
      if (LABEL_ONLY.test(p.text.trim()) && kept[i + 1]?.level === 1) p.level = undefined;
    });
  } else if (headings.length >= 8) {
    // type size: a size used once or twice in a long book is a title page, not a level
    const count = new Map<number, number>();
    headings.forEach((p) => count.set(Math.round((p.scale ?? 1) * 20), (count.get(Math.round((p.scale ?? 1) * 20)) ?? 0) + 1));
    const common = [...count.entries()].filter(([, n]) => n >= 2).map(([s]) => s).sort((a, b) => b - a);
    if (common.length) {
      for (const p of headings) {
        const s = Math.round((p.scale ?? 1) * 20);
        const rank = common.findIndex((c) => s >= c);
        p.level = Math.max(1, Math.min(3, (rank < 0 ? common.length - 1 : rank) + 1));
      }
    }
  }
  const out = kept.filter((p) => !(LABEL_ONLY.test(p.text.trim()) && p.level === undefined && p.text.length < 16));
  return { paras: out, via, skipped: new Set(paras.filter((_, i) => drop.has(i)).map((p) => p.page ?? 0)).size, title };
}
