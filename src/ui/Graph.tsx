import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import { E, diff, ev, simp, toText, tryParse } from '../engine/calc/expr';
import { Icon } from './icons';
import { MathView } from './math';
import { haptic } from './kit';

/**
 * An interactive graph of one or more functions of x.
 * Drag to move, pinch or scroll to zoom, tap or drag along a curve to read
 * a point and its slope. "Slope" adds the derivative as a dashed curve.
 */

const COLORS = ['#6c63ff', '#17a673', '#e2553f'];

interface View {
  cx: number;
  cy: number;
  /** world units per pixel */
  k: number;
}

interface Curve {
  src: string;
  f: (x: number) => number;
  d: (x: number) => number;
  dText: string;
}

function compile(src: string): Curve | null {
  const e = tryParse(src);
  if (!e) return null;
  const safe = (expr: E) => (x: number): number => {
    try {
      const y = ev(expr, { x });
      return Number.isFinite(y) ? y : NaN;
    } catch {
      return NaN;
    }
  };
  let de: E;
  try {
    de = simp(diff(e, 'x'));
  } catch {
    return null;
  }
  return { src, f: safe(e), d: safe(de), dText: toText(de) };
}

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p;
}

const fmt = (v: number): string => {
  const a = Math.abs(v);
  if (a < 1e-9) return '0';
  return a >= 1000 || a < 0.01 ? v.toExponential(1) : String(Number(v.toFixed(a < 1 ? 2 : a < 10 ? 2 : 1)));
};

/** A sensible first window: show the interesting part of the first curve. */
function initialView(curves: Curve[], w: number, h: number): View {
  const xs = Array.from({ length: 81 }, (_, i) => -5 + i * 0.125);
  const ys = curves.flatMap((c) => xs.map(c.f)).filter((y) => Number.isFinite(y) && Math.abs(y) < 60);
  ys.sort((a, b) => a - b);
  const lo = ys.length ? ys[Math.floor(ys.length * 0.06)] : -5;
  const hi = ys.length ? ys[Math.floor(ys.length * 0.94)] : 5;
  const span = Math.max(4, hi - lo) * 1.25;
  const k = Math.max(10 / w, span / h);
  return { cx: 0, cy: Math.abs(hi + lo) / 2 < span ? (hi + lo) / 2 : 0, k };
}

export function Graph({ fns, caption, height = 250 }: { fns: string[]; caption?: string; height?: number }) {
  const curves = useMemo(() => fns.map(compile).filter((c): c is Curve => !!c), [fns]);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const wrap = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 340, h: height });
  const [view, setView] = useState<View | null>(null);
  const [trace, setTrace] = useState<{ x: number; i: number } | null>(null);
  const [slope, setSlope] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; dist: number; view: View } | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setSize({ w: Math.max(200, el.clientWidth), h: height });
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [height]);

  const v = view ?? initialView(curves, size.w, size.h);
  const toPx = (x: number, y: number): [number, number] => [size.w / 2 + (x - v.cx) / v.k, size.h / 2 - (y - v.cy) / v.k];
  const toWorld = (px: number, py: number): [number, number] => [v.cx + (px - size.w / 2) * v.k, v.cy - (py - size.h / 2) * v.k];

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size.w, size.h);

    const [x0, y1] = toWorld(0, 0);
    const [x1, y0] = toWorld(size.w, size.h);
    const step = niceStep((x1 - x0) / 7);

    // grid
    g.lineWidth = 1;
    g.font = '11px "DM Sans", system-ui, sans-serif';
    g.fillStyle = '#9494aa';
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
      const [px] = toPx(x, 0);
      g.strokeStyle = Math.abs(x) < step / 2 ? 'transparent' : '#ececf5';
      g.beginPath();
      g.moveTo(px, 0);
      g.lineTo(px, size.h);
      g.stroke();
    }
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
      const [, py] = toPx(0, y);
      g.strokeStyle = Math.abs(y) < step / 2 ? 'transparent' : '#ececf5';
      g.beginPath();
      g.moveTo(0, py);
      g.lineTo(size.w, py);
      g.stroke();
    }
    // axes
    const [ax, ay] = toPx(0, 0);
    g.strokeStyle = '#b9b9cc';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, ay);
    g.lineTo(size.w, ay);
    g.moveTo(ax, 0);
    g.lineTo(ax, size.h);
    g.stroke();
    // numbers along the axes
    const labelY = Math.min(size.h - 4, Math.max(12, ay + 13));
    const labelX = Math.min(size.w - 26, Math.max(4, ax + 5));
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
      if (Math.abs(x) < step / 2) continue;
      const [px] = toPx(x, 0);
      g.textAlign = 'center';
      g.fillText(fmt(x), px, labelY);
    }
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
      if (Math.abs(y) < step / 2) continue;
      const [, py] = toPx(0, y);
      g.textAlign = 'left';
      g.fillText(fmt(y), labelX, py + 4);
    }

    const draw = (f: (x: number) => number, color: string, dashed: boolean) => {
      g.strokeStyle = color;
      g.lineWidth = dashed ? 1.8 : 2.6;
      g.lineJoin = 'round';
      g.setLineDash(dashed ? [6, 5] : []);
      g.beginPath();
      let pen = false;
      let prevY = NaN;
      for (let px = 0; px <= size.w; px += 1) {
        const [x] = toWorld(px, 0);
        const y = f(x);
        const [, py] = toPx(x, y);
        // lift the pen at gaps and at vertical asymptotes
        if (!Number.isFinite(y) || Math.abs(py) > size.h * 6 || (pen && Math.abs(py - prevY) > size.h * 1.2)) {
          pen = false;
          prevY = py;
          continue;
        }
        if (pen) g.lineTo(px, py);
        else g.moveTo(px, py);
        pen = true;
        prevY = py;
      }
      g.stroke();
      g.setLineDash([]);
    };
    curves.forEach((cv, i) => {
      if (slope) draw(cv.d, COLORS[i % COLORS.length] + '99', true);
      draw(cv.f, COLORS[i % COLORS.length], false);
    });

    if (trace && curves[trace.i]) {
      const cv = curves[trace.i];
      const y = cv.f(trace.x);
      const m = cv.d(trace.x);
      if (Number.isFinite(y)) {
        const [px, py] = toPx(trace.x, y);
        const color = COLORS[trace.i % COLORS.length];
        if (Number.isFinite(m)) {
          // the tangent: what "slope at this point" looks like
          const reach = 46 * v.k;
          const len = Math.hypot(1, m);
          const dx = reach / len;
          const [a1, b1] = toPx(trace.x - dx, y - m * dx);
          const [a2, b2] = toPx(trace.x + dx, y + m * dx);
          g.strokeStyle = '#1a1a2e';
          g.lineWidth = 1.6;
          g.beginPath();
          g.moveTo(a1, b1);
          g.lineTo(a2, b2);
          g.stroke();
        }
        g.fillStyle = '#fff';
        g.strokeStyle = color;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(px, py, 6.5, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curves, size, v.cx, v.cy, v.k, trace, slope]);

  if (curves.length === 0) return null;

  const local = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = canvas.current?.getBoundingClientRect();
    return r ? [e.clientX - r.left, e.clientY - r.top] : [0, 0];
  };

  const traceAt = (px: number, py: number) => {
    const [x, y] = toWorld(px, py);
    let best = 0;
    let bestD = Infinity;
    curves.forEach((cv, i) => {
      const d = Math.abs(cv.f(x) - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setTrace({ x: Number(x.toFixed(3)), i: trace && bestD > 40 * v.k ? trace.i : best });
  };

  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = local(e);
    pointers.current.set(e.pointerId, { x, y });
    const pts = [...pointers.current.values()];
    gesture.current = { moved: false, dist: pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0, view: v };
  };
  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !gesture.current) return;
    const [x, y] = local(e);
    pointers.current.set(e.pointerId, { x, y });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (gesture.current.dist > 0 && dist > 0) {
        const k = Math.min(50, Math.max(0.0005, gesture.current.view.k * (gesture.current.dist / dist)));
        setView({ ...v, k });
      }
      gesture.current.moved = true;
      return;
    }
    const dx = x - prev.x;
    const dy = y - prev.y;
    if (!gesture.current.moved && Math.hypot(dx, dy) < 3) return;
    gesture.current.moved = true;
    setView({ ...v, cx: v.cx - dx * v.k, cy: v.cy + dy * v.k });
  };
  const onUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const [x, y] = local(e);
    const tapped = gesture.current && !gesture.current.moved && pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    if (tapped) {
      haptic(4);
      traceAt(x, y);
    }
    if (pointers.current.size === 0) gesture.current = null;
  };
  const zoom = (factor: number, at?: [number, number]) => {
    const [px, py] = at ?? [size.w / 2, size.h / 2];
    const [wx, wy] = toWorld(px, py);
    const k = Math.min(50, Math.max(0.0005, v.k * factor));
    setView({ k, cx: wx - (px - size.w / 2) * k, cy: wy + (py - size.h / 2) * k });
  };
  const onWheel = (e: ReactWheelEvent<HTMLCanvasElement>) => zoom(e.deltaY > 0 ? 1.15 : 0.87, local(e));

  const t = trace && curves[trace.i] ? { cv: curves[trace.i], y: curves[trace.i].f(trace.x), m: curves[trace.i].d(trace.x) } : null;

  return (
    <figure className="graph">
      <div className="graph-legend">
        {curves.map((c, i) => (
          <button key={c.src} className="graph-fn" data-on={trace?.i === i ? '' : undefined} onClick={() => setTrace({ x: trace?.x ?? 1, i })}>
            <i style={{ background: COLORS[i % COLORS.length] }} />
            <MathView text={`y = ${c.src}`} />
          </button>
        ))}
      </div>
      <div className="graph-stage" ref={wrap} style={{ height }}>
        <canvas ref={canvas} style={{ width: size.w, height: size.h }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel} role="img" aria-label={`Graph of ${curves.map((c) => `y = ${c.src}`).join(' and ')}`} />
        <div className="graph-tools">
          <button onClick={() => zoom(0.7)} aria-label="Zoom in"><Icon name="plus" size={17} /></button>
          <button onClick={() => zoom(1.4)} aria-label="Zoom out"><span style={{ fontSize: 20, lineHeight: 1, fontWeight: 700 }}>−</span></button>
          <button onClick={() => { setView(null); setTrace(null); }} aria-label="Reset view"><Icon name="refresh" size={16} /></button>
        </div>
        {!trace && <span className="graph-tip">Tap the curve · drag to move · pinch to zoom</span>}
      </div>
      <div className="graph-read">
        {t && Number.isFinite(t.y) ? (
          <>
            <span><b>x</b> {fmt(trace!.x)}</span>
            <span><b>y</b> {fmt(t.y)}</span>
            <span className="slope"><b>slope</b> {Number.isFinite(t.m) ? fmt(t.m) : '—'}</span>
          </>
        ) : (
          <span className="faint">{caption || 'Rebuilt from the function in your notes.'}</span>
        )}
        <button className="graph-toggle" data-on={slope ? '' : undefined} onClick={() => setSlope(!slope)} aria-pressed={slope}>
          <Icon name="chart" size={14} /> Slope
        </button>
      </div>
      {slope && (
        <figcaption className="graph-cap">
          Dashed: the slope of the curve at each x — its derivative, <MathView text={`y = ${curves[trace?.i ?? 0].dText}`} />. Where the dashed curve crosses zero, the solid one is flat.
        </figcaption>
      )}
    </figure>
  );
}
