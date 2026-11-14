import { ConceptId, Problem } from '../engine/types';

/** A paragraph as it comes out of a file, before any structure is imposed. */
export interface RawPara {
  text: string;
  /** Heading level hint from the file itself (0 = document title, 1–3 = headings). */
  level?: number;
  list?: 'bullet' | 'number';
  bold?: boolean;
  /** Font size relative to the document's body text (1 = body). */
  scale?: number;
  /** The paragraph is an equation on its own line. */
  math?: boolean;
  /** A picture or drawing sits here in the file. */
  figure?: boolean;
  page?: number;
  /** Left edge on the page, in points (PDF only) — tells nested contents lines apart. */
  x?: number;
}

export interface RawDoc {
  kind: 'pdf' | 'docx' | 'text';
  fileName: string;
  title?: string;
  pages?: number;
  paras: RawPara[];
  /** How chapter and section headings were found, and how many front/back pages were left out. */
  tocVia?: 'outline' | 'contents' | 'numbering' | 'type';
  skippedPages?: number;
}

export type Block =
  | { t: 'h'; text: string }
  | { t: 'p'; text: string }
  | { t: 'math'; text: string }
  | { t: 'list'; ordered: boolean; items: string[] }
  | { t: 'example'; title: string; lines: string[] }
  | { t: 'note'; label: string; text: string }
  /** A graph rebuilt from the functions the notes name. `text` is the caption. */
  | { t: 'graph'; text: string; fns: string[] };

export interface Topic {
  id: string;
  title: string;
  blocks: Block[];
  exercises: Problem[];
  concepts: ConceptId[];
}

export interface Unit {
  id: string;
  title: string;
  topics: Topic[];
}

export interface LeraDoc {
  id: string;
  title: string;
  fileName: string;
  kind: RawDoc['kind'] | 'sample';
  addedAt: string;
  pages?: number;
  units: Unit[];
  /** term (lower-case) → definition */
  glossary: Record<string, string>;
  /** How the structure was produced. */
  via: 'local' | 'ai';
  warnings: string[];
  tocVia?: RawDoc['tocVia'];
  skippedPages?: number;
}

export interface IngestProgress {
  stage: 'reading' | 'structuring' | 'exercises' | 'path' | 'done';
  /** 0..1 */
  progress: number;
  detail?: string;
}
