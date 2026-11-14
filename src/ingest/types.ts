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
  page?: number;
}

export interface RawDoc {
  kind: 'pdf' | 'docx' | 'text';
  fileName: string;
  title?: string;
  pages?: number;
  paras: RawPara[];
}

export type Block =
  | { t: 'h'; text: string }
  | { t: 'p'; text: string }
  | { t: 'math'; text: string }
  | { t: 'list'; ordered: boolean; items: string[] }
  | { t: 'example'; title: string; lines: string[] }
  | { t: 'note'; label: string; text: string };

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
}

export interface IngestProgress {
  stage: 'reading' | 'structuring' | 'exercises' | 'path' | 'done';
  /** 0..1 */
  progress: number;
  detail?: string;
}
