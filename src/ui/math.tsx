import katex from 'katex';
import { AS_WRITTEN, mathLatex, writtenLatex } from '../engine/latex';
import { cleanTex, hasTex, markTex } from '../engine/tex';
import { prettyInline } from '../ingest/text';

const cache = new Map<string, string | null>();

/** Linear maths text ("3x^2 + 4 = 19") → typeset HTML, or null when it isn't maths the engine can read. */
export function typeset(text: string, display = false): string | null {
  const key = (display ? 'D:' : 'I:') + text;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let html: string | null = null;
  try {
    // a formula quoted from a document is set the way the document wrote it; anything it cannot place falls back to the engine
    const body = text.startsWith(AS_WRITTEN) ? text.slice(1) : text;
    // maths already written in LaTeX (from a file, or by the AI) is drawn as it stands; the engine's own notation is converted
    const latex = hasTex(body) ? cleanTex(body) : text.startsWith(AS_WRITTEN) ? writtenLatex(body) ?? mathLatex(body) : mathLatex(text);
    if (latex) html = katex.renderToString(latex, { displayMode: display, throwOnError: false, output: 'html', strict: 'ignore' });
  } catch {
    html = null;
  }
  if (cache.size > 800) cache.clear();
  cache.set(key, html);
  return html;
}

export function renderLatex(latex: string, display = false): string {
  try {
    return katex.renderToString(latex, { displayMode: display, throwOnError: false, output: 'html', strict: 'ignore' });
  } catch {
    return '';
  }
}

interface MathProps {
  text?: string;
  latex?: string;
  block?: boolean;
  className?: string;
}

export function MathView({ text, latex, block, className = '' }: MathProps) {
  const html = latex ? renderLatex(latex, false) : text ? typeset(text) : null;
  if (!html) return <span className={`mathv raw ${block ? 'block' : ''} ${className}`}>{prettyInline(text ?? latex ?? '')}</span>;
  return <span className={`mathv ${block ? 'block' : ''} ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

export interface Tok {
  t: 'text' | 'math' | 'bold';
  s: string;
  /** Offsets into the original string, including any markers. */
  start: number;
  end: number;
}

/** Split a line of notes into plain text, `$maths$` and `**bold**`. */
export function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  const re = /\$([^$\n]+)\$|\*\*([^*\n]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: 'text', s: text.slice(last, m.index), start: last, end: m.index });
    if (m[1] !== undefined) out.push({ t: 'math', s: m[1], start: m.index, end: re.lastIndex });
    else out.push({ t: 'bold', s: m[2], start: m.index, end: re.lastIndex });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ t: 'text', s: text.slice(last), start: last, end: text.length });
  return out;
}

/** A sentence that may contain `$maths$` and `**bold**`. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {tokenize(markTex(text)).map((tok, i) =>
        tok.t === 'math' ? <MathView key={i} text={tok.s} /> : tok.t === 'bold' ? <strong key={i}>{tok.s}</strong> : <span key={i}>{tok.s}</span>,
      )}
    </>
  );
}
