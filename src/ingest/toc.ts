import { RawPara } from './types';

/**
 * Finding a book's real table of contents.
 *
 * A PDF reader shows chapters and sections because the file carries an
 * outline, or because the book prints a contents page. Font size alone can't
 * do that in a long book: covers, title pages and running heads all use big
 * type. So, in order of trust:
 *   1. the outline (bookmarks) stored in the file,
 *   2. a printed contents page, read line by line. Its page numbers are the
 *      book's printed ones; the gap between those and the file's own page
 *      count is worked out once, and after that every chapter is placed BY
 *      PAGE, so a heading set in an unusual way is still found,
 *   3. numbered headings ("3.2 The Chain Rule") and, last, type size.
 * Covers, copyright pages, the contents pages themselves, part dividers,
 * prefaces and the index are left out: they are not lessons.
 *
 * docs/BACKEND.md describes the same rules for a server-side model.
 */

export interface TocEntry {
  title: string;
  /** 1 = chapter, 2 = section, 3 = subsection. */
  level: number;
  /** 1-based page in the file, when known. */
  page?: number;
  /** The page number printed in the contents, before it is mapped to a page of the file. */
  printed?: number;
  /** "Part II": a divider between groups of chapters, not a lesson. */
  part?: boolean;
  /** Numbered in roman in the contents: preface and the like. */
  front?: boolean;
}

const FRONT = /^(cover|front\s*cover|half\s*title|title(\s*page)?|copyright|imprint|contents(\s+at\s+a\s+glance)?|table\s+of\s+contents|brief\s+contents|detailed\s+contents|preface|foreword|acknowledge?ments?|dedication|about\s+(the\s+)?(author|book|this\s+book)s?|how\s+to\s+use\s+this\s+book|list\s+of\s+(figures|tables)|to\s+the\s+(student|instructor|teacher)|оглавление|содержание|предисловие)\b/i;
const BACK = /^(index|subject\s+index|bibliography|references|further\s+reading|credits|colophon|about\s+the\s+authors?|back\s*cover|предметный\s+указатель|литература)\b/i;
const LABEL_ONLY = /^(chapter|unit|part|section|module|lesson|глава|раздел)\s+(\d+|[ivxlc]+)\.?$/i;
const CONTENTS_HEAD = /^(table\s+of\s+)?contents(\s+at\s+a\s+glance)?$|^(brief|detailed)\s+contents$|^оглавление$|^содержание$/i;
/** "1.2 The Limit of a Function ........ 35", "Preface …… xi" */
const TOC_LINE = /^(.{2,120}?)[\s.·…_]*[\s.·…_]\s*(\d{1,4}|[ivxlc]{1,7})$/;
const NUMBERED = /^(?:(?:chapter|unit|part|section|module|lesson|глава)\s+)?(\d{1,2}(?:\.\d{1,2}){0,3})[.:)]?\s+\S/i;
const CHAPTER_LABEL = /^(chapter|unit|module|lesson|appendix|глава)\s+([0-9]+|[a-z]\b|[ivxlc]+\b)/i;
const PART_LABEL = /^(part|часть)\s+([0-9]+|[ivxlc]+)\b/i;

export const isFrontTitle = (t: string): boolean => FRONT.test(t.trim());
export const isBackTitle = (t: string): boolean => BACK.test(t.trim());
const isMatter = (e: TocEntry): boolean => !!e.front || !!e.part || isFrontTitle(e.title) || isBackTitle(e.title);

/** Titles compared without numbering, case or punctuation. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/^(chapter|unit|part|section|module|lesson|appendix|глава|раздел)\s+(\d+|[a-z]\b|[ivxlc]+)[.:)]?\s*/i, '')
    .replace(/^\d+(\.\d+)*[.:)]?\s+/, '')
    .replace(/[^a-z0-9а-яё]+/gi, '');
}

const depthOf = (text: string): number | null => {
  const m = NUMBERED.exec(text.trim());
  return m ? m[1].split('.').length : null;
};

const words = (s: string): number => (s.match(/\S+/g) ?? []).length;

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };
function roman(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const a = ROMAN[s[i]] ?? 0;
    const b = ROMAN[s[i + 1]] ?? 0;
    n += a < b ? -a : a;
  }
  return n;
}

/** Contents lines that reached us glued into one paragraph, taken apart again. */
function splitTocLines(text: string): string[] {
  return text
    // after dot leaders and a page number, whatever follows is the next entry
    .split(/(?<=[.·…_]{2,}\s*(?:\d{1,4}|[ivxlc]{1,7}))\s+(?=\S)/)
    // without leaders: only where the next entry plainly starts with its own number or label
    .flatMap((t) => t.split(/(?<=\s\d{1,4})\s+(?=(?:(?:chapter|part|appendix)\s+)?\d{1,2}(?:\.\d{1,2})*[.:]?\s+[A-ZА-Я]|(?:chapter|part|appendix)\s+[0-9ivxlcA-Z]+\b)/i));
}

/** Entries read off printed contents pages, plus which pages those are. */
export function readContentsPages(paras: RawPara[]): { entries: TocEntry[]; pages: Set<number> } {
  const byPage = new Map<number, RawPara[]>();
  for (const p of paras) {
    const pg = p.page ?? 1;
    byPage.set(pg, [...(byPage.get(pg) ?? []), p]);
  }
  const pages = new Set<number>();
  interface Row { title: string; x: number; depth: number | null; printed: number; front: boolean }
  const rows: Row[] = [];
  let inContents = false;
  let misses = 0;
  // contents sit near the front; a long book may spend twenty pages on them
  const limit = Math.max(14, Math.ceil(byPage.size * 0.15));
  for (const [pg, joined] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
    if (pg > limit && !inContents) break;
    const list = joined.flatMap((p) => splitTocLines(p.text).map((text) => ({ ...p, text: text.trim() })));
    const hits = list.filter((p) => TOC_LINE.test(p.text) && /[A-Za-zА-Яа-я]{2,}/.test(p.text));
    const headed = list.some((p) => CONTENTS_HEAD.test(p.text));
    // a page that is mostly "title … number" lines is a contents page whether or not it says so
    const dense = hits.length >= 4 && hits.length >= list.length * 0.5;
    const veryDense = hits.length >= 6 && hits.length >= list.length * 0.6;
    if (!((dense && (headed || inContents)) || veryDense || (headed && hits.length >= 3))) {
      // "Contents at a Glance" and the full contents can have a blank or title page between them
      if (inContents && ++misses >= 2) break;
      continue;
    }
    inContents = true;
    misses = 0;
    pages.add(pg);
    for (const p of hits) {
      const m = TOC_LINE.exec(p.text);
      if (!m) continue;
      const title = m[1].replace(/[\s.·…_]+$/, '').trim();
      if (title.length < 2 || CONTENTS_HEAD.test(title)) continue;
      const arabic = /^\d+$/.test(m[2]);
      rows.push({ title, x: p.x ?? 0, depth: depthOf(title), printed: arabic ? Number(m[2]) : roman(m[2]), front: !arabic });
    }
  }
  if (rows.length < 3) return { entries: [], pages: new Set() };

  // a short list followed by the full one ("at a glance", then the detailed contents): keep each entry once, the later copy
  const seen = new Map<string, number>();
  rows.forEach((r, i) => seen.set(`${norm(r.title)}@${r.front ? 'r' : ''}${r.printed}`, i));
  const unique = rows.filter((r, i) => seen.get(`${norm(r.title)}@${r.front ? 'r' : ''}${r.printed}`) === i);

  // nesting: from the numbering when the book numbers its sections; from "Part"/"Chapter" labels when it uses them;
  // otherwise from how far each line is indented
  const numbered = unique.filter((r) => r.depth !== null).length >= unique.length * 0.5;
  const chapters = unique.filter((r) => CHAPTER_LABEL.test(r.title));
  const labelled = !numbered && chapters.length >= 2;
  const bucket = (x: number): number => Math.round(x / 6);
  const xs = [...new Set(unique.map((r) => bucket(r.x)))].sort((a, b) => a - b);
  const chapterX = labelled ? Math.min(...chapters.map((r) => bucket(r.x))) : 0;
  const deeper = xs.filter((x) => x > chapterX);
  const entries = unique.map((r): TocEntry => {
    let level: number;
    let part = false;
    if (numbered) level = r.depth ?? 1;
    else if (labelled) {
      part = PART_LABEL.test(r.title);
      const x = bucket(r.x);
      level = part || CHAPTER_LABEL.test(r.title) || x <= chapterX ? 1 : deeper.indexOf(x) + 2;
    } else level = xs.length > 1 ? xs.indexOf(bucket(r.x)) + 1 : 1;
    return { title: r.title, level: Math.max(1, Math.min(3, level)), printed: r.front ? undefined : r.printed, front: r.front || undefined, part: part || undefined };
  });
  return { entries, pages };
}

export interface Structured {
  paras: RawPara[];
  /** How the headings were decided, for the note shown after reading. */
  via: 'outline' | 'contents' | 'numbering' | 'type';
  /** Pages left out as cover, contents, preface or index. */
  skipped: number;
  title?: string;
}

/** Does this paragraph carry this entry's title? */
function carries(p: RawPara, entry: TocEntry, key: string): boolean {
  if (p.text.length > entry.title.length + 40) return false;
  const k = norm(p.text);
  if (!k) return false;
  return k === key || (k.length >= 4 && key.includes(k) && k.length >= key.length * 0.6) || (key.length >= 4 && k.includes(key) && key.length >= k.length * 0.6);
}

const headingLike = (p: RawPara, entry: TocEntry): boolean => (p.scale ?? 1) > 1.04 || !!p.bold || p.level !== undefined || p.text.length <= entry.title.length + 12;

/**
 * Printed page numbers start at the first chapter, not at the cover, so "page 25" in the contents may be the
 * file's page 43. Find a few entries by their text, see how far apart the two numbers are, and take the gap
 * most of them agree on. Null when the contents can't be tied to the pages at all.
 */
function pageGap(entries: TocEntry[], paras: RawPara[], after: number): number | null {
  const votes = new Map<number, number>();
  let asked = 0;
  for (const e of entries) {
    if (e.printed === undefined || isMatter(e) || e.level > 2) continue;
    const key = norm(e.title);
    if (key.length < 4) continue;
    if (++asked > 60) break;
    // the first place the title appears after the contents is the heading; later ones are running heads
    const hit = paras.find((p) => (p.page ?? 0) > after && headingLike(p, e) && carries(p, e, key));
    if (!hit) continue;
    const gap = (hit.page ?? 0) - e.printed;
    votes.set(gap, (votes.get(gap) ?? 0) + 1);
  }
  let best: number | null = null;
  let most = 0;
  for (const [gap, n] of [...votes.entries()].sort((a, b) => a[0] - b[0])) {
    if (n > most) {
      most = n;
      best = gap;
    }
  }
  // one match is enough for a short list; a long one needs agreement
  return best !== null && (most >= 2 || asked <= 3) ? best : null;
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
    entries = usable.map((e) => ({ ...e, part: e.part ?? (PART_LABEL.test(e.title) && usable.some((u) => CHAPTER_LABEL.test(u.title)) ? true : undefined) }));
    via = 'outline';
  } else if (contents.entries.length >= 3) {
    entries = contents.entries.map((e) => ({ ...e }));
    via = 'contents';
  }

  // the contents pages themselves are never content
  paras.forEach((p, i) => {
    if (contents.pages.has(p.page ?? -1)) drop.add(i);
  });
  const afterContents = contents.pages.size ? Math.max(...contents.pages) : 0;

  if (via === 'contents') {
    const gap = pageGap(entries, paras, afterContents);
    if (gap !== null) for (const e of entries) if (e.printed !== undefined) e.page = e.printed + gap;
  }

  if (entries.length) {
    const real = entries.filter((e) => !isMatter(e));
    const top = real.length ? Math.min(...real.map((e) => e.level)) : 1;
    const matched: { at: number; entry: TocEntry }[] = [];
    const used = new Set<number>();
    let cursor = 0;
    let drift = 0;
    for (const e of entries) {
      const key = norm(e.title);
      if (key.length < 2) continue;
      let found = -1;
      const fits = (i: number): boolean => !used.has(i) && !drop.has(i) && carries(paras[i], e, key);
      if (e.page !== undefined) {
        // Look on the expected page and its neighbours, and take the candidate set most like a heading: big type
        // beats the small running head that repeats the chapter's name; the expected page wins a tie.
        const expected = e.page + drift;
        let best = -Infinity;
        for (let i = 0; i < paras.length; i++) {
          const off = (paras[i].page ?? 0) - expected;
          if (off < -1 || off > 2 || !fits(i)) continue;
          const score = (paras[i].scale ?? 1) + (paras[i].level !== undefined ? 0.5 : 0) - Math.abs(off) * 0.15;
          if (score > best) {
            best = score;
            found = i;
          }
        }
        // blank pages left out of the file shift everything after them: carry the shift forward
        if (found >= 0 && via === 'contents' && ((paras[found].scale ?? 1) > 1.04 || paras[found].level !== undefined)) drift += (paras[found].page ?? 0) - expected;
      } else {
        for (let i = cursor; i < paras.length && found < 0; i++) {
          if ((paras[i].page ?? 0) <= afterContents) continue;
          if (headingLike(paras[i], e) && fits(i)) found = i;
        }
      }
      if (found < 0) {
        // the page is known but the heading's text wasn't found there (set as a picture, or split oddly):
        // the chapter or section still starts on that page
        if (e.page !== undefined && e.level - top <= 1) {
          const first = paras.findIndex((p, i) => (p.page ?? 0) >= (e.page as number) + drift && !used.has(i));
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
      // Where the lessons begin. With "Chapter 1 …" in the list, that is the first chapter: the introduction before it
      // is about the book. Otherwise it is the first entry after anything named like front matter.
      const labelled = matched.filter((m) => CHAPTER_LABEL.test(m.entry.title)).length >= 2;
      const early = matched.slice(0, Math.max(3, Math.ceil(matched.length * 0.3)));
      let lastFront = -1;
      early.forEach((m, k) => {
        if (isFrontTitle(m.entry.title) || m.entry.front) lastFront = k;
      });
      const firstReal = labelled ? matched.find((m) => CHAPTER_LABEL.test(m.entry.title)) : matched.find((m, k) => k > lastFront && !isMatter(m.entry));
      const start = firstReal ? Math.ceil(firstReal.at) : 0;
      for (let i = 0; i < start; i++) drop.add(i);
      // prefaces, the index and part dividers go, up to whatever comes next
      matched.forEach((m, k) => {
        if (!isMatter(m.entry)) return;
        const next = m.entry.part ? matched[k + 1] : matched.slice(k + 1).find((n) => n.entry.level <= m.entry.level);
        const end = next ? Math.ceil(next.at) : paras.length;
        for (let i = Math.max(0, Math.ceil(m.at)); i < end; i++) drop.add(i);
      });
      // a chapter's or part's name standing alone anywhere else is a running head that slipped through
      const heads = new Set(entries.filter((e) => e.part || e.level === top).map((e) => norm(e.title)).filter((k) => k.length >= 6));
      paras.forEach((p, i) => {
        if (used.has(i) || drop.has(i) || p.text.length > 130) return;
        const k = norm(p.text).replace(/^\d+|\d+$/g, '');
        if (heads.has(k)) drop.add(i);
      });
      const deepest = real.length ? Math.min(3, Math.max(...real.map((e) => e.level - top + 1))) : 1;
      // Headings the contents don't mention sit inside the sections that are listed. They keep their order of size:
      // under a chapters-only list the biggest are sections and the next are sub-headings.
      const loose = [...new Set(paras.filter((p, i) => p.level !== undefined && p.level > 0 && !used.has(i) && !drop.has(i)).map((p) => p.level as number))].sort((a, b) => a - b);
      paras.forEach((p, i) => {
        if (p.level === undefined || used.has(i)) return;
        if (p.level === 0) title = title ?? p.text;
        if (long || p.level > 0) p.level = Math.min(3, deepest + 1 + Math.max(0, loose.indexOf(p.level)));
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
        } else if (!isMatter(m.entry)) {
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
    const sizeOf = (p: RawPara): number => Math.round((p.scale ?? 1) * 20);
    headings.forEach((p) => count.set(sizeOf(p), (count.get(sizeOf(p)) ?? 0) + 1));
    const common = [...count.entries()].filter(([, n]) => n >= 2).map(([s]) => s).sort((a, b) => b - a);
    if (common.length) {
      for (const p of headings) {
        const rank = common.findIndex((c) => sizeOf(p) >= c);
        p.level = Math.max(1, Math.min(3, (rank < 0 ? common.length - 1 : rank) + 1));
      }
    }
  }
  const out = kept.filter((p) => !(LABEL_ONLY.test(p.text.trim()) && p.level === undefined && p.text.length < 16));
  return { paras: out, via, skipped: new Set(paras.filter((_, i) => drop.has(i)).map((p) => p.page ?? 0)).size, title };
}
