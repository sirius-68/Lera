import { cleanTex, isTexLine } from '../engine/tex';
import type { Block, LeraDoc } from './types';

/**
 * Puts right what a reading got wrong, for notes that are already kept and for whatever a model sends back:
 *   a formula in LaTeX that was taken for a heading (or a sentence) becomes a formula again, and goes back
 *   into the worked example it was cut out of;
 *   "Example 2 (disk). Rotate…" keeps "(disk)" in its title instead of at the head of its first line.
 * Returns the very same list when there was nothing to put right.
 */
export function repairBlocks(blocks: Block[]): Block[] {
  let changed = false;
  const out: Block[] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if ((b.t === 'h' || b.t === 'p') && isTexLine(b.text.replace(/\$/g, ''))) {
      const text = cleanTex(b.text.replace(/\$/g, ''));
      changed = true;
      if (b.t === 'h' && last?.t === 'example' && last.lines.length < 14) out[out.length - 1] = { ...last, lines: [...last.lines, text] };
      else out.push({ t: 'math', text });
      continue;
    }
    if (b.t === 'example') {
      const tag = /^\(([^)]{1,40})\)[.:]?\s*/.exec(b.lines[0] ?? '');
      if (tag && !b.title.includes('(')) {
        const rest = b.lines[0].slice(tag[0].length);
        out.push({ ...b, title: `${b.title} (${tag[1]})`, lines: rest ? [rest, ...b.lines.slice(1)] : b.lines.slice(1) });
        changed = true;
        continue;
      }
    }
    out.push(b);
  }
  return changed ? out : blocks;
}

export function repairDoc(doc: LeraDoc): LeraDoc {
  let changed = false;
  const units = doc.units.map((u) => {
    const topics = u.topics.map((t) => {
      const blocks = repairBlocks(t.blocks);
      if (blocks === t.blocks) return t;
      changed = true;
      return { ...t, blocks };
    });
    return changed ? { ...u, topics } : u;
  });
  return changed ? { ...doc, units } : doc;
}
