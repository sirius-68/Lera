import { AiConfig } from '../ai/providers';
import { ConceptId, LineStatus, ProblemKind, Severity, Subject, Verdict } from '../engine/types';
import { LeraDoc } from '../ingest/types';

export interface Profile {
  name: string;
  email: string;
  age?: number;
  language: string;
  /** True once a language was picked in Settings; until then the app follows the phone's own. */
  langSet?: boolean;
  /** Answers from the onboarding quiz, in order. */
  goal?: string;
  /** School, university, self-taught, returning — from onboarding. */
  stage?: string;
  /** 'morning' | 'afternoon' | 'evening' | 'night': when reminders should land. */
  studyTime?: string;
  /** False after signing out: the app then asks for the password before showing anything. */
  signedIn?: boolean;
  struggle?: string;
  explainStyle?: string;
  frequency?: string;
  focusMinutes: number;
  /** What the learner is studying; decides which ideas are offered for practice. */
  subjects: Subject[];
  /** How maths feels right now, from onboarding: 0 (lost) … 3 (confident). */
  feel?: number;
  /** XP to earn each day. */
  dailyXp: number;
  /** 'line' marks each line as it is written; 'end' waits until the learner asks. */
  checkMode: 'line' | 'end';
  notifications: boolean;
  plan: 'none' | 'trial';
  trialStarted?: string;
  onboarded: boolean;
  createdAt?: string;
}

export interface Highlight {
  id: string;
  topicId: string;
  /** Index of the block inside the topic, and character range inside that block's text. */
  block: number;
  /** For list / example blocks: which item or line. */
  item: number;
  start: number;
  end: number;
  color: string;
  underline?: boolean;
}

export interface Note {
  id: string;
  topicId: string;
  block: number;
  item: number;
  offset: number;
  title: string;
  content: string;
  quote: string;
  createdAt: string;
}

export interface SavedItem {
  id: string;
  topicId: string;
  topicTitle: string;
  text: string;
  createdAt: string;
  /** Pinned items sit at the top of the notebook. */
  pinned?: boolean;
}

/**
 * Something done in the app that the attempt log doesn't already record. Kept short (see store/insights.ts).
 * `d` carries at most a few small values: a topic or concept id, a count, a label.
 */
export interface LearnEvent {
  at: string;
  t: 'open' | 'onboarded' | 'lesson' | 'session_start' | 'session_end' | 'hint' | 'reveal' | 'answer_only' | 'ask' | 'sense' | 'widget' | 'celebrate' | 'upload';
  d?: Record<string, string | number | boolean>;
}

/** One message in a conversation with Lera. */
export interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  via?: 'ai' | 'local' | 'error';
  at: string;
}

/** What Lera knows about one concept for one learner. */
export interface ConceptState {
  id: ConceptId;
  gaps: number;
  slips: number;
  strategy: number;
  hints: number;
  /** Problems on this concept solved with no mark against it. */
  clean: number;
  /** A gap that hasn't yet been cleared by two clean days. */
  outstanding: boolean;
  /** Slips keep recurring: treated as a pattern worth a prompt. */
  rushing: boolean;
  /** Distinct days with a clean solve since the last gap. */
  cleanDays: string[];
  slipDays: string[];
  lastGap?: string;
  lastSeen?: string;
  /** Day (YYYY-MM-DD) this concept should come back. */
  due?: string;
  /** 0 = just flagged … 3 = held over a month. */
  stage: number;
  /** Most recent diagnosis title, for the queue. */
  lastTitle?: string;
}

export interface AttemptLine {
  text: string;
  status: LineStatus;
  code?: string;
  concept?: ConceptId;
  severity?: Severity;
}

export interface AttemptRecord {
  id: string;
  problemId: string;
  topicId?: string;
  day: string;
  at: string;
  kind: ProblemKind;
  prompt: string;
  given: string;
  source: 'notes' | 'generated' | 'review';
  concepts: ConceptId[];
  lines: AttemptLine[];
  verdict: Verdict;
  marks: { code: string; concept: ConceptId; severity: Severity; title: string; line: number }[];
  /** Highest hint rung used (0 = none). */
  hintRung: number;
  approach?: string;
  steps: number;
  cleanSteps: number;
  seconds: number;
}

export interface AppState {
  version: 1;
  profile: Profile;
  ai: AiConfig;
  docs: LeraDoc[];
  activeDocId?: string;
  lastTopicId?: string;
  highlights: Highlight[];
  notes: Note[];
  saved: SavedItem[];
  concepts: Partial<Record<ConceptId, ConceptState>>;
  attempts: AttemptRecord[];
  /** problemId → day it was first solved */
  solved: Record<string, string>;
  /** topicIds whose lesson has been opened */
  read: Record<string, string>;
  /** conceptId → the learner said the explanation made sense (day) or didn't ('no') */
  understood: Record<string, string>;
  /** Conversations with Lera, one thread per lesson (and 'general' for everything else). */
  chats: Record<string, ChatMsg[]>;
  /** What else was done in the app, newest last, for the learner model. */
  events: LearnEvent[];
}
