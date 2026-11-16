import { aiStructure } from '../ai/tasks';
import { AiConfig, aiReady } from '../ai/providers';
import { readDocx } from './docx';
import { readPdfWith } from './pdf';
import { loadPdfjs } from './pdfLoader';
import { structureDoc } from './structure';
import { cleanText } from './text';
import { IngestProgress, LeraDoc, RawDoc, RawPara } from './types';

export type { LeraDoc, IngestProgress } from './types';

function sniff(bytes: Uint8Array, name: string): 'pdf' | 'docx' | 'doc' | 'text' {
  const head = String.fromCharCode(...bytes.slice(0, 5));
  if (head.startsWith('%PDF')) return 'pdf';
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return 'docx';
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) return 'doc';
  if (/\.pdf$/i.test(name)) return 'pdf';
  if (/\.docx$/i.test(name)) return 'docx';
  if (/\.doc$/i.test(name)) return 'doc';
  return 'text';
}

/** Plain text and Markdown: blank lines separate paragraphs, # marks headings. */
export function readText(text: string, fileName: string): RawDoc {
  const paras: RawPara[] = [];
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.length) paras.push({ text: cleanText(buffer.join(' ')) });
    buffer = [];
  };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      paras.push({ text: cleanText(h[2]), level: h[1].length - 1 });
      continue;
    }
    const li = /^([-*•]|\d{1,2}[.)])\s+(.*)$/.exec(line);
    if (li) {
      flush();
      paras.push({ text: cleanText(li[2]), list: /^\d/.test(li[1]) ? 'number' : 'bullet' });
      continue;
    }
    if (/^\$\$.*\$\$$/.test(line)) {
      flush();
      paras.push({ text: cleanText(line.replace(/\$\$/g, '')), math: true });
      continue;
    }
    buffer.push(line);
  }
  flush();
  return { kind: 'text', fileName, paras: paras.filter((p) => p.text) };
}

/**
 * Topic and exercise ids are only unique inside one document ("u1t1", "e3").
 * Prefix them with the document's id so two sets of notes can live side by side.
 */
export function namespaceDoc(doc: LeraDoc): LeraDoc {
  const pre = `${doc.id}.`;
  const tag = (id: string) => (id.startsWith(pre) ? id : pre + id);
  return {
    ...doc,
    units: doc.units.map((u) => ({
      ...u,
      id: tag(u.id),
      topics: u.topics.map((t) => ({
        ...t,
        id: tag(t.id),
        exercises: t.exercises.map((e) => ({ ...e, id: tag(e.id), topicId: tag(t.id) })),
      })),
    })),
  };
}

/** The longest file, in pages, that is handed to the AI to arrange. */
export const AI_PAGE_LIMIT = 120;

export interface IngestOptions {
  ai?: AiConfig | null;
  onProgress?: (p: IngestProgress) => void;
  signal?: AbortSignal;
  /**
   * Called once the words have been read and before they are arranged into lessons. It may return the same
   * paragraphs in another language (after asking the person), or null to leave them alone.
   */
  translate?: (paras: RawPara[]) => Promise<RawPara[] | null>;
}

/** File bytes → structured, interactive notes. */
export async function ingestBytes(bytes: Uint8Array, fileName: string, opts: IngestOptions = {}): Promise<LeraDoc> {
  const report = (stage: IngestProgress['stage'], progress: number, detail?: string) => opts.onProgress?.({ stage, progress, detail });
  report('reading', 0.02, fileName);
  const type = sniff(bytes, fileName);
  let raw: RawDoc;
  if (type === 'doc') {
    throw new Error('Old .doc files can’t be read. Open it in Word and save as .docx or PDF, then try again.');
  } else if (type === 'pdf') {
    const pdfjs = await loadPdfjs();
    raw = await readPdfWith(pdfjs, bytes, fileName, (f) => report('reading', 0.05 + f * 0.4));
  } else if (type === 'docx') {
    raw = await readDocx(bytes, fileName);
  } else {
    raw = readText(new TextDecoder('utf-8').decode(bytes), fileName);
  }
  if (raw.paras.length === 0) throw new Error('This file doesn’t seem to contain any text I can read.');
  if (opts.translate) {
    const translated = await opts.translate(raw.paras);
    if (translated) raw = { ...raw, paras: translated };
  }
  report('structuring', 0.5);

  let doc: LeraDoc;
  // Up to about 120 pages the AI arranges the file. A whole book goes through the built-in reader: its own contents
  // page is a better guide than a model's guess, and it takes seconds where the AI would take many minutes.
  if (aiReady(opts.ai) && (raw.pages ?? 0) <= AI_PAGE_LIMIT) {
    try {
      doc = await aiStructure(opts.ai, raw, (f) => report('structuring', 0.5 + f * 0.3), opts.signal);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      doc = structureDoc(raw);
      const why = e instanceof Error ? e.message : 'unknown error';
      doc.warnings.unshift(`The AI reader wasn’t available (${why}), so these notes were organised by the built-in rules instead.`);
    }
  } else {
    doc = structureDoc(raw);
    if (aiReady(opts.ai)) doc.warnings.unshift(`This file is ${raw.pages} pages, so it was arranged by Lera’s built-in reader, not the AI (which takes files up to ${AI_PAGE_LIMIT} pages). The AI still explains, checks and answers inside it.`);
  }
  if (doc.units.length === 0) throw new Error('There wasn’t enough readable text in this file to build lessons from.');
  doc = namespaceDoc(doc);
  doc.tocVia = raw.tocVia;
  doc.skippedPages = raw.skippedPages;
  report('exercises', 0.85);
  report('path', 0.95);
  report('done', 1);
  return doc;
}
