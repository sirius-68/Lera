import { ReactNode, useLayoutEffect, useRef } from 'react';
import katex from 'katex';
import { AS_WRITTEN, mathLatex } from '../engine/latex';
import { mathRuns, plainLatex } from '../engine/mathtext';
import { cleanTex, hasTex } from '../engine/tex';
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
    // maths already written in LaTeX (from a file, or by the AI) is drawn as it stands; a formula quoted from a document
    // keeps its own shape; the engine's notation goes through the engine, and whatever it cannot read is still drawn
    const latex = hasTex(body) ? cleanTex(body) : text.startsWith(AS_WRITTEN) ? plainLatex(body) : mathLatex(text) ?? plainLatex(text);
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

/**
 * A formula on a line of its own. One that is wider than the screen is set smaller until it fits;
 * past the point where it would be too small to read, it scrolls sideways instead.
 */
export function Fit({ className = '', children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.fontSize = '';
    if (el.scrollWidth <= el.clientWidth + 1) return;
    const cs = getComputedStyle(el);
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const scale = Math.max(0.6, ((el.clientWidth - pad) / (el.scrollWidth - pad)) * 0.98);
    el.style.fontSize = `${(parseFloat(cs.fontSize) * scale).toFixed(2)}px`;
  });
  return <div ref={ref} className={className}>{children}</div>;
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
  // a long formula inside a sentence may break at its signs, like the words around it
  const long = !block && (text ?? latex ?? '').length > 30;
  return <span className={`mathv ${block ? 'block' : ''} ${long ? 'long' : ''} ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

export interface Tok {
  t: 'text' | 'math' | 'bold';
  s: string;
  /** Offsets into the original string, including any markers. */
  start: number;
  end: number;
}

/**
 * Split a line of notes into plain text, maths and `**bold**`. Maths is whatever sits inside `$…$` or `\\(…\\)`,
 * and also any formula written straight into the sentence ("so L = 14/3"), which is found here so that every
 * screen draws it the same way. Offsets stay those of the line as it was given.
 */
export function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  const plainRun = (from: number, to: number) => {
    const part = text.slice(from, to);
    let at = 0;
    for (const r of mathRuns(part)) {
      if (r.start > at) out.push({ t: 'text', s: part.slice(at, r.start), start: from + at, end: from + r.start });
      out.push({ t: 'math', s: AS_WRITTEN + part.slice(r.start, r.end), start: from + r.start, end: from + r.end });
      at = r.end;
    }
    if (at < part.length) out.push({ t: 'text', s: part.slice(at), start: from + at, end: to });
  };
  const re = /\$\$([^$]+)\$\$|\$([^$\n]+)\$|\\\((.+?)\\\)|\\\[(.+?)\\\]|\*\*([^*\n]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) plainRun(last, m.index);
    const maths = m[1] ?? m[2] ?? m[3] ?? m[4];
    if (maths !== undefined) out.push({ t: 'math', s: maths, start: m.index, end: re.lastIndex });
    else out.push({ t: 'bold', s: m[5], start: m.index, end: re.lastIndex });
    last = re.lastIndex;
  }
  if (last < text.length) plainRun(last, text.length);
  return out;
}

/** A sentence that may contain `$maths$` and `**bold**`. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {tokenize(text).map((tok, i) =>
        tok.t === 'math' ? <MathView key={i} text={tok.s} /> : tok.t === 'bold' ? <strong key={i}>{tok.s}</strong> : <span key={i}>{tok.s}</span>,
      )}
    </>
  );
}
