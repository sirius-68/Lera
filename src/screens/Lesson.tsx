import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { cleanPath } from '../engine/analyze';
import { conceptOf } from '../engine/concepts';
import { functionOfLine } from '../ingest/calc';
import { isMathLine, plain } from '../ingest/structure';
import { prettyInline } from '../ingest/text';
import { isTexLine } from '../engine/tex';
import { Block, LeraDoc, Topic } from '../ingest/types';
import { Lera } from '../mascot/Lera';
import { actions, useStore } from '../store';
import { exampleProblem, findTopic, statusOf, streak, topicProblems } from '../store/learner';
import { MorePractice } from './MorePractice';
import { back, go, openOverlay, replace, Route } from '../store/nav';
import { Highlight, Note } from '../store/types';
import { Button3D, LeraSays, Seg, Sheet, haptic, toast } from '../ui/kit';
import { Celebration } from '../ui/Celebrate';
import { Icon } from '../ui/icons';
import { Graph } from '../ui/Graph';
import { Fit, MathView, tokenize } from '../ui/math';
import { Table } from '../ui/Md';
import { StepList } from '../ui/Steps';
import { AS_WRITTEN } from '../engine/latex';
import { promptText, t as tr, tn } from '../i18n';

export const HIGHLIGHT_COLORS = ['#22c55e', '#3b82f6', '#06b6d4', '#f59e0b', '#ec4899', '#a855f7', '#ef4444', '#6366f1'];

const tintOf = (hex: string): string => `${hex}40`;

/* ───────────── text with highlights and glossary terms ───────────── */

interface Piece {
  start: number;
  end: number;
  kind: 'text' | 'math' | 'bold';
  s: string;
  hl?: Highlight;
  term?: string;
}

function pieces(text: string, highlights: Highlight[], termRe: RegExp | null, usedTerms: Set<string>): Piece[] {
  const out: Piece[] = [];
  for (const tok of tokenize(text)) {
    const hlFor = (a: number, b: number) => highlights.find((h) => h.start < b && a < h.end);
    if (tok.t !== 'text') {
      out.push({ start: tok.start, end: tok.end, kind: tok.t, s: tok.s, hl: hlFor(tok.start, tok.end) });
      continue;
    }
    // cut the run wherever a highlight or a glossary term starts or ends
    const cuts = new Set<number>([tok.start, tok.end]);
    for (const h of highlights) {
      if (h.start > tok.start && h.start < tok.end) cuts.add(h.start);
      if (h.end > tok.start && h.end < tok.end) cuts.add(h.end);
    }
    const terms: { a: number; b: number; key: string }[] = [];
    if (termRe) {
      termRe.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = termRe.exec(tok.s))) {
        const key = m[1].toLowerCase();
        if (usedTerms.has(key)) continue;
        usedTerms.add(key);
        const a = tok.start + m.index;
        const b = a + m[0].length;
        terms.push({ a, b, key });
        cuts.add(a);
        cuts.add(b);
      }
    }
    const marks = [...cuts].sort((x, y) => x - y);
    for (let i = 0; i < marks.length - 1; i++) {
      const a = marks[i];
      const b = marks[i + 1];
      out.push({ start: a, end: b, kind: 'text', s: text.slice(a, b), hl: hlFor(a, b), term: terms.find((t) => t.a <= a && b <= t.b)?.key });
    }
  }
  return out;
}

interface SegProps {
  text: string;
  block: number;
  item: number;
  ctx: ReaderCtx;
}

interface ReaderCtx {
  topicId: string;
  highlights: Highlight[];
  notes: Note[];
  termRe: RegExp | null;
  usedTerms: Set<string>;
  texts: Map<string, string>;
  onTerm: (term: string, el: HTMLElement) => void;
  onNote: (n: Note) => void;
}

/** One selectable run of lesson text. Offsets in data-o refer to the raw string, so highlights survive re-rendering. */
function SegText({ text, block, item, ctx }: SegProps) {
  const key = `${block}:${item}`;
  ctx.texts.set(key, text);
  const mine = ctx.highlights.filter((h) => h.block === block && h.item === item);
  const notes = ctx.notes.filter((n) => n.block === block && n.item === item);
  const parts = pieces(text, mine, ctx.termRe, ctx.usedTerms);
  return (
    <span data-seg={key} data-len={text.length}>
      {parts.map((p) => {
        const style = p.hl ? (p.hl.underline ? { textDecoration: `underline 2.5px ${p.hl.color}`, textUnderlineOffset: 4 } : { background: tintOf(p.hl.color) }) : undefined;
        const common = { 'data-o': p.start, 'data-hl': p.hl?.id, style, className: p.hl ? 'hl' : undefined };
        if (p.kind === 'math') {
          return (
            <span key={p.start} {...common} data-math={p.end - p.start}>
              <MathView text={p.s} />
            </span>
          );
        }
        if (p.kind === 'bold') {
          // the visible text starts after the two asterisks
          return (
            <strong key={p.start} {...common} data-o={p.start + 2}>
              {p.s}
            </strong>
          );
        }
        if (p.term) {
          return (
            <span
              key={p.start}
              {...common}
              className={`term ${p.hl ? 'hl' : ''}`}
              role="button"
              tabIndex={0}
              onClick={(e: ReactMouseEvent<HTMLElement>) => {
                const sel = window.getSelection();
                if (sel && !sel.isCollapsed) return;
                e.stopPropagation();
                ctx.onTerm(p.term as string, e.currentTarget);
              }}
            >
              {p.s}
            </span>
          );
        }
        return (
          <span key={p.start} {...common}>
            {p.s}
          </span>
        );
      })}
      {notes.map((n) => (
        <button key={n.id} className="note-pin" onClick={() => ctx.onNote(n)} aria-label={tr('Your note: {0}', { 0: n.title || 'untitled' })}>
          <Icon name="note" size={14} />
        </button>
      ))}
    </span>
  );
}

function BlockView({ block, index, ctx }: { block: Block; index: number; ctx: ReaderCtx }) {
  switch (block.t) {
    case 'h':
      return <h3 className="rd-h"><SegText text={block.text} block={index} item={0} ctx={ctx} /></h3>;
    case 'p':
      return <p className="rd-p"><SegText text={block.text} block={index} item={0} ctx={ctx} /></p>;
    case 'math':
      return <MathBlock text={plain(block.text)} steps={block.steps} caption={block.caption} index={index} ctx={ctx} />;
    case 'graph':
      return <Graph fns={block.fns} caption={block.text ? plain(block.text) : undefined} />;
    case 'list': {
      const items = block.items.map((it, i) => <li key={i}><SegText text={it} block={index} item={i} ctx={ctx} /></li>);
      return block.ordered ? <ol className="rd-list">{items}</ol> : <ul className="rd-list">{items}</ul>;
    }
    case 'example':
      return <ExampleCard block={block} index={index} ctx={ctx} />;
    case 'table':
      return <Table rows={block.rows} head={block.head} />;
    case 'note':
      return (
        <aside className="rd-note">
          <span className="label" style={{ color: 'var(--brand-d)' }}>{block.label}</span>
          <p className="cap"><SegText text={block.text} block={index} item={0} ctx={ctx} /></p>
        </aside>
      );
  }
}

/** A display equation. When it defines a function of x, it can be drawn on the spot. */
function MathBlock({ text, steps, caption, index, ctx }: { text: string; steps?: string[]; caption?: string; index: number; ctx: ReaderCtx }) {
  const [open, setOpen] = useState(false);
  const fnText = useMemo(() => (steps ? null : functionOfLine(text)), [text, steps]);
  return (
    <>
      <Fit className={`rd-math ${steps ? 'worked' : ''}`}>
        {steps ? (
          // working over several rows: the expression, then each row that carries on from it, signs lined up
          <div className="rd-steps">
            <span />
            <SegText text={`$${AS_WRITTEN}${text}$`} block={index} item={0} ctx={ctx} />
            {steps.map((row, k) => {
              const rel = /^([=≈<>≤≥])\s*/.exec(row);
              return (
                <Fragment key={k}>
                  <span className="rd-rel">{rel ? rel[1] : ''}</span>
                  <SegText text={`$${AS_WRITTEN}${rel ? row.slice(rel[0].length) : row}$`} block={index} item={k + 1} ctx={ctx} />
                </Fragment>
              );
            })}
          </div>
        ) : (
          <SegText text={`$${caption ? AS_WRITTEN : ''}${text}$`} block={index} item={0} ctx={ctx} />
        )}
        {caption && <span className="rd-cap">{caption}</span>}
        {fnText && (
          <button className="graph-it" onClick={() => { haptic(5); setOpen(!open); }} aria-expanded={open}>
            <Icon name="chart" size={15} /> {open ? tr('Hide graph') : tr('Graph it')}
          </button>
        )}
      </Fit>
      {open && fnText && <Graph fns={[fnText]} />}
    </>
  );
}

/** Worked examples from the notes are revealed a line at a time: predict, then look. Each one can also be tried, or explained. */
function ExampleCard({ block, index, ctx }: { block: Extract<Block, { t: 'example' }>; index: number; ctx: ReaderCtx }) {
  const [shown, setShown] = useState(1);
  const total = block.lines.length;
  // the example's own question, as something to solve: taken from its first line (or its title, when the question sits there)
  const problem = useMemo(() => exampleProblem(block, index, ctx.topicId), [block, index, ctx.topicId]);
  // the engine's own worked route, when it can solve the question: offline, and every line of it checked
  const route = useMemo(() => (problem ? cleanPath(problem) : []), [problem]);
  const [explained, setExplained] = useState(false);
  const askLera = () => {
    haptic(5);
    openOverlay({ name: 'ask', topicId: ctx.topicId, seed: tr('Explain this example to me step by step, and say why each step is allowed: {0}', { 0: block.lines.map((l) => plain(l)).join(' ; ') }) });
  };
  return (
    <div className="rd-example">
      <span className="label">{block.title || tr('Example')}</span>
      <div className="col" style={{ gap: 8, marginTop: 8 }}>
        {block.lines.slice(0, shown).map((line, i) => (
          <div key={i} className="ex-line">
            {isMathLine(plain(line)) || isTexLine(plain(line)) ? (
              // a line that is only maths is one piece: it is selected, highlighted and saved whole
              <Fit className="ex-math"><SegText text={`$${AS_WRITTEN}${plain(line)}$`} block={index} item={i} ctx={ctx} /></Fit>
            ) : (
              <p className="rd-p" style={{ margin: 0 }}><SegText text={line} block={index} item={i} ctx={ctx} /></p>
            )}
          </div>
        ))}
      </div>
      <div className="ex-acts">
        {shown < total && (
          <button
            className="reveal"
            onClick={() => {
              haptic(5);
              setShown(shown + 1);
            }}
          >
            {tr('Next line')}{' '}<span className="faint">· {shown}/{total}</span> <Icon name="down" size={16} />
          </button>
        )}
        {problem && (
          <button className="reveal alt" onClick={() => { haptic(5); go({ name: 'session', problems: [problem], title: block.title || tr('Example') }); }}>
            <Icon name="pencil" size={15} />{' '}{tr('Try it myself')}
          </button>
        )}
        <button
          className="reveal alt"
          aria-expanded={route.length > 1 ? explained : undefined}
          onClick={() => {
            if (route.length > 1 && problem) {
              haptic(5);
              setExplained(!explained);
            } else askLera();
          }}
        >
          <Icon name="chat" size={15} />{' '}{tr('Explain it')}
        </button>
      </div>
      {explained && problem && route.length > 1 && (
        <div className="ex-explain">
          <span className="label">{tr('Step by step')}</span>
          <StepList problem={problem} steps={route} />
          <button className="linkbtn" onClick={askLera}>
            <Icon name="chat" size={14} /> {tr('Ask Lera about this example')}
          </button>
        </div>
      )}
    </div>
  );
}

/* ───────────── bite-size pages ───────────── */

interface Page {
  start: number;
  end: number;
}

const weightOf = (b: Block): number =>
  b.t === 'p' || b.t === 'note' ? b.text.length + 40 : b.t === 'table' ? b.rows.length * 70 + 60 : b.t === 'list' ? b.items.join(' ').length + 60 : b.t === 'example' ? 420 : b.t === 'graph' ? 560 : b.t === 'math' ? 150 : 50;

/**
 * A lesson is read a screenful at a time. A new page starts at every sub-heading from the notes,
 * and a long stretch without one is cut at a sensible place — never straight after a heading,
 * and never between a sentence ending in a colon and what it introduces.
 */
export function paginate(blocks: Block[]): Page[] {
  const pages: Page[] = [];
  let start = 0;
  let weight = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const prev = blocks[i - 1];
    const introduces = !!prev && (prev.t === 'h' || ((prev.t === 'p' || prev.t === 'note') && /:\s*$/.test(prev.text)));
    const cut = i > start && ((b.t === 'h' && weight > 220) || (weight > 1250 && !introduces && b.t !== 'graph'));
    if (cut) {
      pages.push({ start, end: i });
      start = i;
      weight = 0;
    }
    weight += weightOf(b);
  }
  if (blocks.length > start || pages.length === 0) pages.push({ start, end: blocks.length });
  // a stub at the very end reads better joined to the page before it
  if (pages.length > 1) {
    const last = pages[pages.length - 1];
    const size = blocks.slice(last.start, last.end).reduce((n, b) => n + weightOf(b), 0);
    if (size < 180 && blocks[last.start]?.t !== 'h') {
      pages.pop();
      pages[pages.length - 1].end = last.end;
    }
  }
  return pages;
}

/** Where the reader left off in each lesson, for as long as the app stays open. */
const lastPage = new Map<string, number>();

/* ───────────── selection → offsets ───────────── */

interface Picked {
  block: number;
  item: number;
  start: number;
  end: number;
  text: string;
  x: number;
  top: number;
  bottom: number;
  hl?: Highlight;
}

/**
 * A selection boundary → an offset in the raw text of one run.
 *
 * The browser may report the boundary inside a text node, inside typeset maths, or between two
 * elements (common when a selection handle is dragged to the edge of a formula or a term). Each
 * piece of a run knows where it starts in the raw string, so the boundary is placed by asking,
 * piece by piece, whether it falls before, inside or after it.
 */
function locate(node: Node, offset: number, edge: 'start' | 'end'): { seg: HTMLElement; at: number } | null {
  const host = node.nodeType === 3 ? node.parentElement : (node as HTMLElement);
  if (!host) return null;
  let seg = host.closest<HTMLElement>('[data-seg]');
  if (!seg && node.nodeType !== 3) {
    // the boundary sits on a container: use the run just inside it
    const kids = (node as HTMLElement).childNodes;
    const near = (edge === 'start' ? kids[offset] : kids[offset - 1]) as HTMLElement | undefined;
    const inner = near && near.nodeType === 1 ? (near.matches('[data-seg]') ? near : near.querySelector<HTMLElement>('[data-seg]')) : null;
    if (inner) return { seg: inner, at: edge === 'start' ? 0 : Number(inner.dataset.len ?? 0) };
  }
  if (!seg) return null;
  const len = Number(seg.dataset.len ?? 0);
  const point = document.createRange();
  try {
    point.setStart(node, offset);
  } catch {
    return { seg, at: edge === 'start' ? 0 : len };
  }
  point.collapse(true);
  const pieces = [...seg.querySelectorAll<HTMLElement>('[data-o]')];
  let at = edge === 'start' ? len : 0;
  for (const piece of pieces) {
    const o = Number(piece.dataset.o ?? 0);
    const size = piece.dataset.math ? Number(piece.dataset.math) : (piece.textContent ?? '').length;
    const whole = document.createRange();
    whole.selectNodeContents(piece);
    const afterStart = point.compareBoundaryPoints(Range.START_TO_START, whole) >= 0;
    const beforeEnd = point.compareBoundaryPoints(Range.END_TO_END, whole) <= 0;
    if (afterStart && beforeEnd) {
      // inside this piece: exact for plain text, the whole formula for maths
      if (piece.dataset.math) return { seg, at: edge === 'start' ? o : o + size };
      if (node.nodeType === 3 && node.parentElement === piece) return { seg, at: Math.min(len, o + offset) };
      return { seg, at: edge === 'start' ? o : o + size };
    }
    if (edge === 'start' && !afterStart) {
      // the first piece that begins after the boundary
      at = Math.min(at, o);
    }
    if (edge === 'end' && !beforeEnd) {
      // the last piece that ends before the boundary
      at = Math.max(at, o + size);
    }
  }
  return { seg, at: Math.max(0, Math.min(len, at)) };
}

/* ───────────── the screen ───────────── */

export function LessonScreen({ route, dir }: { route: Extract<Route, { name: 'lesson' }>; dir: number }) {
  const docs = useStore((s) => s.docs);
  const allHighlights = useStore((s) => s.highlights);
  const allNotes = useStore((s) => s.notes);
  const attempts = useStore((s) => s.attempts);
  const found = findTopic(docs, route.topicId);
  const [tab, setTab] = useState<'lesson' | 'practice'>(route.tab ?? 'lesson');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [term, setTerm] = useState<{ key: string; x: number; top: number } | null>(null);
  const [noteDraft, setNoteDraft] = useState<Picked | null>(null);
  const [viewNote, setViewNote] = useState<Note | null>(null);
  const [pageNo, setPageNo] = useState(() => lastPage.get(route.topicId) ?? 0);
  const [turn, setTurn] = useState<1 | -1>(1);
  const [chapterDone, setChapterDone] = useState(false);
  const scroller = useRef<HTMLDivElement | null>(null);
  const screen = useRef<HTMLDivElement | null>(null);
  const reader = useRef<HTMLDivElement | null>(null);
  const progress = useRef<HTMLElement | null>(null);
  const texts = useRef(new Map<string, string>());

  useEffect(() => {
    if (found) actions.openTopic(route.topicId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.topicId]);

  const highlights = useMemo(() => allHighlights.filter((h) => h.topicId === route.topicId), [allHighlights, route.topicId]);
  const notes = useMemo(() => allNotes.filter((n) => n.topicId === route.topicId), [allNotes, route.topicId]);
  const termRe = useMemo(() => {
    const keys = Object.keys(found?.doc.glossary ?? {}).sort((a, b) => b.length - a.length);
    if (!keys.length) return null;
    return new RegExp(`\\b(${keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?:s|es)?\\b`, 'gi');
  }, [found?.doc]);

  // read the browser selection and turn it into a range inside one run of text
  useEffect(() => {
    if (tab !== 'lesson') return;
    let timer: ReturnType<typeof setTimeout>;
    const read = () => {
      const sel = window.getSelection();
      const root = reader.current;
      const frame = screen.current;
      if (!sel || sel.isCollapsed || !root || !frame || sel.rangeCount === 0) {
        setPicked((p) => (p && !p.hl ? null : p));
        return;
      }
      const range = sel.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) return;
      const a = locate(range.startContainer, range.startOffset, 'start');
      const b = locate(range.endContainer, range.endOffset, 'end');
      if (!a) return;
      const [block, item] = (a.seg.dataset.seg ?? '0:0').split(':').map(Number);
      const len = Number(a.seg.dataset.len ?? 0);
      const end = b && b.seg === a.seg ? b.at : len;
      if (end <= a.at) return;
      const raw = texts.current.get(`${block}:${item}`) ?? '';
      const rect = range.getBoundingClientRect();
      const host = frame.getBoundingClientRect();
      setTerm(null);
      setPicked({ block, item, start: a.at, end, text: plain(raw.slice(a.at, end)).replace(/\*\*/g, ''), x: rect.left + rect.width / 2 - host.left, top: rect.top - host.top, bottom: rect.bottom - host.top });
    };
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(read, 180);
    };
    document.addEventListener('selectionchange', onChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('selectionchange', onChange);
    };
  }, [tab]);

  /* swipe sideways to turn the page: the page follows the finger, then slides away or settles back */
  const turnBy = useRef<(d: 1 | -1) => boolean>(() => false);
  useEffect(() => {
    const el = scroller.current;
    if (!el || tab !== 'lesson') return;
    let x0 = 0;
    let y0 = 0;
    let state: 'idle' | 'maybe' | 'drag' | 'no' = 'idle';
    let dx = 0;
    const page = () => reader.current;
    const sideScroller = (t: HTMLElement | null) => {
      for (let n = t; n && n !== el; n = n.parentElement) {
        if (n.matches('.graph, .graph-it, [data-noswipe]')) return true;
        if (n.scrollWidth > n.clientWidth + 4 && /(auto|scroll)/.test(getComputedStyle(n).overflowX)) return true;
      }
      return false;
    };
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      const sel = window.getSelection();
      if (e.touches.length !== 1 || (sel && !sel.isCollapsed) || sideScroller(e.target as HTMLElement)) {
        state = 'no';
        return;
      }
      x0 = t.clientX;
      y0 = t.clientY;
      dx = 0;
      state = 'maybe';
    };
    const move = (e: TouchEvent) => {
      if (state === 'no' || state === 'idle') return;
      const t = e.touches[0];
      dx = t.clientX - x0;
      const dy = t.clientY - y0;
      if (state === 'maybe') {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) state = 'no';
        else if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.4) {
          const sel = window.getSelection();
          state = sel && !sel.isCollapsed ? 'no' : 'drag';
        }
      }
      const a = page();
      if (state !== 'drag' || !a) return;
      a.style.animation = 'none';
      a.style.transition = 'none';
      a.style.transform = `translateX(${dx * 0.85}px) rotate(${dx * 0.006}deg)`;
      a.style.opacity = String(Math.max(0.35, 1 - Math.abs(dx) / 420));
    };
    const end = () => {
      const a = page();
      const was = state;
      state = 'idle';
      if (was !== 'drag' || !a) return;
      const far = Math.abs(dx) > Math.min(110, el.clientWidth * 0.24);
      const turned = far && turnBy.current(dx < 0 ? 1 : -1);
      if (turned) return; // a new page mounts and plays its own entrance
      a.style.transition = 'transform 0.32s cubic-bezier(0.2, 0.9, 0.3, 1.2), opacity 0.25s';
      a.style.transform = '';
      a.style.opacity = '';
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: true });
    el.addEventListener('touchend', end, { passive: true });
    el.addEventListener('touchcancel', end, { passive: true });
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [tab, route.topicId, !!found]);

  if (!found) {
    return (
      <div className="screen" data-dir={dir}>
        <div className="topbar"><button className="iconbtn" onClick={back} aria-label={tr('Back')}><Icon name="back" /></button></div>
        <div className="scroll center" style={{ justifyContent: 'center', gap: 12 }}>
          <Lera size={90} mood="curious" />
          <p className="muted">{tr('This lesson isn’t here any more.')}</p>
          <Button3D small onClick={() => go({ name: 'lessons' })}>{tr('Open lessons')}</Button3D>
        </div>
      </div>
    );
  }

  const { topic, doc } = found;
  const pages = paginate(topic.blocks);
  const at = Math.min(pageNo, pages.length - 1);
  const page = pages[at];
  const lastOne = at === pages.length - 1;
  const goPage = (n: number) => {
    const next = Math.max(0, Math.min(pages.length - 1, n));
    if (next === at) return false;
    haptic(5);
    window.getSelection()?.removeAllRanges();
    setPicked(null);
    setTerm(null);
    setTurn(next > at ? 1 : -1);
    setPageNo(next);
    lastPage.set(topic.id, next);
    scroller.current?.scrollTo({ top: 0 });
    return true;
  };
  const hasPractice = topic.exercises.length > 0;
  const showTab = hasPractice ? tab : 'lesson';
  turnBy.current = (d) => goPage(at + d);
  const pageHeading = topic.blocks[page.start]?.t === 'h';
  const clearSel = () => {
    window.getSelection()?.removeAllRanges();
    setPicked(null);
  };
  const usedTerms = new Set<string>();
  const ctx: ReaderCtx = {
    topicId: topic.id,
    highlights,
    notes,
    termRe,
    usedTerms,
    texts: texts.current,
    onNote: setViewNote,
    onTerm: (key, el) => {
      const host = screen.current?.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (!host) return;
      haptic(5);
      setPicked(null);
      setTerm({ key, x: r.left + r.width / 2 - host.left, top: r.bottom - host.top });
    },
  };

  const onReaderClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    setTerm(null);
    const mark = (e.target as HTMLElement).closest<HTMLElement>('[data-hl]');
    const host = screen.current?.getBoundingClientRect();
    if (!mark || !host) return setPicked(null);
    const hl = highlights.find((h) => h.id === mark.dataset.hl);
    if (!hl) return;
    const r = mark.getBoundingClientRect();
    const raw = texts.current.get(`${hl.block}:${hl.item}`) ?? '';
    setPicked({ block: hl.block, item: hl.item, start: hl.start, end: hl.end, text: plain(raw.slice(hl.start, hl.end)), x: r.left + r.width / 2 - host.left, top: r.top - host.top, bottom: r.bottom - host.top, hl });
  };

  const paint = (color: string, underline = false) => {
    if (!picked) return;
    haptic(6);
    actions.addHighlight({ topicId: topic.id, block: picked.block, item: picked.item, start: picked.start, end: picked.end, color, underline });
    clearSel();
  };

  const copy = async (text: string, done = tr('Copied')) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(done);
    } catch {
      toast(tr('Copying isn’t allowed here, select and copy by hand.'));
    }
  };

  const share = async (text: string) => {
    const payload = { title: topic.title, text: tr('“{0}”, from my notes on {1}', { 0: text, 1: topic.title }) };
    try {
      if (navigator.share) await navigator.share(payload);
      else await copy(payload.text, tr('Copied, ready to share'));
    } catch (e) {
      // closing the share sheet is fine; a refusal (embedded pages) falls back to copying
      if (!(e instanceof DOMException && e.name === 'AbortError')) await copy(payload.text, tr('Copied, ready to share'));
    }
  };

  const days = streak(attempts);
  const unitTitle = found.unit.title;
  const topics = doc.units.flatMap((u) => u.topics);
  const topicAt = topics.findIndex((t) => t.id === topic.id);
  const nextTopic = topics[topicAt + 1];
  const prevTopic = topics[topicAt - 1];
  const nextUnit = nextTopic ? doc.units.find((u) => u.topics.some((t) => t.id === nextTopic.id)) : null;
  /** Move on; leaving the last lesson of a chapter gets its own moment first. */
  const moveOn = () => {
    if (!nextTopic || nextUnit !== found.unit) setChapterDone(true);
    else replace({ name: 'lesson', topicId: nextTopic.id });
  };
  // a round number of lessons read is marked once, on the way to the next lesson
  const lessonsRead = useStore((s) => Object.keys(s.read).length);
  const cheered = useStore((s) => s.profile.cheered);
  const [readCheer, setReadCheer] = useState<number | null>(null);
  const toNext = () => {
    const mark = [100, 50, 25, 10, 5, 1].find((m) => lessonsRead >= m);
    if (mark && !(cheered ?? []).includes(`lessons:${mark}`)) {
      actions.setProfile({ cheered: [...(cheered ?? []), `lessons:${mark}`] });
      setReadCheer(mark);
    } else moveOn();
  };
  const barLeft = (x: number) => Math.max(150, Math.min((screen.current?.clientWidth ?? 390) - 150, x));

  return (
    <div className="screen lesson" data-dir={dir} ref={screen}>
      <div className="lesson-nav">
        <button className="navpill" onClick={() => go({ name: 'home' })}><Icon name="home" size={18} />{' '}{tr('Home')}</button>
        <button className="streakpill tap" onClick={() => go({ name: 'streak' })} aria-label={tr('{0}-day streak', { 0: days })}><Icon name="flame" size={17} fill />{' '}{tr('Day')}{' '}{Math.max(1, days)}</button>
        <button className="navpill" onClick={() => go({ name: 'lessons' })}>{tr('Lessons')}{' '}<Icon name="book" size={18} /></button>
      </div>
      {hasPractice && <div style={{ padding: '2px 20px 10px' }}>
        <Seg options={[{ id: 'lesson', label: tr('Lesson') }, { id: 'practice', label: topic.exercises.length ? tr('Practice · {0}', { 0: topic.exercises.length }) : tr('Practice') }]} value={tab} onChange={(v) => { clearSel(); setTerm(null); setTab(v); }} />
      </div>}
      {showTab === 'lesson' && pages.length > 1 ? (
        <div className="pager" role="tablist" aria-label={tr('Parts of this lesson')}>
          {pages.map((_, i) => (
            <button key={i} role="tab" aria-selected={i === at} aria-label={tr('Part {0} of {1}', { 0: i + 1, 1: pages.length })} data-state={i < at ? 'done' : i === at ? 'now' : 'todo'} onClick={() => goPage(i)} />
          ))}
        </div>
      ) : (
        <i className="read-progress" ref={progress} />
      )}

      {showTab === 'lesson' ? (
        <div
          ref={scroller}
          className="scroll lesson-scroll"
          onScroll={(e: { currentTarget: HTMLElement }) => {
            const el = e.currentTarget;
            const k = el.scrollHeight > el.clientHeight ? el.scrollTop / (el.scrollHeight - el.clientHeight) : 1;
            progress.current?.style.setProperty('--k', String(k));
            if (picked?.hl || term) {
              setPicked(null);
              setTerm(null);
            }
          }}
        >
          <article key={at} className={`reader stagger ${pages.length > 1 ? (turn > 0 ? 'turn-next' : 'turn-prev') : ''}`} ref={reader} onClick={onReaderClick} onContextMenu={(e: { preventDefault(): void }) => e.preventDefault()}>
            {at === 0 ? (
              <>
                <span className="label">{unitTitle}</span>
                <h1 className="rd-title">{topic.title}</h1>
              </>
            ) : (
              <span className="label">{tr('{0} · part {1} of {2}', { 0: topic.title, 1: at + 1, 2: pages.length })}</span>
            )}
            {at > 0 && !pageHeading && <div style={{ height: 8 }} />}
            {topic.blocks.slice(page.start, page.end).map((b, k) => (
              <BlockView key={page.start + k} block={b} index={page.start + k} ctx={ctx} />
            ))}
            {topic.blocks.length === 0 && <p className="rd-p muted">{hasPractice ? tr('Your notes have exercises under this heading but no explanation. Head to Practice.') : tr('This heading has no text under it in your notes.')}</p>}
          </article>
        </div>
      ) : (
        <TopicPractice topic={topic} doc={doc} />
      )}

      {showTab === 'lesson' && (
        <div className="lesson-foot">
          <div className="row" style={{ gap: 10 }}>
            {at > 0 ? (
              <button className="page-back" onClick={() => goPage(at - 1)} aria-label={tr('Previous part')}><Icon name="back" size={20} /></button>
            ) : prevTopic ? (
              // on a lesson's first part the arrow goes back to the lesson before it; with none before, it is not shown
              <button className="page-back" onClick={() => replace({ name: 'lesson', topicId: prevTopic.id })} aria-label={tr('Previous lesson')}><Icon name="back" size={20} /></button>
            ) : null}
            {!lastOne ? (
              <Button3D onClick={() => goPage(at + 1)}>
                {tr('Continue')}{' '}<span style={{ opacity: 0.75, fontWeight: 500 }}>· {at + 1}/{pages.length}</span> <Icon name="arrow" size={18} />
              </Button3D>
            ) : hasPractice ? (
              <Button3D sheen onClick={() => setTab('practice')}>
                <Icon name="pencil" size={18} />{' '}{tr('Practise this lesson')}
              </Button3D>
            ) : nextTopic ? (
              <Button3D sheen onClick={toNext}>
                {tr('Next lesson')}{' '}<Icon name="arrow" size={18} />
              </Button3D>
            ) : (
              <Button3D sheen variant="ok" onClick={toNext}>
                <Icon name="check" size={18} stroke={3} />{' '}{tr('Finish')}
              </Button3D>
            )}
          </div>
          {lastOne && nextTopic && (
            <button className="linkbtn lesson-next" onClick={hasPractice ? toNext : undefined} disabled={!hasPractice}>
              {hasPractice ? tr('Skip to:') : tr('Up next:')}{' '}{nextTopic.title}
            </button>
          )}
        </div>
      )}
      {readCheer !== null && (
        <Celebration
          scene={{ kind: 'lesson', value: readCheer, title: readCheer === 1 ? tr('First lesson read!') : tr('{0} lessons read!', { 0: readCheer }), sub: tr('Reading first makes the practice stick.') }}
          onNext={() => {
            setReadCheer(null);
            moveOn();
          }}
        />
      )}
      {chapterDone && (
        <Celebration
          scene={{ kind: 'chapter', title: tr('Chapter complete!'), sub: unitTitle, cta: nextTopic ? tr('Next: {0}', { 0: nextUnit?.title ?? 'next chapter' }) : tr('Back to lessons') }}
          onNext={() => {
            setChapterDone(false);
            if (nextTopic) replace({ name: 'lesson', topicId: nextTopic.id });
            else go({ name: 'lessons' });
          }}
        />
      )}
      {showTab === 'lesson' && (
        <button className="ask-fab" onClick={() => openOverlay({ name: 'ask', topicId: topic.id })}>
          <Lera size={30} interactive={false} />{' '}{tr('Ask Lera')}
        </button>
      )}

      {picked && (
        <div className="seltool" style={{ left: barLeft(picked.x), top: picked.top > 150 ? picked.top - 12 : picked.bottom + 12 }} data-below={picked.top > 150 ? undefined : ''} onPointerDown={(e: { preventDefault(): void }) => e.preventDefault()}>
          <div className="swatches">
            {HIGHLIGHT_COLORS.map((c) => (
              <button key={c} style={{ background: c }} onClick={() => paint(c)} aria-label={tr('Highlight {0}', { 0: c })} data-on={picked.hl?.color === c && !picked.hl.underline ? '' : undefined} />
            ))}
            <button className="under" onClick={() => paint(picked.hl?.color ?? '#6c63ff', true)} aria-label={tr('Underline')}><Icon name="underline" size={16} /></button>
            {picked.hl && (
              <button className="under" onClick={() => { actions.removeHighlight(picked.hl!.id); setPicked(null); }} aria-label={tr('Remove highlight')}><Icon name="trash" size={16} /></button>
            )}
          </div>
          <div className="actions">
            {(
              [
                ['copy', tr('Copy'), () => { void copy(picked.text); clearSel(); }],
                ['bulb', tr('Explain'), () => { openOverlay({ name: 'ask', topicId: topic.id, seed: tr('Explain this: “{0}”', { 0: picked.text.slice(0, 300) }) }); clearSel(); }],
                ['note', tr('Note'), () => { setNoteDraft(picked); clearSel(); }],
                ['chat', tr('Ask Lera'), () => { openOverlay({ name: 'ask', topicId: topic.id, seed: tr('Tell me more about “{0}”', { 0: picked.text.slice(0, 300) }) }); clearSel(); }],
                ['bookmark', tr('Save'), () => { actions.save({ topicId: topic.id, topicTitle: topic.title, text: picked.text }); haptic([8, 30, 8]); toast(tr('Saved to your notebook')); clearSel(); }],
                ['share', tr('Share'), () => { void share(picked.text); clearSel(); }],
              ] as [string, string, () => void][]
            ).map(([icon, label, fn]) => (
              <button key={label} onClick={fn}>
                <Icon name={icon} size={18} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {term && (
        <div className="termpop" style={{ left: barLeft(term.x), top: term.top + 10 }}>
          <b>{term.key.charAt(0).toUpperCase() + term.key.slice(1)}</b>
          <p>{doc.glossary[term.key]}</p>
          <button className="linkbtn" style={{ padding: '4px 0', fontSize: 14 }} onClick={() => { openOverlay({ name: 'ask', topicId: topic.id, seed: tr('What is {0} {1}?', { 0: /^[aeiou]/.test(term.key) ? 'an' : 'a', 1: term.key }) }); setTerm(null); }}>
            {tr('Learn more')}{' '}<Icon name="chevron" size={14} />
          </button>
        </div>
      )}

      {noteDraft && <NoteEditor quote={noteDraft.text} onClose={() => setNoteDraft(null)} onSave={(title, content) => { actions.addNote({ topicId: topic.id, block: noteDraft.block, item: noteDraft.item, offset: noteDraft.end, title, content, quote: noteDraft.text }); setNoteDraft(null); toast(tr('Note added')); }} />}

      {viewNote && (
        <Sheet onClose={() => setViewNote(null)} label={tr('Your note')}>
          <div className="sheet-body">
            <span className="label">{tr('Your note')}</span>
            <h3 style={{ fontSize: 20, margin: '6px 0 8px' }}>{viewNote.title || tr('Untitled')}</h3>
            <blockquote className="quote">{prettyInline(viewNote.quote)}</blockquote>
            <p style={{ lineHeight: 1.55, whiteSpace: 'pre-wrap', margin: '12px 0 18px' }}>{viewNote.content}</p>
            <button className="linkbtn" style={{ color: 'var(--gap)', paddingLeft: 0 }} onClick={() => { actions.removeNote(viewNote.id); setViewNote(null); }}>
              <Icon name="trash" size={16} />{' '}{tr('Delete note')}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function NoteEditor({ quote, onClose, onSave }: { quote: string; onClose: () => void; onSave: (title: string, content: string) => void }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  return (
    <Sheet onClose={onClose} label={tr('Add a note')}>
      <div className="sheet-body col" style={{ gap: 10 }}>
        <span className="label">{tr('New note')}</span>
        <blockquote className="quote">{prettyInline(quote)}</blockquote>
        <input className="field" placeholder={tr('Title')} value={title} maxLength={60} onChange={(e: { target: { value: string } }) => setTitle(e.target.value)} aria-label={tr('Note title')} autoFocus />
        <textarea className="field" style={{ minHeight: 110, resize: 'none' }} placeholder={tr('What do you want to remember?')} value={content} maxLength={200} onChange={(e: { target: { value: string } }) => setContent(e.target.value)} aria-label={tr('Note')} />
        <span className="faint" style={{ fontSize: 12.5, alignSelf: 'flex-end' }}>{content.length}/200</span>
        <div className="center"><Button3D disabled={!title.trim() && !content.trim()} onClick={() => onSave(title.trim(), content.trim())}>{tr('Save note')}</Button3D></div>
      </div>
    </Sheet>
  );
}

/* ───────────── practice tab ───────────── */

function TopicPractice({ topic, doc }: { topic: Topic; doc: LeraDoc }) {
  const solved = useStore((s) => s.solved);
  const concepts = useStore((s) => s.concepts);
  const attempts = useStore((s) => s.attempts);
  const aiOn = useStore((s) => s.ai.provider !== 'none');
  // only what the file has: its exercises, its worked examples as questions, and anything Lera was asked to write
  const problems = useMemo(() => topicProblems(topic, aiOn), [topic, aiOn]);
  const n = problems.length;
  const done = problems.filter((e) => solved[e.id]).length;
  const text =
    n === 0
      ? aiOn ? tr('This part of your notes has no exercises of its own, so I will write the practice from what it teaches.') : tr('I found no exercise or example I can check in this part of your notes.')
      : done === n
        ? tr('You’ve solved all **{0}** problems from this part of your notes. I can write new ones.', { 0: n })
        : done ? tn(n, 'I found **{n}** exercise in this part of your notes, {done} solved. Write every line; I read the working.', 'I found **{n}** exercises in this part of your notes, {done} solved. Write every line; I read the working.', { done }) : tn(n, 'I found **{n}** exercise in this part of your notes. Write every line; I read the working.', 'I found **{n}** exercises in this part of your notes. Write every line; I read the working.');
  const lastFor = (id: string) => [...attempts].reverse().find((a) => a.problemId === id);
  return (
    <div className="scroll">
      <div className="stagger" style={{ padding: '6px 20px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <LeraSays size={54} text={text} mood={done === n && n > 0 ? 'proud' : 'idle'} />
        <div className="center">
          <Button3D sheen onClick={() => go({ name: 'session', topicId: topic.id })}>
            <Icon name="play" size={17} fill />{' '}{tr('Start practice')}
          </Button3D>
        </div>

        {n > 0 && (
          <section>
            <span className="label">{tr('From your notes')}</span>
            <div className="col" style={{ gap: 10, marginTop: 8 }}>
              {problems.map((e, i) => {
                const last = lastFor(e.id);
                const gaps = last?.marks.filter((m) => m.severity === 'gap').length ?? 0;
                return (
                  <button key={e.id} className="card tap exercise" onClick={() => go({ name: 'session', topicId: topic.id, problems: [e], title: `${topic.title} · exercise ${i + 1}` })}>
                    <span className={`exn ${solved[e.id] ? 'done' : ''}`}>{solved[e.id] ? <Icon name="check" size={15} stroke={3} /> : i + 1}</span>
                    <span className="grow">
                      <span className="muted" style={{ fontSize: 13.5, display: 'block' }}>{e.kind === 'open' ? tr('Written answer') : promptText(e.prompt)}</span>
                      {e.kind === 'open' ? <span style={{ fontSize: 15, lineHeight: 1.4 }}>{prettyInline(plain(e.original ?? e.prompt)).slice(0, 110)}</span> : <MathView text={e.given} block />}
                      {e.made && <span className="chip plain" style={{ marginTop: 6 }}>{tr('Written by Lera')}</span>}
                      {last && !solved[e.id] && <span className="chip slip" style={{ marginTop: 6 }}>{tr('Tried · not solved yet')}</span>}
                      {last && solved[e.id] && gaps > 0 && <span className="chip gap" style={{ marginTop: 6 }}>{tr('Solved with a gap')}</span>}
                    </span>
                    <Icon name="chevron" size={17} />
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <MorePractice topic={topic} onMade={(made) => go({ name: 'session', topicId: topic.id, problems: made, title: topic.title })} />

        {topic.concepts.length > 0 && (
          <section>
            <span className="label">{tr('Ideas this lesson leans on')}</span>
            <div className="col" style={{ gap: 8, marginTop: 8 }}>
              {topic.concepts.map((id) => {
                const st = statusOf(concepts[id]);
                return (
                  <button key={id} className="noticed" style={{ borderTop: 0 }} onClick={() => openOverlay({ name: 'review', concept: id })}>
                    <span className={`dot ${st}`} />
                    <span className="grow">
                      <b style={{ fontSize: 14.5, display: 'block' }}>{conceptOf(id).title}</b>
                      <span className="muted" style={{ fontSize: 13 }}>{conceptOf(id).short}</span>
                    </span>
                    <Icon name="chevron" size={16} />
                  </button>
                );
              })}
            </div>
          </section>
        )}
        <p className="faint" style={{ fontSize: 12.5, textAlign: 'center' }}>{doc.title}</p>
      </div>
    </div>
  );
}
