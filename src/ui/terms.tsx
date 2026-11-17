import { useEffect, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { GLOSSARY } from '../ingest/glossary';
import { openOverlay } from '../store/nav';
import { Icon } from './icons';
import { MathView, tokenize } from './math';

/**
 * Maths words that can be tapped for their meaning, anywhere Lera explains something (a step of a
 * solution, a diagnosis, a review), the same way they can in a lesson.
 */
const KEYS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
const TERM_RE = new RegExp(`\\b(${KEYS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?:e?s)?\\b`, 'gi');

interface Open {
  key: string;
  x: number;
  top: number;
  above: boolean;
}
let open: Open | null = null;
const listeners = new Set<() => void>();
const set = (next: Open | null) => {
  open = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));

function show(key: string, el: HTMLElement): void {
  const host = (el.closest('.app') ?? document.body).getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const half = 145;
  const x = Math.max(half, Math.min(host.width - half, r.left + r.width / 2 - host.left));
  // near the bottom of the screen the card opens upwards, so the keyboard never hides it
  const above = r.bottom - host.top > host.height * 0.6;
  set({ key, x, top: above ? host.height - (r.top - host.top) + 8 : r.bottom - host.top + 8, above });
}

/** A sentence with `$maths$`, `**bold**`, and glossary words that open their meaning when tapped. */
export function TermText({ text }: { text: string }) {
  const used = new Set<string>();
  return (
    <>
      {tokenize(text).map((tok, i) => {
        if (tok.t === 'math') return <MathView key={i} text={tok.s} />;
        if (tok.t === 'bold') return <strong key={i}>{tok.s}</strong>;
        const out: ReactNode[] = [];
        let last = 0;
        for (const m of tok.s.matchAll(TERM_RE)) {
          const key = m[1].toLowerCase();
          // each word is marked once per sentence; marking every "term" would be noise
          if (used.has(key) || m.index === undefined) continue;
          used.add(key);
          if (m.index > last) out.push(tok.s.slice(last, m.index));
          out.push(
            <span key={`${i}:${m.index}`} className="term" role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); show(key, e.currentTarget); }}>
              {m[0]}
            </span>,
          );
          last = m.index + m[0].length;
        }
        if (last < tok.s.length) out.push(tok.s.slice(last));
        return <span key={i}>{out}</span>;
      })}
    </>
  );
}

/** The card with a word's meaning. One for the whole app; it closes on a tap anywhere else or a scroll. */
export function TermPop() {
  const at = useSyncExternalStore(subscribe, () => open);
  useEffect(() => {
    if (!at) return;
    const close = (e: Event) => {
      if (!(e.target instanceof Element) || !e.target.closest('.termpop, .term')) set(null);
    };
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', close, true);
      document.removeEventListener('scroll', close, true);
    };
  }, [at]);
  if (!at) return null;
  return (
    <div className="termpop" style={at.above ? { left: at.x, bottom: at.top, zIndex: 70 } : { left: at.x, top: at.top, zIndex: 70 }}>
      <b>{at.key.charAt(0).toUpperCase() + at.key.slice(1)}</b>
      <p>{GLOSSARY[at.key]}</p>
      <button className="linkbtn" style={{ padding: '4px 0', fontSize: 14 }} onClick={() => { openOverlay({ name: 'ask', seed: `What is ${/^[aeiou]/.test(at.key) ? 'an' : 'a'} ${at.key}?` }); set(null); }}>
        Learn more <Icon name="chevron" size={14} />
      </button>
    </div>
  );
}
