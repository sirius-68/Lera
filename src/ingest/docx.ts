import JSZip from 'jszip';
import { cleanText } from './text';
import { RawDoc, RawPara } from './types';
import { XNode, find, kid, kids, parseXml } from './xml';

/**
 * Word documents are a zip of XML. Reading them directly (rather than via an
 * HTML converter) keeps two things most converters throw away: real heading
 * levels from the style sheet, and equations typed with Word's equation editor.
 */

const simple = (s: string): boolean => /^[\w.]+$/.test(s);

/** Already one bracketed group, e.g. "(x+2)" but not "(x+2)(x-1)". */
function wrapped(s: string): boolean {
  if (!s.startsWith('(') || !s.endsWith(')')) return false;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    if (depth === 0 && i < s.length - 1) return false;
  }
  return depth === 0;
}

const group = (s: string): string => (simple(s) || wrapped(s) ? s : `(${s})`);

/** Office Math (OMML) → the linear text the algebra engine reads. */
export function ommlToText(n: XNode): string {
  const all = (x: XNode | undefined): string => (x ? x.children.map(ommlToText).join('') : '');
  switch (n.name) {
    case 'm:t':
      return n.text;
    case 'm:r':
      return kids(n, 'm:t').map((t) => t.text).join('');
    case 'm:f': {
      const top = all(kid(n, 'm:num'));
      const bottom = all(kid(n, 'm:den'));
      return `${group(top)}/${group(bottom)}`;
    }
    case 'm:sSup':
      return `${group(all(kid(n, 'm:e')))}^${group(all(kid(n, 'm:sup')))}`;
    case 'm:sSub':
      return `${all(kid(n, 'm:e'))}_${all(kid(n, 'm:sub'))}`;
    case 'm:sSubSup':
      return `${all(kid(n, 'm:e'))}_${all(kid(n, 'm:sub'))}^${group(all(kid(n, 'm:sup')))}`;
    case 'm:rad': {
      const deg = all(kid(n, 'm:deg')).trim();
      const body = all(kid(n, 'm:e'));
      return !deg || deg === '2' ? `sqrt(${body})` : `(${body})^(1/${deg})`;
    }
    case 'm:d': {
      const pr = kid(n, 'm:dPr');
      const beg = kid(pr, 'm:begChr')?.attrs['m:val'] ?? '(';
      const end = kid(pr, 'm:endChr')?.attrs['m:val'] ?? ')';
      const sep = kid(pr, 'm:sepChr')?.attrs['m:val'] ?? ',';
      const inner = kids(n, 'm:e').map(all).join(sep);
      return `${beg}${inner}${end}`;
    }
    case 'm:func':
      return `${all(kid(n, 'm:fName'))}(${all(kid(n, 'm:e'))})`;
    case 'm:eqArr':
      return kids(n, 'm:e').map(all).join('; ');
    case 'm:nary': {
      const chr = kid(kid(n, 'm:naryPr'), 'm:chr')?.attrs['m:val'] ?? '∫';
      return `${chr}${all(kid(n, 'm:e'))}`;
    }
    case 'm:rPr':
    case 'm:ctrlPr':
    case 'm:fPr':
    case 'm:dPr':
    case 'm:radPr':
    case 'm:sSupPr':
    case 'm:sSubPr':
    case 'm:naryPr':
    case 'm:funcPr':
    case 'm:oMathParaPr':
    case 'w:rPr':
      return '';
    default:
      return all(n);
  }
}

interface RunInfo {
  text: string;
  bold: boolean;
  size?: number;
  math: boolean;
}

function runText(r: XNode): RunInfo {
  const pr = kid(r, 'w:rPr');
  const b = kid(pr, 'w:b');
  const bold = !!b && b.attrs['w:val'] !== '0' && b.attrs['w:val'] !== 'false';
  const sz = kid(pr, 'w:sz')?.attrs['w:val'];
  const va = kid(pr, 'w:vertAlign')?.attrs['w:val'];
  let text = '';
  for (const c of r.children) {
    if (c.name === 'w:t') text += c.text;
    else if (c.name === 'w:tab') text += ' ';
    else if (c.name === 'w:br' || c.name === 'w:cr') text += '\n';
    else if (c.name === 'w:noBreakHyphen') text += '-';
    else if (c.name === 'w:sym') {
      const code = parseInt(c.attrs['w:char'] ?? '', 16);
      // Symbol-font private-use codes sit 0xF000 above their real character
      if (Number.isFinite(code)) text += String.fromCodePoint(code >= 0xf000 ? code - 0xf000 : code);
    }
  }
  if (va === 'superscript' && text.trim()) text = /^[\w.]$/.test(text.trim()) ? `^${text.trim()}` : `^(${text.trim()})`;
  if (va === 'subscript' && text.trim()) text = `_${text.trim()}`;
  return { text, bold, size: sz ? Number(sz) / 2 : undefined, math: false };
}

function collectRuns(n: XNode, out: RunInfo[]): void {
  for (const c of n.children) {
    switch (c.name) {
      case 'w:r':
        out.push(runText(c));
        break;
      case 'm:oMath':
        out.push({ text: ` $${ommlToText(c).trim()}$ `, bold: false, math: true });
        break;
      case 'm:oMathPara':
        for (const mm of kids(c, 'm:oMath')) out.push({ text: ` $${ommlToText(mm).trim()}$ `, bold: false, math: true });
        break;
      case 'w:hyperlink':
      case 'w:smartTag':
      case 'w:ins':
      case 'w:sdt':
      case 'w:sdtContent':
      case 'w:fldSimple':
        collectRuns(c, out);
        break;
      default:
        break;
    }
  }
}

interface StyleInfo {
  level?: number;
  size?: number;
  bold?: boolean;
}

function readStyles(xml: string | undefined): { styles: Record<string, StyleInfo>; body: number } {
  const styles: Record<string, StyleInfo> = {};
  let body = 11;
  if (!xml) return { styles, body };
  const root = parseXml(xml);
  const defSz = find(root, 'w:rPrDefault')[0];
  const sz = defSz ? find(defSz, 'w:sz')[0]?.attrs['w:val'] : undefined;
  if (sz) body = Number(sz) / 2;
  for (const s of find(root, 'w:style')) {
    const id = s.attrs['w:styleId'];
    if (!id) continue;
    const name = (kid(s, 'w:name')?.attrs['w:val'] ?? id).toLowerCase();
    const info: StyleInfo = {};
    const h = /heading\s*(\d)/.exec(name) ?? /^заголовок\s*(\d)/.exec(name) ?? /^titre\s*(\d)/.exec(name);
    if (h) info.level = Math.min(3, Number(h[1]));
    else if (name === 'title' || name === 'название' || name === 'titre') info.level = 0;
    const outline = kid(kid(s, 'w:pPr'), 'w:outlineLvl')?.attrs['w:val'];
    if (info.level === undefined && outline !== undefined) info.level = Math.min(3, Number(outline) + 1);
    const rpr = kid(s, 'w:rPr');
    const ssz = kid(rpr, 'w:sz')?.attrs['w:val'];
    if (ssz) info.size = Number(ssz) / 2;
    if (kid(rpr, 'w:b')) info.bold = true;
    if (s.attrs['w:default'] === '1' && s.attrs['w:type'] === 'paragraph' && info.size) body = info.size;
    styles[id] = info;
  }
  return { styles, body };
}

function readNumbering(xml: string | undefined): Record<string, 'bullet' | 'number'> {
  const out: Record<string, 'bullet' | 'number'> = {};
  if (!xml) return out;
  const root = parseXml(xml);
  const abstract: Record<string, 'bullet' | 'number'> = {};
  for (const a of find(root, 'w:abstractNum')) {
    const fmt = find(a, 'w:numFmt')[0]?.attrs['w:val'] ?? 'decimal';
    abstract[a.attrs['w:abstractNumId']] = fmt === 'bullet' ? 'bullet' : 'number';
  }
  for (const n of find(root, 'w:num')) {
    const ref = kid(n, 'w:abstractNumId')?.attrs['w:val'];
    if (ref !== undefined) out[n.attrs['w:numId']] = abstract[ref] ?? 'number';
  }
  return out;
}

export async function readDocx(data: ArrayBuffer | Uint8Array, fileName: string): Promise<RawDoc> {
  const zip = await JSZip.loadAsync(data);
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (!docXml) throw new Error('This doesn’t look like a Word document — it has no document body.');
  const { styles, body } = readStyles(await zip.file('word/styles.xml')?.async('string'));
  const numbering = readNumbering(await zip.file('word/numbering.xml')?.async('string'));

  const root = parseXml(docXml);
  const bodyNode = find(root, 'w:body')[0];
  if (!bodyNode) throw new Error('This Word document has no readable text.');

  const paras: RawPara[] = [];
  let title: string | undefined;

  const handleParagraph = (p: XNode) => {
    const ppr = kid(p, 'w:pPr');
    const styleId = kid(ppr, 'w:pStyle')?.attrs['w:val'];
    const style = styleId ? styles[styleId] : undefined;
    const numPr = kid(ppr, 'w:numPr');
    const numId = kid(numPr, 'w:numId')?.attrs['w:val'];
    const runs: RunInfo[] = [];
    collectRuns(p, runs);
    const raw = runs.map((r) => r.text).join('');
    for (const piece of raw.split('\n')) {
      const visible = runs.filter((r) => r.text.trim());
      const allBold = visible.length > 0 && (visible.every((r) => r.bold) || !!style?.bold);
      const size = visible.find((r) => r.size)?.size ?? style?.size ?? body;
      const mathOnly = visible.length > 0 && visible.every((r) => r.math);
      // inline equations are wrapped in $…$ so the lesson can typeset them; a line that is only maths drops the markers
      let text = cleanText(piece).replace(/\$\s+([.,;:!?)])/g, '$$$1').replace(/\(\s+\$/g, '($$');
      if (mathOnly) text = text.replace(/\$/g, '').trim();
      if (!text) continue;
      const para: RawPara = { text, scale: size / body };
      if (style?.level !== undefined) para.level = style.level;
      if (numId && numId !== '0' && para.level === undefined) para.list = numbering[numId] ?? 'number';
      if (allBold) para.bold = true;
      if (mathOnly) para.math = true;
      if (para.level === 0 && !title) title = text;
      paras.push(para);
    }
    // a drawing or picture in this paragraph: leave a marker so its graph can be rebuilt from the text beside it
    if (find(p, 'w:drawing').length || find(p, 'w:pict').length) paras.push({ text: '[figure]', figure: true });
  };

  const walkBody = (n: XNode) => {
    for (const c of n.children) {
      if (c.name === 'w:p') handleParagraph(c);
      else if (c.name === 'w:tbl') {
        for (const row of find(c, 'w:tr')) {
          const cells = kids(row, 'w:tc').map((tc) => {
            const runs: RunInfo[] = [];
            for (const p of find(tc, 'w:p')) collectRuns(p, runs);
            return cleanText(runs.map((r) => r.text).join(' ')).replace(/\$\s+([.,;:!?)])/g, '$$$1');
          });
          const line = cells.filter(Boolean).join('  |  ');
          if (line) paras.push({ text: line });
        }
      } else if (c.name === 'w:sdt' || c.name === 'w:sdtContent') walkBody(c);
    }
  };
  walkBody(bodyNode);

  return { kind: 'docx', fileName, title, paras };
}
