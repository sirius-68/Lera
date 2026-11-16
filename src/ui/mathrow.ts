/**
 * A line of maths written the way a scientific calculator takes it: pressing
 * "fraction" drops in a fraction with two empty boxes, the cursor sits in the
 * first, and the arrows walk from box to box and out the other side.
 *
 * The line is a small tree: a row of items, where an item is either a plain
 * token ("7", "x", "+", "sin(") or a template with rows of its own. Everything
 * here is plain data and pure functions, so it can be tested without a screen;
 * MathField.tsx draws it.
 */
export type Kind = 'frac' | 'pow' | 'sqrt' | 'ddx' | 'int' | 'defint' | 'lim' | 'abs';

export interface Tpl {
  kind: Kind;
  slots: Row[];
  /** The variable of d/dx, ∫ … dx and lim x→. */
  v?: string;
}
export type Item = string | Tpl;
export type Row = Item[];

/** Where the cursor is: [item, slot, item, slot, …] down to a row, then a position in that row. */
export interface Cursor {
  path: number[];
  pos: number;
}

export interface Field {
  row: Row;
  cur: Cursor;
}

export const SLOTS: Record<Kind, number> = { frac: 2, pow: 1, sqrt: 1, ddx: 1, int: 1, defint: 3, lim: 2, abs: 1 };

export const empty = (): Field => ({ row: [], cur: { path: [], pos: 0 } });

const isTpl = (i: Item | undefined): i is Tpl => typeof i === 'object' && i !== null;

function rowAt(row: Row, path: number[]): Row {
  let r = row;
  for (let i = 0; i < path.length; i += 2) r = (r[path[i]] as Tpl).slots[path[i + 1]];
  return r;
}

/** A copy of the tree with the row at `path` replaced. */
function withRow(row: Row, path: number[], next: Row): Row {
  if (path.length === 0) return next;
  const [at, slot, ...rest] = path;
  const tpl = row[at] as Tpl;
  const slots = tpl.slots.map((s, i) => (i === slot ? withRow(s, rest, next) : s));
  return row.map((it, i) => (i === at ? { ...tpl, slots } : it));
}

const blank = (t: Tpl): boolean => t.slots.every((s) => s.length === 0);

/** Type a token at the cursor. */
export function insert(f: Field, token: string): Field {
  const r = rowAt(f.row, f.cur.path);
  const next = [...r.slice(0, f.cur.pos), token, ...r.slice(f.cur.pos)];
  return { row: withRow(f.row, f.cur.path, next), cur: { path: f.cur.path, pos: f.cur.pos + 1 } };
}

/** Type several plain characters, one token each ("12" → "1", "2"). */
export function insertText(f: Field, text: string): Field {
  let out = f;
  for (const ch of text) out = insert(out, ch);
  return out;
}

/**
 * Drop in a template and put the cursor in its first box.
 * A fraction takes the number or bracket just before the cursor as its top, the way a calculator does:
 * typing 3, then fraction, gives 3 over an empty box.
 */
export function template(f: Field, kind: Kind, v?: string): Field {
  const r = rowAt(f.row, f.cur.path);
  const pos = f.cur.pos;
  const tpl: Tpl = { kind, slots: Array.from({ length: SLOTS[kind] }, () => [] as Row), v };
  let from = pos;
  if (kind === 'frac') {
    // digits, a decimal point and letters directly before the cursor; or one whole template
    while (from > 0 && typeof r[from - 1] === 'string' && /^[0-9a-zA-Z.]$/.test(r[from - 1] as string)) from--;
    if (from === pos && pos > 0 && isTpl(r[pos - 1]) && (r[pos - 1] as Tpl).kind !== 'pow') from = pos - 1;
    tpl.slots[0] = r.slice(from, pos);
  }
  const next = [...r.slice(0, from), tpl, ...r.slice(pos)];
  const first = kind === 'frac' && tpl.slots[0].length ? 1 : order(tpl)[0];
  return { row: withRow(f.row, f.cur.path, next), cur: { path: [...f.cur.path, from, first], pos: 0 } };
}

/** Backspace. Returns the same field when there is nothing left to delete. */
export function del(f: Field): Field {
  const { path, pos } = f.cur;
  const r = rowAt(f.row, path);
  if (pos > 0) {
    const prev = r[pos - 1];
    // step into a filled template rather than wiping it in one press
    if (isTpl(prev) && !blank(prev)) {
      let slot = prev.slots.length - 1;
      while (slot > 0 && prev.slots[slot].length === 0) slot--;
      return { row: f.row, cur: { path: [...path, pos - 1, slot], pos: prev.slots[slot].length } };
    }
    return { row: withRow(f.row, path, [...r.slice(0, pos - 1), ...r.slice(pos)]), cur: { path, pos: pos - 1 } };
  }
  if (path.length === 0) return f;
  // at the start of a box: an empty template goes; otherwise step back to the box before, or out
  const parentPath = path.slice(0, -2);
  const at = path[path.length - 2];
  const slot = path[path.length - 1];
  const parent = rowAt(f.row, parentPath);
  const tpl = parent[at] as Tpl;
  if (blank(tpl)) return { row: withRow(f.row, parentPath, [...parent.slice(0, at), ...parent.slice(at + 1)]), cur: { path: parentPath, pos: at } };
  if (slot > 0) return { row: f.row, cur: { path: [...parentPath, at, slot - 1], pos: tpl.slots[slot - 1].length } };
  // first box of a fraction that still has content: dissolve it back into the row
  const flat = tpl.slots.flat();
  return { row: withRow(f.row, parentPath, [...parent.slice(0, at), ...flat, ...parent.slice(at + 1)]), cur: { path: parentPath, pos: at } };
}

/** The order boxes are visited in: a definite integral takes its body first, then the lower and upper limits. */
const ORDER: Partial<Record<Kind, number[]>> = { defint: [2, 0, 1] };
const order = (t: Tpl): number[] => ORDER[t.kind] ?? t.slots.map((_, i) => i);

/** Move one step left or right, into and out of boxes. */
export function move(f: Field, d: -1 | 1): Field {
  const { path, pos } = f.cur;
  const r = rowAt(f.row, path);
  if (d === 1) {
    if (pos < r.length) {
      const it = r[pos];
      if (isTpl(it)) return { row: f.row, cur: { path: [...path, pos, order(it)[0]], pos: 0 } };
      return { row: f.row, cur: { path, pos: pos + 1 } };
    }
    if (path.length === 0) return f;
    const parentPath = path.slice(0, -2);
    const at = path[path.length - 2];
    const tpl = rowAt(f.row, parentPath)[at] as Tpl;
    const seq = order(tpl);
    const i = seq.indexOf(path[path.length - 1]);
    if (i < seq.length - 1) return { row: f.row, cur: { path: [...parentPath, at, seq[i + 1]], pos: 0 } };
    return { row: f.row, cur: { path: parentPath, pos: at + 1 } };
  }
  if (pos > 0) {
    const it = r[pos - 1];
    if (isTpl(it)) {
      const seq = order(it);
      const slot = seq[seq.length - 1];
      return { row: f.row, cur: { path: [...path, pos - 1, slot], pos: it.slots[slot].length } };
    }
    return { row: f.row, cur: { path, pos: pos - 1 } };
  }
  if (path.length === 0) return f;
  const parentPath = path.slice(0, -2);
  const at = path[path.length - 2];
  const tpl = rowAt(f.row, parentPath)[at] as Tpl;
  const seq = order(tpl);
  const i = seq.indexOf(path[path.length - 1]);
  if (i > 0) return { row: f.row, cur: { path: [...parentPath, at, seq[i - 1]], pos: tpl.slots[seq[i - 1]].length } };
  return { row: f.row, cur: { path: parentPath, pos: at } };
}

/** Put the cursor at a place that was tapped. */
export const place = (f: Field, path: number[], pos: number): Field => ({ row: f.row, cur: { path, pos: Math.max(0, Math.min(rowAt(f.row, path).length, pos)) } });

const simple = (s: string): boolean => /^-?[0-9a-zA-Z.]+$/.test(s);

/** The line as text the checker reads: (a)/(b), ^(n), sqrt(…), d/dx(…), ∫ … dx, ∫[a, b] … dx, lim x→a (…). */
export function toText(row: Row): string {
  let out = '';
  for (const it of row) {
    if (!isTpl(it)) {
      out += it;
      continue;
    }
    const s = it.slots.map(toText);
    const v = it.v ?? 'x';
    switch (it.kind) {
      case 'frac':
        out += `(${s[0]})/(${s[1]})`;
        break;
      case 'pow':
        out += simple(s[0]) && !s[0].startsWith('-') && s[0].length === 1 ? `^${s[0]}` : `^(${s[0]})`;
        break;
      case 'sqrt':
        out += `sqrt(${s[0]})`;
        break;
      case 'abs':
        out += `abs(${s[0]})`;
        break;
      case 'ddx':
        out += `d/d${v}(${s[0]})`;
        break;
      case 'int':
        out += `∫ (${s[0]}) d${v}`;
        break;
      case 'defint':
        out += `∫[${s[0]}, ${s[1]}] (${s[2]}) d${v}`;
        break;
      case 'lim':
        out += `lim ${v}→${s[0]} (${s[1]})`;
        break;
    }
  }
  return out;
}

/** True when some box has been left empty. */
export function hasGap(row: Row): boolean {
  return row.some((it) => isTpl(it) && it.slots.some((s) => s.length === 0 || hasGap(s)));
}

/** A line of plain text (a previous line pulled back for editing) as a row of tokens. */
export function fromText(text: string): Field {
  const row: Row = [];
  const words = /^(sqrt\(|sin\(|cos\(|tan\(|ln\(|log\(|abs\(|no solution|all real numbers| or |pi|inf|DNE)/;
  let rest = text;
  while (rest) {
    const w = words.exec(rest);
    const tok = w ? w[0] : rest[0];
    row.push(tok);
    rest = rest.slice(tok.length);
  }
  return { row, cur: { path: [], pos: row.length } };
}
