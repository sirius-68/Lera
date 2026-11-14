import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Lera, Mood } from '../mascot/Lera';
import { MathView, tokenize } from './math';

export const haptic = (ms: number | number[] = 8): void => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* no haptics on this device */
  }
};

/* ───────────── button ───────────── */

interface ButtonProps {
  children: ReactNode;
  variant?: 'primary' | 'dark' | 'secondary' | 'ok';
  small?: boolean;
  disabled?: boolean;
  busy?: boolean;
  sheen?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
  type?: 'button' | 'submit';
  ariaLabel?: string;
}

export function Button3D({ children, variant = 'primary', small, disabled, busy, sheen, onClick, style, type = 'button', ariaLabel }: ButtonProps) {
  return (
    <button
      type={type}
      className={`btn3d ${variant === 'primary' ? '' : variant} ${small ? 'small' : ''} ${sheen ? 'sheen' : ''}`}
      disabled={disabled || busy}
      aria-label={ariaLabel}
      style={style}
      onClick={() => {
        haptic(6);
        onClick?.();
      }}
    >
      {busy ? <span className="spinner" /> : children}
    </button>
  );
}

/* ───────────── progress ───────────── */

export function Bar({ value, tone = '', label }: { value: number; tone?: string; label?: string }) {
  const [w, setW] = useState(0);
  // start empty so the fill animates in
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(Math.max(0, Math.min(1, value))));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return (
    <div className={`bar ${tone}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label={label}>
      <i style={{ width: `${w * 100}%` }} />
    </div>
  );
}

export function Ring({ value, size = 56, stroke = 6, color = 'var(--brand)', children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [v, setV] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setV(Math.max(0, Math.min(1, value))));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--tint-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: 'stroke-dashoffset 0.9s var(--spring)' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: size * 0.26 }}>{children}</div>
    </div>
  );
}

export function CountUp({ to, suffix = '', ms = 800 }: { to: number; suffix?: string; ms?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      setN(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return (
    <>
      {n}
      {suffix}
    </>
  );
}

/* ───────────── segmented control ───────────── */

export function Seg<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const i = Math.max(0, options.findIndex((o) => o.id === value));
  return (
    <div className="seg" role="tablist">
      <span className="thumb" style={{ width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${i * 100}%)` }} />
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={o.id === value}
          onClick={() => {
            haptic(5);
            onChange(o.id);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ───────────── bottom sheet ───────────── */

export function Sheet({ children, onClose, full, label }: { children: ReactNode; onClose: () => void; full?: boolean; label: string }) {
  const [out, setOut] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);

  const close = () => {
    setOut(true);
    setTimeout(onClose, 220);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { y: e.clientY, dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || !ref.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    ref.current.style.transition = 'none';
    ref.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const up = () => {
    if (!drag.current || !ref.current) return;
    const dy = drag.current.dy;
    drag.current = null;
    ref.current.style.transition = 'transform 0.3s var(--spring)';
    if (dy > 110) close();
    else ref.current.style.transform = '';
  };

  return (
    <>
      <div className={`scrim ${out ? 'out' : ''}`} onClick={close} />
      <div ref={ref} className={`sheet ${full ? 'full' : ''} ${out ? 'out' : ''}`} role="dialog" aria-modal="true" aria-label={label}>
        <div className="grab" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
        {children}
      </div>
    </>
  );
}

/* ───────────── toast ───────────── */

let toastMsg: { text: string; id: number } | null = null;
const toastSubs = new Set<() => void>();
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export { leraReact } from '../mascot/Lera';

export function toast(text: string, ms = 2400): void {
  toastMsg = { text, id: Date.now() };
  toastSubs.forEach((l) => l());
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMsg = null;
    toastSubs.forEach((l) => l());
  }, ms);
}

export function Toaster() {
  const msg = useSyncExternalStore(
    (l) => {
      toastSubs.add(l);
      return () => toastSubs.delete(l);
    },
    () => toastMsg,
  );
  if (!msg) return null;
  return (
    <div key={msg.id} className="toast" role="status">
      {msg.text}
    </div>
  );
}

/* ───────────── confirm ───────────── */

interface Ask {
  title: string;
  body?: string;
  yes: string;
  danger?: boolean;
  done: (ok: boolean) => void;
}
let asking: Ask | null = null;
const askSubs = new Set<() => void>();

/** An in-app "are you sure?". (Browser confirm() boxes are blocked in embedded pages, so Lera draws her own.) */
export function confirmDialog(title: string, opts: { body?: string; yes?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    asking = {
      title,
      body: opts.body,
      yes: opts.yes ?? 'Yes',
      danger: opts.danger,
      done: (ok) => {
        asking = null;
        askSubs.forEach((l) => l());
        resolve(ok);
      },
    };
    askSubs.forEach((l) => l());
  });
}

export function Confirmer() {
  const ask = useSyncExternalStore(
    (l) => {
      askSubs.add(l);
      return () => askSubs.delete(l);
    },
    () => asking,
  );
  if (!ask) return null;
  return (
    <>
      <div className="scrim" style={{ zIndex: 70 }} onClick={() => ask.done(false)} />
      <div className="dialog" style={{ zIndex: 71 }} role="alertdialog" aria-label={ask.title}>
        <b style={{ fontSize: 18 }}>{ask.title}</b>
        {ask.body && <p className="muted" style={{ fontSize: 14.5, lineHeight: 1.45 }}>{ask.body}</p>}
        <span style={{ height: 4 }} />
        <Button3D variant={ask.danger ? 'dark' : 'primary'} onClick={() => ask.done(true)}>{ask.yes}</Button3D>
        <button className="linkbtn" onClick={() => ask.done(false)}>Cancel</button>
      </div>
    </>
  );
}

/* ───────────── confetti ───────────── */

const COLORS = ['#6C63FF', '#FFC940', '#2CC08A', '#FF7FA8', '#5CC8FF', '#B9B4FF'];

/** A burst of paper from the lower middle of its parent. Change `fire` to launch another. */
export function Confetti({ fire }: { fire: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !fire) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    const bits = Array.from({ length: 90 }, (_, i) => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
      const speed = 7 + Math.random() * 9;
      return {
        x: w / 2 + (Math.random() - 0.5) * 40,
        y: h * 0.62,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 5 + Math.random() * 6,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 0.5,
        color: COLORS[i % COLORS.length],
        round: i % 4 === 0,
      };
    });
    let raf = 0;
    let frame = 0;
    const draw = () => {
      frame++;
      ctx.clearRect(0, 0, w, h);
      for (const b of bits) {
        b.vy += 0.28;
        b.vx *= 0.985;
        b.x += b.vx;
        b.y += b.vy;
        b.rot += b.vr;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.globalAlpha = Math.max(0, 1 - frame / 130);
        ctx.fillStyle = b.color;
        if (b.round) {
          ctx.beginPath();
          ctx.arc(0, 0, b.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else ctx.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2 + Math.sin(frame / 5 + b.rot) * 2);
        ctx.restore();
      }
      if (frame < 130) raf = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [fire]);
  return <canvas ref={ref} className="confetti" aria-hidden="true" />;
}

/* ───────────── Lera speaking ───────────── */

/** Break a sentence into words, keeping `$maths$` and `**bold**` in one piece each. */
function words(text: string): { t: 'text' | 'math' | 'bold'; s: string }[] {
  const out: { t: 'text' | 'math' | 'bold'; s: string }[] = [];
  for (const tok of tokenize(text)) {
    if (tok.t !== 'text') out.push({ t: tok.t, s: tok.s });
    else for (const w of tok.s.match(/\S+\s*|\s+/g) ?? []) out.push({ t: 'text', s: w });
  }
  return out;
}

interface SaysProps {
  text: string;
  mood?: Mood;
  size?: number;
  stack?: boolean;
  solid?: boolean;
  sleepAfter?: number;
  children?: ReactNode;
}

/** Lera with a speech bubble. Her mouth moves while the words arrive, then she settles into `mood`. */
export function LeraSays({ text, mood = 'idle', size = 56, stack, solid, sleepAfter, children }: SaysProps) {
  const parts = words(text);
  const [talking, setTalking] = useState(true);
  useLayoutEffect(() => {
    setTalking(true);
    const id = setTimeout(() => setTalking(false), Math.min(2600, 350 + parts.length * 38));
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return (
    <div className={`says ${stack ? 'stack' : ''}`}>
      <Lera size={size} mood={talking && mood === 'idle' ? 'talking' : mood} sleepAfter={sleepAfter} />
      <div key={text} className={`bubble ${solid ? 'solid' : ''}`} aria-live="polite">
        {parts.map((p, i) => (
          <span key={i} className="w" style={{ animationDelay: `${120 + i * 34}ms` }}>
            {p.t === 'math' ? <MathView text={p.s} /> : p.t === 'bold' ? <strong>{p.s}</strong> : p.s}
          </span>
        ))}
        {children}
      </div>
    </div>
  );
}

export function Dots({ count, active }: { count: number; active: number }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', padding: '10px 0' }} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <i
          key={i}
          style={{
            width: i === active ? 24 : 8,
            height: 8,
            borderRadius: 4,
            background: i === active ? 'var(--brand)' : '#d0d0dd',
            transition: 'all 0.35s var(--spring)',
          }}
        />
      ))}
    </div>
  );
}
