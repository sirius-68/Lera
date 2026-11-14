import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import './lera.css';

/**
 * Lera, alive.
 *
 * She breathes, blinks at irregular intervals, follows the pointer with her
 * eyes (and leans a little towards it), glances around when nothing is
 * happening, dozes off when left alone, and reacts when tapped. Everything
 * that runs every frame writes CSS variables straight to the element, so the
 * rest of the app never re-renders because of her.
 */
export type Mood =
  | 'idle' | 'happy' | 'proud' | 'celebrate' | 'thinking' | 'oops' | 'curious' | 'sleepy' | 'talking' | 'wave'
  /* the maths set */
  | 'eureka' // a lightbulb: the idea just landed
  | 'calculating' // glasses on, eyes scanning, + − × ÷ circling
  | 'fired' // a flame on her head: the streak is alive
  | 'love' // hearts: something worth keeping
  | 'sad' // a tear: the streak is about to break
  | 'determined' // brows down: a gap to close
  | 'cool' // shades: goal done
  | 'shocked' // that line really did not follow
  | 'graduate' // a cap: chapter finished
  | 'party'; // a hat: level up

interface Props {
  size?: number;
  mood?: Mood;
  /** Reacts to taps (default true). */
  interactive?: boolean;
  /** Falls asleep after this many ms without any pointer activity. 0 = never. */
  sleepAfter?: number;
  onTap?: () => void;
  className?: string;
}

const reduced = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

/** Moods shown for a moment before she settles back to looking around. */
const BRIEF = new Set<string>(['happy', 'proud', 'celebrate', 'wave', 'oops', 'eureka', 'shocked', 'love']);

/** What a tap brings out, in turn. */
const TAPS: Mood[] = ['happy', 'love', 'proud', 'eureka', 'cool', 'party'];

/** Let Lera, wherever she is on screen, react to something that just happened. */
export function leraReact(mood: Mood): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('lera:react', { detail: mood }));
}

export function Lera({ size = 96, mood = 'idle', interactive = true, sleepAfter = 0, onTap, className = '' }: Props) {
  const root = useRef<HTMLDivElement | null>(null);
  const [reaction, setReaction] = useState<Mood | 'dizzy' | null>(null);
  const [asleep, setAsleep] = useState(false);
  const [hop, setHop] = useState(0);
  const taps = useRef<number[]>([]);
  const tapNo = useRef(0);
  const lastActive = useRef(Date.now());
  const moodRef = useRef<string>(mood);
  // a smile with closed eyes is a moment, not a state: after a beat she opens her eyes and looks around again
  const [settled, setSettled] = useState(false);
  const shown = asleep ? 'sleepy' : reaction ?? (settled && BRIEF.has(mood) ? 'idle' : mood);
  moodRef.current = shown;

  // a change of mood from outside wakes her and clears any tap reaction
  useEffect(() => {
    setAsleep(false);
    setSettled(false);
    lastActive.current = Date.now();
    if (!BRIEF.has(mood)) return;
    const id = setTimeout(() => setSettled(true), mood === 'celebrate' ? 3200 : 2200);
    return () => clearTimeout(id);
  }, [mood]);

  /* what happens on the screen reaches her: typing makes her curious, a save or a right answer makes her smile */
  useEffect(() => {
    if (!interactive) return;
    const onReact = (e: Event) => {
      const m = (e as CustomEvent<Mood>).detail;
      lastActive.current = Date.now();
      setAsleep(false);
      setReaction(m);
      setHop((n) => n + 1);
    };
    const onFocus = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !/^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
      lastActive.current = Date.now();
      setAsleep(false);
      setReaction('curious');
    };
    window.addEventListener('lera:react', onReact);
    window.addEventListener('focusin', onFocus);
    return () => {
      window.removeEventListener('lera:react', onReact);
      window.removeEventListener('focusin', onFocus);
    };
  }, [interactive]);

  /* eyes: follow the pointer, otherwise look around */
  useEffect(() => {
    const el = root.current;
    if (!el || reduced()) return;
    let raf = 0;
    let alive = true;
    const pointer = { x: 0, y: 0, at: 0 };
    const cur = { x: 0, y: 0 };
    const glance = { x: 0, y: 0, until: 0 };

    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.at = performance.now();
      lastActive.current = Date.now();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onMove, { passive: true });
    // on a phone there is no hovering pointer: follow the finger while it scrolls, and glance at what gets typed
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      pointer.x = t.clientX;
      pointer.y = t.clientY;
      pointer.at = performance.now();
      lastActive.current = Date.now();
    };
    const onKey = () => {
      const a = document.activeElement as HTMLElement | null;
      if (!a || a === document.body) return;
      const r = a.getBoundingClientRect();
      pointer.x = r.left + r.width / 2;
      pointer.y = r.top + r.height / 2;
      pointer.at = performance.now();
      lastActive.current = Date.now();
    };
    window.addEventListener('touchmove', onTouch, { passive: true });
    window.addEventListener('input', onKey, true);
    window.addEventListener('click', onKey, true);

    const tick = (now: number) => {
      if (!alive) return;
      raf = requestAnimationFrame(tick);
      if (document.hidden) return;
      const m = moodRef.current;
      let tx = 0;
      let ty = 0;
      if (m === 'thinking') {
        tx = 1.9 + Math.sin(now / 900) * 0.5;
        ty = -2.7;
      } else if (m === 'calculating') {
        // reading along a line of working, then back to the start of the next
        const k = (now / 1500) % 1;
        tx = -2.6 + 5.2 * Math.min(1, k * 1.25);
        ty = 1.4;
      } else if (m === 'eureka') {
        tx = 1.8;
        ty = -2.6;
      } else if (m === 'sad') {
        tx = Math.sin(now / 1400) * 0.4;
        ty = 2.4;
      } else if (m === 'shocked') {
        tx = 0;
        ty = -0.8;
      } else if (m === 'sleepy' || m === 'proud' || m === 'happy' || m === 'love' || m === 'cool' || m === 'graduate' || m === 'determined') {
        tx = 0;
        ty = 0.6;
      } else if (m === 'oops') {
        tx = Math.sin(now / 260) * 0.5;
        ty = 1.6;
      } else if (now - pointer.at < 2600 && pointer.at > 0) {
        const r = el.getBoundingClientRect();
        const dx = pointer.x - (r.left + r.width / 2);
        const dy = pointer.y - (r.top + r.height * 0.45);
        const dist = Math.hypot(dx, dy) || 1;
        const pull = Math.min(1, dist / 160);
        tx = (dx / dist) * 2.9 * pull;
        ty = (dy / dist) * 3.1 * pull;
      } else {
        // nobody is moving: glance somewhere, hold it, then come back to the reader
        if (now > glance.until) {
          const away = Math.random() < 0.55;
          glance.x = away ? rand(-2.6, 2.6) : 0;
          glance.y = away ? rand(-1.6, 1.8) : 0;
          glance.until = now + rand(900, 3200);
        }
        tx = glance.x;
        ty = glance.y;
      }
      cur.x += (tx - cur.x) * 0.16;
      cur.y += (ty - cur.y) * 0.16;
      el.style.setProperty('--lx', cur.x.toFixed(2));
      el.style.setProperty('--ly', cur.y.toFixed(2));
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onMove);
      window.removeEventListener('touchmove', onTouch);
      window.removeEventListener('input', onKey, true);
      window.removeEventListener('click', onKey, true);
    };
  }, []);

  /* blinking: irregular, sometimes twice */
  useEffect(() => {
    const el = root.current;
    if (!el || reduced()) return;
    let timer: ReturnType<typeof setTimeout>;
    let off: ReturnType<typeof setTimeout>;
    const blink = (again: boolean) => {
      el.classList.add('blink');
      off = setTimeout(() => {
        el.classList.remove('blink');
        if (again) timer = setTimeout(() => blink(false), 130);
        else timer = setTimeout(() => blink(Math.random() < 0.22), rand(1800, 5200));
      }, 120);
    };
    timer = setTimeout(() => blink(false), rand(900, 2600));
    return () => {
      clearTimeout(timer);
      clearTimeout(off);
    };
  }, []);

  /* dozing off */
  useEffect(() => {
    if (!sleepAfter) return;
    const id = setInterval(() => {
      if (!asleep && Date.now() - lastActive.current > sleepAfter && !/^(talking|thinking|calculating|sleepy)$/.test(moodRef.current)) setAsleep(true);
    }, 2000);
    return () => clearInterval(id);
  }, [sleepAfter, asleep]);

  useEffect(() => {
    if (!reaction) return;
    const id = setTimeout(() => setReaction(null), reaction === 'dizzy' ? 1900 : reaction === 'curious' ? 1600 : reaction === 'happy' || reaction === 'proud' ? 1300 : 2100);
    return () => clearTimeout(id);
  }, [reaction, hop]);

  const tap = () => {
    if (!interactive) return;
    lastActive.current = Date.now();
    try {
      navigator.vibrate?.(8);
    } catch {
      /* no haptics here */
    }
    if (asleep) {
      setAsleep(false);
      setReaction('curious');
      setHop((n) => n + 1);
      return;
    }
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 1400), now];
    // poke her enough times in a row and she gets dizzy
    tapNo.current += 1;
    setReaction(taps.current.length >= 5 ? 'dizzy' : TAPS[(tapNo.current - 1) % TAPS.length]);
    if (taps.current.length >= 5) taps.current = [];
    setHop((n) => n + 1);
    onTap?.();
  };

  return (
    <div
      ref={root}
      className={`lera ${className}`}
      data-mood={shown}
      data-hop={hop % 2 ? 'a' : hop ? 'b' : undefined}
      style={{ width: size, height: size * 1.16 }}
      role={interactive ? 'button' : 'img'}
      tabIndex={interactive ? 0 : undefined}
      aria-label={shown === 'sleepy' ? 'Lera, asleep and dreaming of formulas. Tap to wake her.' : 'Lera'}
      onClick={tap}
      onKeyDown={(e: ReactKeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          tap();
        }
      }}
    >
      <svg viewBox="-12 -16 86 100" width="100%" height="100%" fill="none" aria-hidden="true">
        <ellipse className="l-shadow" cx="30.6" cy="76.5" rx="21" ry="3.4" />
        <g className="l-jump">
          <g className="l-tilt">
            <g className="l-breathe">
              <rect y="0.57" width="61.25" height="70" rx="30.63" fill="#6C63FF" />
              <path className="l-shine" d="M9 44c-1.6-9 .8-17 5-22" />
              <g className="l-hair l-hair-a">
                <path d="M0.547 33.928C11.12 29.049 32.266 15.105 32.266 0.568 21.693 0.399-0.547 6.584 0.547 33.928Z" fill="#050505" />
              </g>
              <g className="l-hair l-hair-b">
                <path d="M61.168 35.063C50.601 29.714 29.622 14.768 30.162 0.003 40.916 0.225 63.295 7.332 61.168 35.063Z" fill="#050505" />
              </g>

              <g className="l-face">
                <g className="l-brows">
                  <path className="l-brow l-brow-l" d="M16.2 26.4q5-2.2 9.6 0" />
                  <path className="l-brow l-brow-r" d="M34.4 26.4q5-2.2 9.6 0" />
                </g>
                <circle className="l-cheek" cx="12.6" cy="53.5" r="3.6" />
                <circle className="l-cheek" cx="48.6" cy="53.5" r="3.6" />

                <g className="l-eyes-open">
                  <g className="l-eye">
                    <rect x="15.31" y="30.1" width="12.03" height="20.78" rx="4.5" fill="#fff" />
                    <g className="l-pupil">
                      <rect x="18.59" y="37.76" width="6.56" height="8.75" rx="3.28" fill="#1B1B1B" />
                      <circle cx="20.3" cy="39.9" r="1.05" fill="#fff" />
                    </g>
                  </g>
                  <g className="l-eye">
                    <rect x="32.81" y="30.1" width="12.03" height="20.78" rx="4.5" fill="#fff" />
                    <g className="l-pupil">
                      <rect x="36.09" y="37.76" width="6.56" height="8.75" rx="3.28" fill="#1B1B1B" />
                      <circle cx="37.8" cy="39.9" r="1.05" fill="#fff" />
                    </g>
                  </g>
                </g>
                <g className="l-eyes-arc">
                  <path d="M15.6 43.5q5.7-9.4 11.4 0" />
                  <path d="M33.1 43.5q5.7-9.4 11.4 0" />
                </g>
                <g className="l-eyes-shut">
                  <path d="M15.8 41.5q5.5 4.4 11 0" />
                  <path d="M33.3 41.5q5.5 4.4 11 0" />
                </g>

                <g className="l-mouths">
                  <path className="l-mouth m-smile" d="M19.69 57.44C22.79 58.72 31.5 60.51 41.56 57.44 32.38 68.82 23.15 62.18 19.69 57.44Z" />
                  <path className="l-mouth m-big" d="M18.3 56.2c6 2.3 19 2.3 24.6 0-1.6 14.6-22.6 14.6-24.6 0Z" />
                  <ellipse className="l-mouth m-o" cx="30.6" cy="60.6" rx="3.3" ry="3.9" />
                  <path className="l-mouth m-flat line" d="M25 60.4q5.6 1.6 11.2 0" />
                  <path className="l-mouth m-wobble line" d="M23.6 61.4q3.5-3.2 7-.4t7.2-.5" />
                  <ellipse className="l-mouth m-talk" cx="30.6" cy="60.4" rx="5" ry="3.6" />
                  <path className="l-mouth m-frown line" d="M23.6 63q7-5.4 14 0" />
                  <path className="l-mouth m-smirk line" d="M24 59.6q7.2 4.6 13.6-1.4" />
                </g>
                <path className="l-acc a-tear" d="M21.3 51.5c2.3 3.3 2.5 5.4 0 6.4-2.5-1-2.3-3.1 0-6.4z" />
                <g className="l-acc a-glasses">
                  <rect x="13.2" y="28.2" width="16.2" height="24.4" rx="7.4" />
                  <rect x="30.9" y="28.2" width="16.2" height="24.4" rx="7.4" />
                  <path d="M29.4 38.5h1.5M13.2 38l-3.4-1.6M47.1 38l3.4-1.6" />
                </g>
                <g className="l-acc a-shades">
                  <path d="M10.6 31.4h18.6v8.2a9.3 9.3 0 0 1-18.6 0zM31 31.4h18.6v8.2a9.3 9.3 0 0 1-18.6 0z" />
                  <path className="bridge" d="M9 33h42.4" />
                  <path className="glint" d="M14.6 35.4l5-2.4M35 35.4l5-2.4" />
                </g>
              </g>
              <g className="l-acc a-cap">
                <path d="M19.4 -1.2v7.4q11.2 5.4 22.4 0v-7.4z" fill="#4a3fe0" />
                <path d="M30.6 -12.6l23.4 8.2-23.4 8.2-23.4-8.2z" fill="#372cc4" />
                <path className="tassel" d="M30.6 -4.4l19.4 2.8v8.4" />
                <circle cx="50" cy="8.2" r="2.2" fill="#ffc940" />
              </g>
              <g className="l-acc a-hat">
                <path d="M33 -17l11 20.5q-11 4.6-22 0z" fill="#ff8a3d" />
                <path d="M28.6 -8.6l8.6 2.6M25.4 -2.2l14.6 4" stroke="#ffe08a" strokeWidth="2.4" strokeLinecap="round" />
                <circle cx="33" cy="-17.4" r="3.2" fill="#ffd24d" />
              </g>
              <g className="l-acc a-flame">
                <path d="M30.6 -17c5.6 5 9.4 8.8 9.4 14.4a9.4 9.4 0 0 1-18.8 0c0-3.4 1.6-5.8 3.4-7.6.4 2.4 1.4 3.6 2.8 4.2-.8-4.2.6-7.8 3.2-11z" fill="#ff8a1f" />
                <path className="core" d="M30.8 -8.6c2.6 2.4 4.2 4 4.2 6.6a4.4 4.4 0 0 1-8.8 0c0-1.6.8-2.8 1.8-3.6.2 1 .8 1.6 1.4 1.8-.2-1.8.4-3.4 1.4-4.8z" fill="#ffe066" />
              </g>
            </g>
          </g>
        </g>

        <g className="l-fx l-bulb">
          <path className="rays" d="M61 -15v-4M71.4 -9.4l3-2.6M50.6 -9.4l-3-2.6M75 0h4M47 0h-4" />
          <path d="M61 -9.6a7.6 7.6 0 0 1 4.4 13.8v2.6h-8.8V4.2A7.6 7.6 0 0 1 61 -9.6z" fill="#ffd24d" />
          <path d="M57.6 9.2h6.8M58.6 11.8h4.8" stroke="#b9892a" strokeWidth="1.6" strokeLinecap="round" />
        </g>
        <g className="l-fx l-hearts">
          <g transform="translate(61 3) scale(1.25)"><path d="M0 3.6C-6 -0.6 -4.6 -5.4 -1.9 -5.4C-0.8 -5.4 0 -4.6 0 -3.8C0 -4.6 0.8 -5.4 1.9 -5.4C4.6 -5.4 6 -0.6 0 3.6Z" /></g>
          <g transform="translate(-4 0)"><path d="M0 3.6C-6 -0.6 -4.6 -5.4 -1.9 -5.4C-0.8 -5.4 0 -4.6 0 -3.8C0 -4.6 0.8 -5.4 1.9 -5.4C4.6 -5.4 6 -0.6 0 3.6Z" /></g>
          <g transform="translate(70 27) scale(0.8)"><path d="M0 3.6C-6 -0.6 -4.6 -5.4 -1.9 -5.4C-0.8 -5.4 0 -4.6 0 -3.8C0 -4.6 0.8 -5.4 1.9 -5.4C4.6 -5.4 6 -0.6 0 3.6Z" /></g>
        </g>
        <g className="l-fx l-ops">
          <text x="56" y="4">+</text>
          <text x="66" y="24">×</text>
          <text x="-9" y="10">÷</text>
          <text x="-10" y="34">−</text>
          <text x="60" y="-10">=</text>
        </g>
        <g className="l-fx l-bang">
          <text x="57" y="8">!</text>
        </g>
        <g className="l-fx l-formulas">
          <text x="50" y="8">x²</text>
          <text x="58" y="-1">π</text>
          <text x="64" y="-9">∫</text>
          <text x="54" y="2">√x</text>
          <text x="62" y="-5">∞</text>
        </g>

        <g className="l-fx l-sparkles">
          <path d="M-4 8l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" />
          <path d="M66 2l1.2 3.2 3.2 1.2-3.2 1.2L66 10.8l-1.2-3.2-3.2-1.2 3.2-1.2z" />
          <path d="M70 34l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" />
          <path d="M-7 40l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" />
        </g>
        <g className="l-fx l-dots">
          <circle cx="56" cy="-4" r="2.3" />
          <circle cx="63" cy="-8" r="2.3" />
          <circle cx="70" cy="-10" r="2.3" />
        </g>
        <g className="l-fx l-zzz">
          <text x="52" y="6">z</text>
          <text x="59" y="-2">z</text>
          <text x="66" y="-9">z</text>
        </g>
        <g className="l-fx l-what">
          <text x="58" y="6">?</text>
        </g>
        <g className="l-fx l-sweat">
          <path d="M58 16c2.4 3.4 2.6 5.6 0 6.6-2.6-1-2.4-3.2 0-6.6z" />
        </g>
      </svg>
    </div>
  );
}
