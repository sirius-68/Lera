// Copies Lera's 50 moods from the web mascot into data the native mascot draws (mascot/moods.json).
//   node apps/mobile/scripts/gen-lera.mjs          (needs playwright; run from the repo root)
// Each mood becomes a flat list of shapes with their final colours and positions, tagged by the part
// they belong to (shadow, body, eye, fx) so the native side can breathe, blink and float them.
import * as esbuild from 'esbuild';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');

const built = await esbuild.build({
  absWorkingDir: root, entryPoints: [path.join(here, 'lera-harness.tsx')], bundle: true, write: false, outdir: 'out',
  jsx: 'automatic', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.woff2': 'dataurl', '.png': 'dataurl', '.svg': 'dataurl' }, logLevel: 'error',
  // one copy of React: the web app's, not the native app's
  alias: { react: path.join(root, 'node_modules/react'), 'react-dom': path.join(root, 'node_modules/react-dom') },
});
const js = built.outputFiles.find((f) => f.path.endsWith('.js')).text;
const css = built.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 3200 } });
page.on('pageerror', (e) => console.log('page error:', String(e).slice(0, 300)));
await page.setContent(`<!doctype html><style>${css}</style><div id="root"></div>`);
await page.addScriptTag({ content: js });
await page.waitForTimeout(250);

const moods = await page.evaluate(() => {
  // freeze every animation at a pose: one-off entrances at their end, loops a third of the way through
  for (const a of document.getAnimations()) {
    const t = a.effect?.getComputedTiming?.();
    if (!t) continue;
    const el = a.effect.target;
    if (el?.classList?.contains('l-breathe') || el?.classList?.contains('l-shadow')) {
      // breathing is the native side's job
      a.pause();
      a.currentTime = 0;
    } else if (t.iterations === Infinity) {
      a.pause();
      a.currentTime = (t.delay ?? 0) + 0.3 * Number(t.duration ?? 0);
    } else a.finish();
  }
  const r = (n) => Math.round(n * 100) / 100;
  const GEOM = { path: ['d'], rect: ['x', 'y', 'width', 'height', 'rx', 'ry'], circle: ['cx', 'cy', 'r'], ellipse: ['cx', 'cy', 'rx', 'ry'], line: ['x1', 'y1', 'x2', 'y2'], polygon: ['points'], polyline: ['points'], text: ['x', 'y'] };
  const out = {};
  for (const cell of document.querySelectorAll('[data-cell]')) {
    const svg = cell.querySelector('svg');
    const probe = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(probe);
    const base = probe.getScreenCTM().inverse();
    probe.remove();
    const shapes = [];
    for (const el of svg.querySelectorAll(Object.keys(GEOM).join(','))) {
      let opacity = 1;
      let hidden = false;
      for (let n = el; n && n !== cell; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden') hidden = true;
        opacity *= Number(cs.opacity);
      }
      if (hidden || opacity < 0.03) continue;
      const cs = getComputedStyle(el);
      const type = el.tagName.toLowerCase();
      const a = {};
      for (const k of GEOM[type]) {
        const v = el.getAttribute(k);
        if (v !== null) a[k] = k === 'd' || k === 'points' ? v : Number(v);
      }
      const paint = (v) => (v === 'none' || v.startsWith('url') ? null : v);
      const fill = paint(cs.fill);
      const stroke = paint(cs.stroke);
      const sw = parseFloat(cs.strokeWidth);
      if (!fill && !(stroke && sw > 0)) continue;
      a.fill = fill ?? 'none';
      if (fill && Number(cs.fillOpacity) < 1) a.fillOpacity = r(Number(cs.fillOpacity));
      if (stroke && sw > 0) {
        a.stroke = stroke;
        a.strokeWidth = r(sw);
        if (cs.strokeLinecap !== 'butt') a.strokeLinecap = cs.strokeLinecap;
        if (cs.strokeLinejoin !== 'miter') a.strokeLinejoin = cs.strokeLinejoin;
        if (cs.strokeDasharray !== 'none') a.strokeDasharray = cs.strokeDasharray.replace(/px/g, '');
        if (Number(cs.strokeOpacity) < 1) a.strokeOpacity = r(Number(cs.strokeOpacity));
      }
      if (opacity < 0.995) a.opacity = r(opacity);
      if (type === 'text') {
        a.text = el.textContent;
        a.fontSize = r(parseFloat(cs.fontSize));
        a.fontWeight = cs.fontWeight;
        if (cs.textAnchor !== 'start') a.textAnchor = cs.textAnchor;
      }
      const m = base.multiply(el.getScreenCTM());
      if (Math.abs(m.a - 1) + Math.abs(m.b) + Math.abs(m.c) + Math.abs(m.d - 1) + Math.abs(m.e) + Math.abs(m.f) > 0.005) a.transform = `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map((n) => Math.round(n * 1000) / 1000).join(' ')})`;
      const part = el.classList.contains('l-shadow') ? 's' : el.closest('.l-eyes-open') ? 'e' : el.closest('.l-fx') ? 'f' : 'b';
      shapes.push([part, type, a]);
    }
    out[cell.dataset.cell] = shapes;
  }
  return out;
});
await browser.close();
const file = path.join(here, '../mascot/moods.json');
await writeFile(file, JSON.stringify({ viewBox: '-12 -16 86 100', moods }));
console.log(`${Object.keys(moods).length} moods → ${path.relative(root, file)}`, Object.entries(moods).map(([k, v]) => `${k}:${v.length}`).join(' '));
