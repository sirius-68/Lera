/**
 * Maths is set in two dimensions; a PDF only says where each piece of text sits.
 *
 * Read row by row, a stacked fraction falls apart: its numerator lands on one
 * row, its denominator on the next, and "12(1/2 + 2/3 − 3/4)" comes out as
 * "12 c 1 + 2 − 3 m" followed by a stray "2 3 4". This module puts the pieces
 * back together before rows are formed, working only from positions:
 *
 *  - stackFractions: a short piece directly above another short piece, with
 *    something on the line between them (an operator, a bracket, the number in
 *    front) is a fraction — it becomes one piece, "1/2", on that middle line.
 *  - tidyMathRow: inside one row, big brackets and dots that a symbol font
 *    reports as letters ("c … m", "$") are turned back into ( ) and ·.
 *  - stripCancelMarks: the small numbers written beside crossed-out factors, and
 *    the row they are written on, are left out.
 */
export interface Glyph {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  font: string;
  /** Rebuilt from a numerator and a denominator. */
  frac?: boolean;
}

interface Segment {
  glyphs: Glyph[];
  text: string;
  x0: number;
  x1: number;
  y: number;
  h: number;
}

/** What a numerator or denominator can be made of. */
const SHORT = /^[0-9A-Za-z+\-−–.,()^ ]{1,9}$/;
const ATOM = /^[0-9A-Za-z.]+$/;

/**
 * A fraction in linear text, always in its own brackets: "(1/2)". Unbracketed, "12 · 1/2" reads as (12·1)/2 —
 * the same value, but typeset as one big fraction instead of the book's 12 · ½.
 */
const fracText = (num: string, den: string): string => `(${ATOM.test(num) ? num : `(${num})`}/${ATOM.test(den) ? den : `(${den})`})`;

/** Runs of text on one exact baseline with no wide gap inside: "1", "x + 1", a whole line of prose. */
function segments(inked: Glyph[]): Segment[] {
  const sorted = [...inked].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Glyph[][] = [];
  for (const g of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - g.y) <= 0.12 * Math.max(row[0].h, g.h)) row.push(g);
    else rows.push([g]);
  }
  const out: Segment[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    let cur: Glyph[] = [];
    const close = () => {
      if (!cur.length) return;
      let text = '';
      let end = cur[0].x;
      for (const g of cur) {
        if (text && g.x - end > 0.18 * g.h && !text.endsWith(' ') && !g.str.startsWith(' ')) text += ' ';
        text += g.str;
        end = g.x + g.w;
      }
      out.push({ glyphs: cur, text: text.replace(/\s+/g, ' ').trim(), x0: cur[0].x, x1: end, y: cur[0].y, h: Math.max(...cur.map((g) => g.h)) });
      cur = [];
    };
    let end = -Infinity;
    for (const g of row) {
      if (cur.length && g.x - end > 0.9 * Math.max(g.h, cur[cur.length - 1].h)) close();
      cur.push(g);
      end = g.x + g.w;
    }
    close();
  }
  return out;
}

/**
 * Join numerators to their denominators. Everything else is returned untouched.
 *
 * The test that keeps two ordinary lines of text from being read as a fraction
 * is the piece in the middle: a fraction bar sits level with the operators and
 * numbers around it, so there is always full-size text whose baseline lies
 * between the numerator's and the denominator's. Two lines of prose have
 * nothing between them.
 */
export function stackFractions(glyphs: Glyph[]): Glyph[] {
  const inked = glyphs.filter((g) => g.str.trim());
  if (inked.length < 3) return glyphs;
  const segs = segments(inked);
  const cands = segs.filter((s) => SHORT.test(s.text) && !/^[+\-−–.,]$/.test(s.text));
  if (cands.length < 2) return glyphs;

  const used = new Set<Segment>();
  const drop = new Set<Glyph>();
  const made: Glyph[] = [];

  // nearest pairs first, so a numerator is not claimed by something further away
  const pairs: { a: Segment; b: Segment; d: number }[] = [];
  for (const b of cands) {
    for (const a of cands) {
      if (a === b) continue;
      const H = Math.max(a.h, b.h);
      const d = a.y - b.y;
      if (d < 0.5 * H || d > 1.75 * H) continue;
      const ratio = a.h / b.h;
      if (ratio < 0.75 || ratio > 1.34) continue;
      const wa = a.x1 - a.x0;
      const wb = b.x1 - b.x0;
      if (Math.abs((a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2) > 0.5 * Math.max(wa, wb) + 0.25 * H) continue;
      pairs.push({ a, b, d });
    }
  }
  pairs.sort((p, q) => p.d - q.d);

  for (const { a, b, d } of pairs) {
    if (used.has(a) || used.has(b)) continue;
    const H = Math.max(a.h, b.h);
    const x0 = Math.min(a.x0, b.x0);
    const x1 = Math.max(a.x1, b.x1);
    const own = new Set<Glyph>([...a.glyphs, ...b.glyphs]);
    let anchor: Glyph | null = null;
    let best = Infinity;
    for (const c of inked) {
      if (own.has(c) || drop.has(c)) continue;
      if (c.y <= b.y + 0.22 * d || c.y >= a.y - 0.22 * d) continue;
      if (c.h < 0.9 * H) continue;
      const dist = c.x + c.w < x0 ? x0 - (c.x + c.w) : c.x > x1 ? c.x - x1 : 0;
      if (dist > 3.5 * H) continue;
      // a tall bracket is on the line too, but the fraction should take its size from ordinary text beside it
      const score = dist + (c.h > 1.5 * H ? 100 * H : 0);
      if (score < best) {
        best = score;
        anchor = c;
      }
    }
    if (!anchor) continue;
    used.add(a);
    used.add(b);
    for (const g of own) drop.add(g);

    // "1 2 3" over "2 3 4" reported as two single runs: three fractions, not one
    const nums = a.text.split(' ');
    const dens = b.text.split(' ');
    if (nums.length > 1 && nums.length === dens.length && nums.every((t) => ATOM.test(t)) && dens.every((t) => ATOM.test(t))) {
      const span = Math.max(a.x1 - a.x0, 1);
      let at = 0;
      nums.forEach((n, i) => {
        const x = a.x0 + (span * at) / a.text.length;
        const w = (span * n.length) / a.text.length;
        made.push({ str: fracText(n, dens[i]), x, y: anchor!.y, w, h: Math.min(anchor!.h, 1.5 * H), font: anchor!.font, frac: true });
        at += n.length + 1;
      });
    } else {
      made.push({ str: fracText(a.text, b.text), x: x0, y: anchor.y, w: x1 - x0, h: Math.min(anchor.h, 1.5 * H), font: anchor.font, frac: true });
    }
  }
  if (!made.length) return glyphs;
  return [...glyphs.filter((g) => !drop.has(g)), ...made];
}

/**
 * One row of glyphs, left to right, with its dominant text height, baseline and font:
 * brackets and dots that a symbol font reports as letters are put right.
 */
export function tidyMathRow(row: Glyph[], dom: number, baseline: number, domFont: string): Glyph[] {
  const inked = row.filter((g) => g.str.trim());
  const mathy = inked.some((g) => g.frac) || inked.some((g) => /[=+−–]/.test(g.str));
  if (!mathy) return row;

  let out = row;

  // ── symbol fonts that report their brackets and dots as letters ──
  const byFont = new Map<string, Glyph[]>();
  for (const g of out) if (g.str.trim() && !g.frac && g.font !== domFont) byFont.set(g.font, [...(byFont.get(g.font) ?? []), g]);
  for (const list of byFont.values()) {
    // a real text font in the row would show other letters too; a symbol font only ever shows these
    if (!list.every((g) => /^[cm$]$/.test(g.str.trim()))) continue;
    const fixed = new Map<Glyph, string>();
    const sorted = [...out].filter((g) => g.str.trim()).sort((a, b) => a.x - b.x);
    const open: number[] = [];
    sorted.forEach((g, i) => {
      if (!list.includes(g)) return;
      const s = g.str.trim();
      if (s === 'c') open.push(i);
      else if (s === 'm' && open.length) {
        const from = open.pop()!;
        const between = sorted.slice(from + 1, i);
        const tall = sorted[from].h >= 1.15 * dom || g.h >= 1.15 * dom;
        if (between.length && (tall || between.some((b) => b.frac))) {
          fixed.set(sorted[from], '(');
          fixed.set(g, ')');
        }
      } else if (s === '$' && i > 0 && i < sorted.length - 1 && /[\d)\w]$/.test(sorted[i - 1].str.trim()) && (sorted[i + 1].frac || /^[\d(a-zA-Z]/.test(sorted[i + 1].str.trim()))) {
        fixed.set(g, '·');
      }
    });
    if (fixed.size) out = out.map((g) => (fixed.has(g) ? { ...g, str: fixed.get(g)!, font: domFont, h: Math.min(g.h, dom), y: baseline } : g));
  }
  return out;
}

/**
 * Cancelling: "⁶12 · 1/2₁ + ⁴12 · 2/3₁". The strokes through the numbers are drawings, not text, so
 * what reaches us is the row above again with small digits scattered around it — before a number and
 * raised, or tucked under a denominator. One such digit is dropped. A row with several is working that
 * cannot be shown without its strokes, and reads as a wrong line with them missing: the row goes.
 * Run after stackFractions.
 */
export function stripCancelMarks(glyphs: Glyph[]): Glyph[] {
  const inked = glyphs.filter((g) => g.str.trim());
  const host = new Map<Glyph, Glyph>();
  for (const t of inked) {
    if (t.frac || t.h <= 0 || !/^\d{1,2}$/.test(t.str.trim())) continue;
    for (const n of inked) {
      if (n === t || n.h <= 0 || t.h > 0.74 * n.h) continue;
      const rise = t.y - n.y;
      const gap = n.x - (t.x + t.w);
      // before a number, raised — and not the exponent of whatever stands to its left
      if (!n.frac && /^\d/.test(n.str.trim()) && gap > -0.1 * n.h && gap < 0.4 * n.h && rise > 0.25 * n.h && rise < 1.1 * n.h) {
        const base = inked.some((l) => l !== t && l !== n && Math.abs(l.y - n.y) < 0.2 * n.h && t.x - (l.x + l.w) > -0.1 * n.h && t.x - (l.x + l.w) < 0.15 * n.h && /[\w)]$/.test(l.str.trim()));
        if (!base) {
          host.set(t, n);
          break;
        }
      }
      // under a fraction's denominator, at its right-hand corner
      if (n.frac && rise < -0.45 * n.h && rise > -1.6 * n.h && t.x > n.x && t.x - (n.x + n.w) < 0.9 * n.h) {
        host.set(t, n);
        break;
      }
    }
  }
  if (!host.size) return glyphs;
  const drop = new Set<Glyph>(host.keys());
  // marks on the same row
  const rows = new Map<number, Glyph[]>();
  for (const [mark, n] of host) {
    const key = [...rows.keys()].find((y) => Math.abs(y - n.y) < 0.2 * n.h) ?? n.y;
    rows.set(key, [...(rows.get(key) ?? []), mark]);
  }
  for (const [y, marks] of rows) {
    if (marks.length < 2) continue;
    const h = host.get(marks[0])!.h;
    const row = inked.filter((g) => Math.abs(g.y - y) <= 0.55 * h);
    // only a row that is nothing but working; a sentence with a cancelled factor in it keeps its words
    if (row.some((g) => /[A-Za-z]{4,}/.test(g.str))) continue;
    for (const g of row) drop.add(g);
  }
  return glyphs.filter((g) => !drop.has(g));
}

/**
 * In a sentence, wrap an expression that contains a rebuilt fraction in $…$ so it is typeset:
 * "the problem 12((1/2) + (2/3)) to make" → "the problem $12((1/2) + (2/3))$ to make".
 * The expression is grown outwards from the fraction over neighbouring pieces that are maths, not words.
 */
export function markInlineFractions(text: string): string {
  if (text.includes('$') || !/\([^()\s]+\/[^()\s]+\)|\(\([^()]+\)\/|\/\([^()]+\)\)/.test(text)) return text;
  const tokens = text.split(' ');
  const core = (t: string) => t.replace(/[.,;:!?]+$/, '');
  const mathy = (t: string) => {
    const c = core(t);
    return c.length > 0 && /^[0-9a-zA-Z()+\-−–·*/^=<>.]+$/.test(c) && !/[A-Za-z]{2,}/.test(c);
  };
  const seed = (t: string) => /\//.test(t) && /[()]/.test(t) && mathy(t);
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (!seed(tokens[i])) {
      // look ahead: is this the start of a run that reaches a fraction?
      let j = i;
      while (j < tokens.length && mathy(tokens[j]) && !seed(tokens[j]) && core(tokens[j]) === tokens[j]) j++;
      if (!(j > i && j < tokens.length && seed(tokens[j]))) {
        out.push(tokens[i++]);
        continue;
      }
    }
    let end = i;
    while (end + 1 < tokens.length && core(tokens[end]) === tokens[end] && mathy(tokens[end + 1])) end++;
    let from = i;
    // a lone letter at either end is more likely a word ("a", "I") than a variable — unless an operator ties it in
    const op = (t: string | undefined) => !!t && /^[=+\-−–·*/^<>]+$/.test(t);
    while (from < end && /^[A-Za-z]$/.test(tokens[from]) && !op(tokens[from + 1])) out.push(tokens[from++]);
    let to = end;
    const tail: string[] = [];
    while (to > from && /^[A-Za-z][.,;:!?]*$/.test(tokens[to]) && !op(tokens[to - 1])) tail.unshift(tokens[to--]);
    const run = tokens.slice(from, to + 1).join(' ');
    const punct = /[.,;:!?]+$/.exec(run)?.[0] ?? '';
    out.push(`$${run.slice(0, run.length - punct.length)}$${punct}`, ...tail);
    i = end + 1;
  }
  return out.join(' ');
}
