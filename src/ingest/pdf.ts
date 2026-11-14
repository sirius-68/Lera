import { cleanText } from './text';
import { RawDoc, RawPara } from './types';

/**
 * PDF → paragraphs.
 *
 * A PDF has no paragraphs or headings, only glyphs at coordinates. This module
 * rebuilds lines from positions, keeps superscripts as ^n so powers survive,
 * strips running headers and page numbers, and passes font size along so the
 * structuring step can tell a heading from body text.
 */

// The slice of the pdf.js API this module uses.
interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
}
interface PdfPage {
  getTextContent(): Promise<{ items: unknown[] }>;
  getViewport(o: { scale: number }): { width: number; height: number };
}
interface PdfDocument {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
  destroy?: () => Promise<void> | void;
}
export interface PdfModule {
  getDocument(src: unknown): { promise: Promise<PdfDocument> };
}

interface Glyph {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  font: string;
}

interface Line {
  text: string;
  x0: number;
  x1: number;
  y: number;
  size: number;
  font: string;
  page: number;
  pageHeight: number;
  pageWidth: number;
}

function mode<T>(entries: [T, number][]): T | undefined {
  const tally = new Map<T, number>();
  for (const [k, w] of entries) tally.set(k, (tally.get(k) ?? 0) + w);
  let best: T | undefined;
  let bestW = -1;
  for (const [k, w] of tally) if (w > bestW) {
    best = k;
    bestW = w;
  }
  return best;
}

const round = (n: number, step = 0.5): number => Math.round(n / step) * step;

function buildLines(glyphs: Glyph[], page: number, pageWidth: number, pageHeight: number): Line[] {
  const visible = glyphs.filter((g) => g.str.length > 0);
  // top of page first; ties left to right
  visible.sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Glyph[][] = [];
  for (const g of visible) {
    if (!g.str.trim() && g.h === 0) continue;
    const row = rows[rows.length - 1];
    if (row) {
      const ref = row.reduce((m, r) => (r.h > m.h ? r : m), row[0]);
      const tol = 0.55 * Math.max(ref.h, g.h || ref.h);
      if (Math.abs(g.y - ref.y) <= tol) {
        row.push(g);
        continue;
      }
    }
    rows.push([g]);
  }

  const lines: Line[] = [];
  for (const row of rows) {
    const inked = row.filter((g) => g.str.trim());
    if (inked.length === 0) continue;
    const dom = mode(inked.map((g): [number, number] => [round(g.h), g.str.trim().length])) ?? inked[0].h;
    const baseline = mode(inked.filter((g) => round(g.h) === dom).map((g): [number, number] => [round(g.y, 0.25), g.str.length])) ?? inked[0].y;
    row.sort((a, b) => a.x - b.x);
    let text = '';
    let prevEnd: number | null = null;
    // a raised (or lowered) run can be split over several glyphs: "n", "−1" → ^(n−1)
    type Script = { kind: '^' | '_'; s: string };
    let script = null as Script | null;
    const flush = () => {
      if (!script) return;
      const t = script.s.trim();
      if (t) text += script.kind === '^' ? (/^[\w]$/.test(t) ? `^${t}` : `^(${t})`) : `_${t}`;
      script = null;
    };
    for (const g of row) {
      const s = g.str;
      if (!s.trim()) {
        if (script) {
          // a space set at the raised baseline ends the exponent; one on the main baseline is just a space
          flush();
        }
        if (text && !text.endsWith(' ')) text += ' ';
        prevEnd = g.x + g.w;
        continue;
      }
      const rise = g.y - baseline;
      // exporters disagree about superscript size (Word ≈ 65%, LaTeX ≈ 70%, browsers ≈ 83%), and some
      // keep the full size and only lift the glyph — so go by the lift, with size as supporting evidence
      const smaller = g.h > 0 && g.h < 0.93 * dom;
      const attached = prevEnd !== null && g.x - prevEnd < 0.25 * dom && /[\w)\]}]$/.test(text.trimEnd()) && !text.endsWith(' ');
      const short = s.trim().length <= 6 && !/\s/.test(s.trim());
      const raised: boolean = short && (attached || !!script) && ((smaller && rise > 0.15 * dom) || rise > 0.28 * dom);
      const lowered: boolean = short && (attached || !!script) && smaller && rise < -0.1 * dom && s.trim().length <= 3;
      if (raised || lowered) {
        const kind: '^' | '_' = raised ? '^' : '_';
        if (script && script.kind !== kind) flush();
        if (!script) script = { kind, s: '' };
        script.s += s.trim();
        prevEnd = g.x + g.w;
        continue;
      }
      flush();
      if (prevEnd !== null && g.x - prevEnd > 0.2 * dom && !text.endsWith(' ') && !s.startsWith(' ')) text += ' ';
      text += s;
      prevEnd = g.x + g.w;
    }
    flush();
    const clean = cleanText(text);
    if (!clean) continue;
    lines.push({
      text: clean,
      x0: Math.min(...inked.map((g) => g.x)),
      x1: Math.max(...inked.map((g) => g.x + g.w)),
      y: baseline,
      size: dom,
      font: mode(inked.map((g): [string, number] => [g.font, g.str.length])) ?? '',
      page,
      pageHeight,
      pageWidth,
    });
  }
  return lines;
}

const BULLET = /^([•▪◦●○■□➢➤✓–—-]|\(?[a-zA-Z0-9]{1,2}[.)])\s+/;
const PAGE_NO = /^(page\s+)?\d{1,4}(\s*(of|\/)\s*\d{1,4})?$/i;

function stripFurniture(lines: Line[], pages: number): Line[] {
  const edge = (l: Line) => l.y > l.pageHeight * 0.92 || l.y < l.pageHeight * 0.08;
  const seen = new Map<string, Set<number>>();
  for (const l of lines) {
    if (!edge(l)) continue;
    const key = l.text.replace(/\d+/g, '#').toLowerCase();
    if (!seen.has(key)) seen.set(key, new Set());
    seen.get(key)!.add(l.page);
  }
  const repeated = new Set<string>();
  for (const [key, set] of seen) if (pages >= 3 && set.size >= Math.max(3, Math.ceil(pages * 0.5))) repeated.add(key);
  return lines.filter((l) => {
    if (!edge(l)) return true;
    if (PAGE_NO.test(l.text)) return false;
    return !repeated.has(l.text.replace(/\d+/g, '#').toLowerCase());
  });
}

function assemble(lines: Line[]): RawPara[] {
  if (lines.length === 0) return [];
  const body = mode(lines.map((l): [number, number] => [round(l.size), l.text.length])) ?? lines[0].size;
  const bodyFont = mode(lines.filter((l) => round(l.size) === body).map((l): [string, number] => [l.font, l.text.length])) ?? '';
  const right = Math.max(...lines.filter((l) => round(l.size) === body).map((l) => l.x1));
  const left = Math.min(...lines.filter((l) => round(l.size) === body).map((l) => l.x0));
  const width = Math.max(1, right - left);

  interface Draft {
    parts: Line[];
  }
  const drafts: Draft[] = [];
  let cur: Draft | null = null;

  const looksMath = (t: string) => /[=+−\-*/^<>≤≥]/.test(t) && (t.match(/[A-Za-z]{3,}/g) ?? []).length === 0;
  let lastNumber: number | null = null;

  for (const line of lines) {
    const prev = cur ? cur.parts[cur.parts.length - 1] : null;
    let split = !prev;
    if (prev) {
      const samePage = prev.page === line.page;
      const gap = samePage ? prev.y - line.y : 0;
      const sizeChanged = Math.abs(prev.size - line.size) > 0.06 * body;
      const bigGap = samePage && gap > 1.75 * Math.max(prev.size, line.size);
      const prevShort = prev.x1 < right - 0.25 * width;
      // a first-line indent starts a paragraph — but the wrapped line of a bullet is not one
      const hanging = cur!.parts.length === 1 && BULLET.test(cur!.parts[0].text);
      const indented = !hanging && line.x0 > prev.x0 + 1.2 * body;
      const heading = round(line.size) > body * 1.12 || round(prev.size) > body * 1.12;
      const sentenceEnd = /[.!?:;]$/.test(prev.text);

      // "4. Each part…" can simply be a sentence that wrapped after "3x + 4."; a real list counts up
      let listStart = BULLET.test(line.text);
      const numbered = /^\(?(\d{1,2})[.)]\s/.exec(line.text);
      if (listStart && numbered) {
        const n = Number(numbered[1]);
        listStart = n === 1 || (lastNumber !== null && n === lastNumber + 1) || prevShort || sentenceEnd || bigGap;
        if (listStart) lastNumber = n;
      }
      if (heading || bigGap) lastNumber = numbered && listStart ? lastNumber : null;

      split =
        sizeChanged ||
        bigGap ||
        listStart ||
        (heading && sizeChanged) ||
        (prevShort && (sentenceEnd || /^[A-Z0-9(]/.test(line.text) || looksMath(prev.text) || looksMath(line.text))) ||
        indented ||
        (!samePage && sentenceEnd);
    } else {
      const numbered = /^\(?(\d{1,2})[.)]\s/.exec(line.text);
      if (numbered) lastNumber = Number(numbered[1]);
    }
    if (split || !cur) {
      cur = { parts: [line] };
      drafts.push(cur);
    } else {
      cur.parts.push(line);
    }
  }

  // heading levels from distinct sizes larger than body text
  const bigSizes = [...new Set(drafts.map((d) => round(d.parts[0].size)).filter((s) => s > body * 1.12))].sort((a, b) => b - a);
  const sizeCount = (s: number) => drafts.filter((d) => round(d.parts[0].size) === s).length;
  const first = drafts[0];
  const titleSize =
    bigSizes.length > 0 && sizeCount(bigSizes[0]) === 1 && round(first.parts[0].size) === bigSizes[0] ? bigSizes[0] : null;
  const headingSizes = bigSizes.filter((s) => s !== titleSize);

  return drafts.map((dft, i): RawPara => {
    let text = '';
    for (const part of dft.parts) {
      if (!text) text = part.text;
      else if (/[A-Za-z]-$/.test(text) && /^[a-z]/.test(part.text)) text = text.slice(0, -1) + part.text;
      else text += ' ' + part.text;
    }
    const size = round(dft.parts[0].size);
    const para: RawPara = { text, scale: size / body, page: dft.parts[0].page };
    if (titleSize !== null && size === titleSize) para.level = 0;
    else {
      const rank = headingSizes.indexOf(size);
      if (rank >= 0 && text.length < 140) para.level = Math.min(3, rank + 1);
    }
    const b = BULLET.exec(text);
    if (b && para.level === undefined) para.list = /^[•▪◦●○■□➢➤✓–—-]/.test(b[0]) ? 'bullet' : 'number';
    // a short stand-alone line in a different face from the body is usually a bold heading
    const next = drafts[i + 1];
    if (
      para.level === undefined &&
      dft.parts.length === 1 &&
      text.length <= 70 &&
      dft.parts[0].font !== bodyFont &&
      !/[.,;]$/.test(text) &&
      /^[A-Z0-9]/.test(text) &&
      (text.match(/[A-Za-z]{3,}/g)?.length ?? 0) >= 1 &&
      next &&
      next.parts[0].font === bodyFont
    ) {
      para.bold = true;
    }
    return para;
  });
}

export async function readPdfWith(
  pdfjs: PdfModule,
  data: Uint8Array,
  fileName: string,
  onProgress?: (fraction: number) => void,
): Promise<RawDoc> {
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false, verbosity: 0 }).promise;
  let lines: Line[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const glyphs: Glyph[] = [];
      for (const raw of content.items) {
        const it = raw as Partial<TextItem>;
        if (typeof it.str !== 'string' || !it.transform) continue;
        const h = it.height || Math.hypot(it.transform[2], it.transform[3]);
        glyphs.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width ?? 0, h, font: it.fontName ?? '' });
      }
      lines.push(...buildLines(glyphs, n, vp.width, vp.height));
      onProgress?.(n / doc.numPages);
    }
  } finally {
    await doc.destroy?.();
  }
  const pages = doc.numPages;
  lines = stripFurniture(lines, pages);
  const paras = assemble(lines);
  if (paras.length === 0) {
    throw new Error('I couldn’t find any selectable text in this PDF. If it’s a scan or a photo, try a typed version.');
  }
  const title = paras.find((p) => p.level === 0)?.text;
  return { kind: 'pdf', fileName, title, pages, paras };
}
