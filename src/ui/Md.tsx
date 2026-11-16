import type { ReactNode } from 'react';
import { isTexLine } from '../engine/tex';
import { MathView, RichText } from './math';

/**
 * A message as the AI writes it: paragraphs, formulas on their own line (`$$…$$`, or a line that is only
 * LaTeX), bullet and numbered lists, small headings, and tables written with `|`.
 * Everything inside a line still goes through RichText, so `$maths$` and `**bold**` are drawn.
 */
/** Cut a table row at its bars, leaving alone the bars inside `$maths$` (as in `$\ln|\sec x|$`) and escaped ones. */
export function cells(row: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inMath = false;
  const body = row.trim().replace(/^\|/, '').replace(/\|$/, '');
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '\\' && i + 1 < body.length) {
      cur += body[i + 1] === '|' && !inMath ? '|' : ch + body[i + 1];
      i++;
    } else if (ch === '$') {
      inMath = !inMath;
      cur += ch;
    } else if (ch === '|' && !inMath) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
const isRow = (l: string): boolean => /^\s*\|.*\|\s*$/.test(l);
const isRule = (l: string): boolean => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);

export function Table({ rows, head: hasHead = true }: { rows: string[][]; head?: boolean }) {
  if (!rows.length) return null;
  const head = hasHead ? rows[0] : null;
  const body = hasHead ? rows.slice(1) : rows;
  return (
    <div className="md-table">
      <table>
        {head && (
          <thead>
            <tr>{head.map((c, i) => <th key={i}><RichText text={c} /></th>)}</tr>
          </thead>
        )}
        <tbody>
          {body.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}><RichText text={c} /></td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Md({ text }: { text: string }) {
  // a formula fenced with $$ may run over several lines: bring each onto one line of its own first
  const src = text.replace(/\$\$([\s\S]+?)\$\$/g, (_m, body: string) => `\n$$${body.replace(/\s*\n\s*/g, ' ').trim()}$$\n`).replace(/\\\[([\s\S]+?)\\\]/g, (_m, body: string) => `\n$$${body.replace(/\s*\n\s*/g, ' ').trim()}$$\n`);
  const lines = src.split('\n');
  const out: ReactNode[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(<p key={out.length}>{para.map((l, i) => <span key={i}>{i > 0 && <br />}<RichText text={l} /></span>)}</p>);
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    const t = line.trim();
    if (!t) {
      flush();
      continue;
    }
    const display = /^\$\$(.+)\$\$$/.exec(t);
    if (display || isTexLine(t)) {
      flush();
      out.push(<div key={out.length} className="md-math"><MathView text={display ? display[1] : t} block /></div>);
      continue;
    }
    if (isRow(t) && lines[i + 1] !== undefined && isRule(lines[i + 1])) {
      flush();
      const rows = [cells(t)];
      i += 2;
      while (i < lines.length && isRow(lines[i])) rows.push(cells(lines[i++]));
      i--;
      out.push(<Table key={out.length} rows={rows} />);
      continue;
    }
    const head = /^#{1,4}\s+(.*)$/.exec(t);
    if (head) {
      flush();
      out.push(<p key={out.length} className="md-h"><RichText text={head[1]} /></p>);
      continue;
    }
    const item = /^(?:[-*•]|(\d+)[.)])\s+(.*)$/.exec(t);
    if (item) {
      flush();
      const ordered = item[1] !== undefined;
      const items = [item[2]];
      while (i + 1 < lines.length) {
        const next = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(lines[i + 1].trim());
        if (!next) break;
        items.push(next[1]);
        i++;
      }
      const lis = items.map((it, k) => <li key={k}><RichText text={it} /></li>);
      out.push(ordered ? <ol key={out.length} className="md-list">{lis}</ol> : <ul key={out.length} className="md-list">{lis}</ul>);
      continue;
    }
    para.push(t);
  }
  flush();
  return <>{out}</>;
}
