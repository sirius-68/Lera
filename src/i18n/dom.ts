import { getLang, line } from './index';

/**
 * Puts the screen into the app's language as it is drawn.
 *
 * The screens are written in English. Rather than wrap every line of every screen by hand, this watches the
 * page and swaps each piece of text for its translation (i18n `line`), and does so again whenever the page
 * changes. Only the text inside a node is changed, never the nodes themselves, so the screen's own updates
 * carry on working: what the app last wrote is remembered beside what is shown.
 */
const wrote = new WeakMap<Text, string>();
const source = new WeakMap<Text, string>();
const ATTRS = ['placeholder', 'aria-label', 'title'] as const;
const attrSource = new WeakMap<Element, Record<string, string>>();
const SKIP = '.katex, script, style, textarea, [data-asis]';

function put(node: Text, value: string): void {
  if (node.nodeValue !== value) node.nodeValue = value;
  wrote.set(node, value);
}

function attrs(el: Element): void {
  for (const a of ATTRS) {
    const now = el.getAttribute(a);
    if (now === null) continue;
    const kept = attrSource.get(el) ?? {};
    // changed by the app since we last looked: that is the new English
    if (kept[a] === undefined || line(kept[a]) !== now) kept[a] = now;
    attrSource.set(el, kept);
    const out = line(kept[a]);
    if (out !== now) el.setAttribute(a, out);
  }
}

function visit(el: Element): void {
  if (el.closest(SKIP)) return;
  attrs(el);
  const texts: Text[] = [];
  for (const n of el.childNodes) if (n.nodeType === 3) texts.push(n as Text);
  if (!texts.length) return;
  for (const t of texts) if (!source.has(t) || t.nodeValue !== wrote.get(t)) source.set(t, t.nodeValue ?? '');
  // "Part {n} of {m}" is drawn as several pieces of text in a row: they are one line, and translate as one
  if (texts.length > 1 && texts.length === el.childNodes.length) {
    const whole = texts.map((t) => source.get(t)).join('');
    const out = line(whole);
    if (out !== whole) {
      put(texts[0], out);
      for (const t of texts.slice(1)) put(t, '');
      return;
    }
  }
  for (const t of texts) put(t, line(source.get(t)!));
}

function sweep(root: Element): void {
  visit(root);
  for (const el of root.querySelectorAll('*')) visit(el);
}

let started = false;

/** Start translating the page. Safe to call more than once; does nothing while the app is in English. */
export function translatePage(): void {
  if (started || typeof document === 'undefined') return;
  started = true;
  const seen = new Set<Element>();
  let queued = false;
  const flush = () => {
    queued = false;
    if (getLang() === 'en') return seen.clear();
    for (const el of seen) if (el.isConnected) sweep(el);
    seen.clear();
  };
  new MutationObserver((records) => {
    if (getLang() === 'en') return;
    for (const r of records) {
      if (r.type === 'characterData') {
        const p = r.target.parentElement;
        if (p && r.target.nodeValue !== wrote.get(r.target as Text)) visit(p);
      } else if (r.type === 'attributes') visit(r.target as Element);
      else {
        if (r.target.nodeType === 1) visit(r.target as Element);
        for (const n of r.addedNodes) if (n.nodeType === 1) seen.add(n as Element);
      }
    }
    if (seen.size && !queued) {
      queued = true;
      queueMicrotask(flush);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
  if (getLang() !== 'en') sweep(document.body);
}
