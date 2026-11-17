import { useEffect, useMemo, useRef, useState } from 'react';
import { aiCheckOpen, aiDiagnose, aiSimplify } from '../ai/tasks';
import { aiReady } from '../ai/providers';
import { analyze, cleanPath, hintLadder, HintLadder } from '../engine/analyze';
import { confirmsStep, isCalc } from '../engine/calc/check';
import { conceptOf } from '../engine/concepts';
import { PLAIN } from '../engine/concepts-calc';
import { AttemptAnalysis, CheckedLine, Diagnosis, Problem } from '../engine/types';
import { Lera, Mood } from '../mascot/Lera';
import { actions, getState, useStore } from '../store';
import { badges, levelOf, totalXp, weekStrip, xpByDay } from '../store/game';
import { WritePractice } from './MorePractice';
import { addDays, buildSession, dayOf, findTopic, Session, streak } from '../store/learner';
import { weaknesses } from '../store/weakness';
import { back, openOverlay, replace, Route, setBackGuard } from '../store/nav';
import { Button3D, Confetti, CountUp, LeraSays, Ring, haptic, toast } from '../ui/kit';
import { CelebrationFlow, Scene } from '../ui/Celebrate';
import { Icon } from '../ui/icons';
import { MathField, MathFieldHandle } from '../ui/MathField';
import type { Kind } from '../ui/mathrow';
import { MathView, RichText } from '../ui/math';
import { StepList } from '../ui/Steps';
import { TermText } from '../ui/terms';
import { WeakCard } from './Main';
import { msg, promptText, t as tr, tn } from '../i18n';

interface Result {
  problem: Problem;
  verdict: AttemptAnalysis['verdict'];
  marks: Diagnosis[];
  hintRung: number;
  seconds: number;
  steps: number;
  cleanSteps: number;
  skipped?: boolean;
}

const SOURCE_LABEL: Record<Problem['source'], string> = { notes: msg('From your notes'), generated: msg('Fresh practice'), review: msg('Coming back') };

const SEVERITY_LABEL: Record<Diagnosis['severity'], string> = { gap: msg('Gap'), slip: msg('Slip'), notation: msg('Notation'), incomplete: msg('Not finished') };

const chipTone = (s: Diagnosis['severity']): string => (s === 'gap' ? 'gap' : s === 'slip' ? 'slip' : 'info');

/* ───────────── the keyboard ───────────── */

function Keyboard({ vars, onKey, onTpl, onDelete, onEnter, onMove, ready, calc }: { vars: string[]; onKey: (s: string) => void; onTpl: (kind: Kind, then?: string) => void; onDelete: () => void; onEnter: () => void; onMove: (d: -1 | 1) => void; ready: boolean; calc?: boolean }) {
  const [a, b] = [vars[0] ?? 'x', vars[1] ?? (vars[0] === 'y' ? 'x' : 'y')];
  type Key = { k: string; ins?: string; tone?: string; label?: string; tpl?: Kind; then?: string };
  // calculus swaps the inequality column for the functions it needs
  const calcRows: Key[][] = [
    [{ k: a, tone: 'var' }, { k: 'e', tone: 'var' }, { k: '(' }, { k: ')' }, { k: 'x²', tpl: 'pow', then: '2', label: tr('squared') }, { k: '⌫', tone: 'fn', label: tr('Delete') }],
    [{ k: '7' }, { k: '8' }, { k: '9' }, { k: '+', tone: 'op' }, { k: 'sin', ins: 'sin(', tone: 'op' }, { k: 'xⁿ', tpl: 'pow', label: tr('to the power') }],
    [{ k: '4' }, { k: '5' }, { k: '6' }, { k: '−', ins: '-', tone: 'op', label: 'minus' }, { k: 'cos', ins: 'cos(', tone: 'op' }, { k: '√', tpl: 'sqrt', label: 'square root' }],
    [{ k: '1' }, { k: '2' }, { k: '3' }, { k: '×', ins: '*', tone: 'op', label: 'times' }, { k: 'ln', ins: 'ln(', tone: 'op' }, { k: '+C', ins: '+C', tone: 'op', label: tr('plus C') }],
    [{ k: '0' }, { k: '.' }, { k: '=', tone: 'op' }, { k: '÷', tpl: 'frac', tone: 'op', label: 'fraction' }, { k: 'π', ins: 'pi', tone: 'op', label: 'pi' }, { k: '↵', tone: 'go', label: tr('Check this line') }],
  ];
  const algebraRows: Key[][] = [
    [{ k: a, tone: 'var' }, { k: b, tone: 'var' }, { k: '(' }, { k: ')' }, { k: 'x²', tpl: 'pow', then: '2', label: tr('squared') }, { k: '⌫', tone: 'fn', label: tr('Delete') }],
    [{ k: '7' }, { k: '8' }, { k: '9' }, { k: '+', tone: 'op' }, { k: '<', tone: 'op' }, { k: 'xⁿ', tpl: 'pow', label: tr('to the power') }],
    [{ k: '4' }, { k: '5' }, { k: '6' }, { k: '−', ins: '-', tone: 'op', label: 'minus' }, { k: '>', tone: 'op' }, { k: '√', tpl: 'sqrt', label: 'square root' }],
    [{ k: '1' }, { k: '2' }, { k: '3' }, { k: '×', ins: '*', tone: 'op', label: 'times' }, { k: '≤', ins: '<=', tone: 'op' }, { k: '±', tone: 'op' }],
    [{ k: '0' }, { k: '.' }, { k: '=', tone: 'op' }, { k: '÷', tpl: 'frac', tone: 'op', label: 'fraction' }, { k: '≥', ins: '>=', tone: 'op' }, { k: '↵', tone: 'go', label: tr('Check this line') }],
  ];
  // letters: any letter the problem uses that is not on the number keys (A, C, k, n …), small or capital
  const [abc, setAbc] = useState(false);
  const [caps, setCaps] = useState(false);
  const letterRows: Key[][] = ['abcdef', 'ghijkl', 'mnopqr', 'stuvwx'].map((row) => [...row].map((ch) => ({ k: caps ? ch.toUpperCase() : ch, tone: 'var' })));
  letterRows.push([{ k: caps ? 'Y' : 'y', tone: 'var' }, { k: caps ? 'Z' : 'z', tone: 'var' }, { k: '⇧', tone: caps ? 'go' : 'fn', label: tr('Capital letters') }, { k: 'θ', ins: 'θ', tone: 'var' }, { k: '⌫', tone: 'fn', label: tr('Delete') }, { k: '↵', tone: 'go', label: tr('Check this line') }]);
  const rows = abc ? letterRows : calc ? calcRows : algebraRows;
  void b;
  return (
    <div className="kbd" aria-label={tr('Maths keyboard')}>
      <div className="kbd-extra">
        <button className={abc ? 'on' : ''} onClick={() => { haptic(4); setAbc(!abc); }} aria-pressed={abc} aria-label={abc ? tr('Numbers') : tr('Letters')}>{abc ? '123' : 'abc'}</button>
        <button onClick={() => onMove(-1)} aria-label={tr('Move left')}><Icon name="left" size={18} /></button>
        <button onClick={() => onMove(1)} aria-label={tr('Move right')}><Icon name="right" size={18} /></button>
        <button className="tpl" onClick={() => onTpl('frac')} aria-label={tr('Fraction')}><span className="f"><i /><i /></span></button>
        <button className="tpl" onClick={() => onTpl('pow')} aria-label={tr('Power')}>x<i className="hi" /></button>
        <button className="tpl" onClick={() => onTpl('sqrt')} aria-label={tr('Square root')}>√<i /></button>
        {calc ? (
          <>
            <button className="tpl" onClick={() => onTpl('ddx')} aria-label={tr('Derivative')}>d/d{a}<i /></button>
            <button className="tpl" onClick={() => onTpl('int')} aria-label={tr('Integral')}><svg viewBox="0 0 10 28" aria-hidden="true"><path d="M8.6 2.2c-2.3-.9-3.1.7-3.3 3.2L4.7 22.6c-.2 2.5-1 4.1-3.3 3.2" /></svg><i /></button>
            <button className="tpl" onClick={() => onTpl('defint')} aria-label={tr('Integral with limits')}><svg viewBox="0 0 10 28" aria-hidden="true"><path d="M8.6 2.2c-2.3-.9-3.1.7-3.3 3.2L4.7 22.6c-.2 2.5-1 4.1-3.3 3.2" /></svg><span className="st"><i /><i /></span><i /></button>
            <button className="tpl" onClick={() => onTpl('lim')} aria-label={tr('Limit')}>lim<i className="lo" /></button>
            <button onClick={() => onKey('tan(')}>tan</button>
            <button className="tpl" onClick={() => { onKey('e'); onTpl('pow'); }} aria-label={tr('e to the power')}>e<i className="hi" /></button>
            <button onClick={() => onKey('inf')}>∞</button>
            <button onClick={() => onKey('DNE')}>{tr('no limit')}</button>
          </>
        ) : (
          <>
            <button className="tpl" onClick={() => onTpl('abs')} aria-label={tr('Absolute value')}>|<i />|</button>
            <button onClick={() => onKey(' or ')}>or</button>
            <button onClick={() => onKey(',')}>,</button>
            <button onClick={() => onKey('no solution')}>{tr('no solution')}</button>
            <button onClick={() => onKey('all real numbers')}>{tr('all reals')}</button>
          </>
        )}
      </div>
      <div className="kbd-grid">
        {rows.flat().map((key) => (
          <button
            key={key.k}
            className={`key ${key.tone ?? ''} ${key.tone === 'go' && ready ? 'ready' : ''}`}
            aria-label={key.label ?? key.k}
            // keep the caret in the working line while tapping keys
            onPointerDown={(e: { preventDefault(): void }) => e.preventDefault()}
            onClick={() => {
              haptic(4);
              if (key.k === '⇧') setCaps(!caps);
              else if (key.k === '⌫') onDelete();
              else if (key.k === '↵') onEnter();
              else if (key.tpl) onTpl(key.tpl, key.then);
              else onKey(key.ins ?? key.k);
            }}
          >
            {key.k === '⌫' ? <Icon name="delete" size={21} /> : key.k === '↵' ? <Icon name="check" size={22} stroke={3} /> : key.k}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ───────────── one line of working ───────────── */

function Mark({ line, pending }: { line: CheckedLine; pending?: boolean }) {
  if (pending) return <span className="mark wait" aria-label={tr('Not checked yet')} />;
  if (line.status === 'ok' || line.status === 'recovered') {
    return (
      <span className="mark ok" aria-label={tr('Follows')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path className="draw" d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </span>
    );
  }
  if (line.status === 'wrong') return <span className={`mark ${line.diag?.severity === 'slip' ? 'slip' : 'gap'}`} aria-label={tr('Doesn’t follow')} />;
  if (line.status === 'carried') return <span className="mark carried" aria-label={tr('Follows from a line that is off')} />;
  if (line.status === 'step') return <span className="mark step" aria-label={tr('A step, still to be finished')} />;
  return <span className="mark none" aria-label={tr('Not checked')} />;
}

function DiagnosisCard({ diag, onReview, onFix, fixShown, aiNote, onSense }: { diag: Diagnosis; onReview: () => void; onFix: () => void; fixShown: boolean; aiNote?: string; onSense: (ok: boolean) => Promise<string | null> }) {
  const concept = conceptOf(diag.concept);
  const [sense, setSense] = useState<'yes' | 'no' | null>(null);
  const [simpler, setSimpler] = useState<string | null>(null);
  const answer = (ok: boolean) => {
    haptic(5);
    setSense(ok ? 'yes' : 'no');
    onSense(ok)
      .then((text) => text && setSimpler(text))
      .catch(() => undefined);
  };
  return (
    <div className={`diag ${chipTone(diag.severity)}`} role="note">
      <div className="row" style={{ gap: 8 }}>
        <span className={`chip ${chipTone(diag.severity)}`}>{tr(SEVERITY_LABEL[diag.severity])}</span>
        <b className="grow" style={{ fontSize: 14.5, lineHeight: 1.3 }}><RichText text={diag.title} /></b>
      </div>
      <p style={{ fontSize: 14.5, lineHeight: 1.5, marginTop: 8 }}><TermText text={aiNote ?? diag.message} /></p>
      {(
        <div className="sense" data-state={sense ?? 'ask'}>
          {sense === null && (
            <>
              <span>{tr('Did that make sense?')}</span>
              <button onClick={() => answer(true)}>{tr('Yes')}</button>
              <button onClick={() => answer(false)}>{tr('Not really')}</button>
            </>
          )}
          {sense === 'yes' && <span className="sense-ok"><Icon name="check" size={14} stroke={3} />{' '}{tr('Good. Fix the line and carry on.')}</span>}
          {sense === 'no' && (
            <div className="plainer">
              <span className="label">{tr('In plain words')}</span>
              <p><RichText text={simpler ?? tr(PLAIN[diag.concept])} /></p>
              <button className="review-link" onClick={onReview}>
                <Icon name="play" size={14} fill />
                <span>{tr('Walk me through an example')}</span>
                <Icon name="chevron" size={15} />
              </button>
            </div>
          )}
        </div>
      )}
      {fixShown && diag.fix && (
        <p className="fixline">
          <span className="faint" style={{ fontSize: 12.5 }}>{tr('This line should read')}</span>
          <MathView text={diag.fix} block />
        </p>
      )}
      <div className="row" style={{ gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
        {(diag.severity === 'gap' || diag.code !== 'arithmetic-slip') && (
          <button className="review-link" onClick={onReview}>
            <Icon name="book" size={16} />
            <span>{tr('Review: {0}', { 0: concept.title })}</span>
            <span className="faint">{tr('· {0} min', { 0: concept.minutes })}</span>
            <Icon name="chevron" size={15} />
          </button>
        )}
        {diag.fix && !fixShown && (
          <button className="linkbtn" style={{ fontSize: 13.5, padding: '6px 8px' }} onClick={onFix}>
            {tr('Show the corrected line')}
          </button>
        )}
      </div>
    </div>
  );
}

/* ───────────── a problem the engine can check ───────────── */

function Workspace({ problem, last, onDone }: { problem: Problem; last: boolean; onDone: (r: Result) => void }) {
  const [lines, setLines] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [mood, setMood] = useState<Mood>('idle');
  const [rung, setRung] = useState(0);
  const [hint, setHint] = useState<HintLadder | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [openDiag, setOpenDiag] = useState<number | null>(null);
  const [fixShown, setFixShown] = useState<Record<number, boolean>>({});
  const [revealed, setRevealed] = useState(false);
  const [compare, setCompare] = useState(false);
  const [shake, setShake] = useState(0);
  const [aiNotes, setAiNotes] = useState<Record<string, string>>({});
  /** Lines the AI read as a step, each confirmed true by the checker once completed. */
  const [aiSteps, setAiSteps] = useState<Record<string, { note: string; fix?: string }>>({});
  // 'line' marks each line as it lands; 'end' holds every mark back until the learner asks
  const [mode, setMode] = useState<'line' | 'end'>(() => getState().profile.checkMode ?? 'line');
  const [checkedCount, setCheckedCount] = useState(0);
  const calc = isCalc(problem.kind);
  const fieldRef = useRef<MathFieldHandle | null>(null);
  /** The final answer, given before any working was shown. */
  const [answerFirst, setAnswerFirst] = useState<string | null>(null);
  const clean = useMemo(() => cleanPath(problem), [problem]);
  // A problem that takes one step has no working to show: the answer is the working, and it is simply accepted.
  // For longer ones the working is asked for once; if the answer alone comes back a second time it is taken, so nobody gets stuck.
  const needsWorking = answerFirst === null && clean.filter((s) => !s.aside).length > 1;
  /** What "Done" found when the work was not right or not finished yet. */
  const [review, setReview] = useState<{ wrong: number[]; remaining: string | null } | null>(null);
  const [gaps, setGaps] = useState(false);
  const scroller = useRef<HTMLDivElement | null>(null);
  const started = useRef(Date.now());
  const seen = useRef(new Map<string, Diagnosis>());
  const recorded = useRef(false);

  /** How many lines there were when "Done" was last pressed: only then is a rule left half-done a mark. */
  const [doneAt, setDoneAt] = useState<number | null>(null);
  const analysis = useMemo(() => analyze(problem, lines, { done: doneAt === lines.length, aiSteps }), [problem, lines, doneAt, aiSteps]);
  /** The attempt read as finished: for the record, and for leaving the problem. */
  const finalAnalysis = (): AttemptAnalysis => (doneAt === lines.length ? analysis : analyze(problem, lines, { done: true, aiSteps }));
  const isChecked = (i: number): boolean => mode === 'line' || i < checkedCount;
  const allChecked = mode === 'line' || checkedCount >= lines.length;
  const solved = analysis.verdict === 'solved' && allChecked;
  const finished = solved || revealed;
  const vars = useMemo(() => {
    if (isCalc(problem.kind)) return [problem.variable ?? 'x'];
    const found = [...new Set((problem.given.match(/[a-z]/gi) ?? []).filter((c) => !/[e]/i.test(c) || problem.given.includes('e')))];
    return (problem.variable ? [problem.variable, ...found.filter((v) => v !== problem.variable)] : found).slice(0, 2);
  }, [problem]);

  analysis.lines.forEach((l, i) => {
    if (isChecked(i) && l.status === 'wrong' && l.diag) seen.current.set(`${l.diag.code}:${l.diag.concept}`, l.diag);
  });

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [lines.length, openDiag, hintOpen, finished, compare]);

  useEffect(() => {
    if (!finished) fieldRef.current?.focus();
  }, [finished, lines.length]);

  const marksNow = (): Diagnosis[] => {
    const all = new Map(seen.current);
    for (const m of analysis.marks) all.set(`${m.code}:${m.concept}`, m);
    return [...all.values()];
  };

  const record = (a: AttemptAnalysis, hintRung: number) => {
    if (recorded.current) return;
    recorded.current = true;
    const all = new Map(seen.current);
    for (const m of a.marks) all.set(`${m.code}:${m.concept}`, m);
    actions.record(problem, { ...a, marks: [...all.values()] }, { hintRung, seconds: (Date.now() - started.current) / 1000 });
  };

  const insert = (t: string) => {
    if (t === '+C') {
      fieldRef.current?.insert('+');
      fieldRef.current?.insert('C');
    } else fieldRef.current?.insert(t);
    setNote(null);
  };

  /** Drop in a template (fraction, power, root, integral…); `then` fills its box and steps out, as for x². */
  const tpl = (kind: Kind, then?: string) => {
    const v = vars[0] ?? 'x';
    fieldRef.current?.template(kind, v);
    if (then) {
      fieldRef.current?.insert(then);
      fieldRef.current?.move(1);
    }
    setNote(null);
  };

  /** Deleting on an empty line pulls the previous line back for editing. */
  const pullBack = () => {
    if (!lines.length) return;
    const prev = lines[lines.length - 1];
    setLines(lines.slice(0, -1));
    setCheckedCount((c) => Math.min(c, lines.length - 1));
    fieldRef.current?.setText(prev);
    setOpenDiag(null);
  };

  const del = () => {
    if (!fieldRef.current?.del()) pullBack();
    setNote(null);
  };

  const move = (d: -1 | 1) => fieldRef.current?.move(d);


  // the field keeps one Enter handler for its whole life; this always points at the current commit
  const commitRef = useRef<() => void>(() => undefined);
  /** The tick: take the line being written and move to the next one. Returns the lines as they now stand, or null if the line was not taken. */
  const commit = (): string[] | null => {
    // "= 6" carries on from the line above: the sign is dropped, the rest is the line
    const text = input.trim().replace(/^=\s*(?=[^=]*$)/, '');
    if (!text || finished) return null;
    if (gaps) {
      setNote(tr('One of the boxes is still empty. Fill it in, or delete it.'));
      setShake((n) => n + 1);
      haptic([12, 30, 12]);
      return null;
    }
    const next = [...lines, text];
    const a = analyze(problem, next, { done: false, aiSteps });
    const line = a.lines[a.lines.length - 1];
    if (!line || line.status === 'unreadable') {
      setNote(line?.note ?? tr('I couldn’t read that line. Check the brackets and signs.'));
      setShake((n) => n + 1);
      setMood('curious');
      haptic([12, 30, 12]);
      return null;
    }
    // The right answer with no working: accepted, but the working is the point. I can only find how someone
    // thinks, and where it goes wrong, from the lines in between. So the answer is kept aside and the steps asked for.
    if (a.verdict === 'solved' && next.length === 1 && needsWorking) {
      setAnswerFirst(text);
      actions.track('answer_only');
      fieldRef.current?.clear();
      setInput('');
      setMood('thumbsup');
      haptic([10, 40, 16]);
      setNote(null);
      return null;
    }
    setLines(next);
    setReview(null);
    fieldRef.current?.clear();
    setInput('');
    setHintOpen(false);
    if (mode === 'end') {
      // nothing is marked yet: the learner finishes first, then asks
      setNote(null);
      setOpenDiag(null);
      setMood('calculating'); // she reads along but keeps quiet until asked
      return next;
    }
    setNote(line.status === 'unchecked' ? line.note ?? tr('I can’t compare this line with the one above, so I’ve left it unmarked.') : null);
    const idx = next.length - 1;
    if (line.status === 'wrong') {
      setOpenDiag(idx);
      setMood(line.diag?.severity === 'gap' ? 'shocked' : 'oops');
      haptic([14, 40, 14]);
      setTimeout(() => setMood('thinking'), 1700);
      const st = getState();
      // the rules couldn't name it: ask the model what the line was trying to do, if one is connected.
      // A "step" stands only if the checker finds the completed line true; anything else is put into words.
      if (line.diag?.code === 'unknown' && aiReady(st.ai)) {
        const prev = next[idx - 1] ?? problem.given;
        const stop = new AbortController();
        const timer = setTimeout(() => stop.abort(), 6000);
        aiDiagnose(st.ai, problem, prev, text, stop.signal)
          .then((d) => {
            if (!d) return;
            if (d.kind === 'step' && confirmsStep(problem, d.completesTo)) {
              setAiSteps((m) => ({ ...m, [text]: { note: d.note, fix: d.completesTo } }));
              setMood('happy');
            } else setAiNotes((n) => ({ ...n, [text]: `**${d.title}** ${d.note}` }));
          })
          .catch(() => undefined)
          .finally(() => clearTimeout(timer));
      }
    } else if (a.verdict === 'solved') {
      setOpenDiag(null);
      setMood('celebrate');
      haptic([10, 50, 20]);
      record(a, rung);
    } else if (line.status === 'step') {
      // part of a rule done: say what is left, without a mark
      setOpenDiag(null);
      setNote(line.note ?? null);
      setMood('happy');
      setTimeout(() => setMood('idle'), 1100);
    } else {
      setOpenDiag(null);
      setMood(line.status === 'carried' ? 'thinking' : line.status === 'recovered' ? 'eureka' : 'happy');
      if (line.status === 'carried') setNote(tr('That follows from the line above, but that line was already off, so the mistake is carried along.'));
      if (line.status === 'recovered') setNote(tr('Back on track: this line is true to the original problem again.'));
      setTimeout(() => setMood('idle'), 1100);
    }
      return next;
  };

  commitRef.current = () => void commit();

  /**
   * "Done": I have finished solving. Every line written is read and marked, and what is wrong is named.
   * If it is solved, the problem ends. If not, the mistakes are listed, to fix or to see solved step by step.
   */
  const reviewWork = (all: string[] = lines) => {
    if (!all.length || finished) return;
    const a = analyze(problem, all, { done: true, aiSteps });
    setDoneAt(all.length);
    setCheckedCount(all.length);
    setHintOpen(false);
    const wrong = a.lines.map((l, i) => (l.status === 'wrong' ? i : -1)).filter((i) => i >= 0);
    if (a.verdict === 'solved' && all.length === 1 && needsWorking) {
      // only the answer was written: keep it aside and ask for the working
      setAnswerFirst(all[0]);
      actions.track('answer_only');
      setLines([]);
      setCheckedCount(0);
      setMood('thumbsup');
      return;
    }
    if (a.verdict === 'solved') {
      for (const i of wrong) {
        const d = a.lines[i].diag;
        if (d) seen.current.set(`${d.code}:${d.concept}`, d);
      }
      setOpenDiag(wrong.length ? wrong[0] : null);
      setNote(null);
      setReview(null);
      setMood('celebrate');
      haptic([10, 50, 20]);
      record(a, rung);
      return;
    }
    setNote(null);
    setReview({ wrong, remaining: wrong.length ? null : a.remaining ?? tr('Every line follows, but it isn’t finished yet.') });
    setOpenDiag(wrong.length ? wrong[0] : null);
    setMood(wrong.length ? 'oops' : 'happy');
    if (wrong.length) {
      haptic([14, 40, 14]);
      setTimeout(() => setMood('thinking'), 1400);
    }
  };

  /** The Done button: take whatever is still in the box as the last line, then review everything. */
  const done = () => {
    if (input.trim()) {
      const next = commit();
      if (next) reviewWork(next);
      return;
    }
    reviewWork();
  };

  const switchMode = () => {
    const nextMode = mode === 'line' ? 'end' : 'line';
    haptic(5);
    if (nextMode === 'line') reviewWork();
    else setCheckedCount(lines.length);
    setMode(nextMode);
    actions.setProfile({ checkMode: nextMode });
    toast(nextMode === 'end' ? tr('I’ll wait until you ask before marking anything') : tr('Marking each line as you write it'));
  };

  const askHint = () => {
    const ladder = hintLadder(problem, lines);
    if (!ladder) {
      toast(tr('I don’t have a hint for this one.'));
      return;
    }
    setHint(ladder);
    actions.track('hint', { rung: Math.min(3, hintOpen ? rung + 1 : Math.max(1, rung)) });
    setRung((r) => Math.min(3, hintOpen ? r + 1 : Math.max(1, r)));
    setHintOpen(true);
    setMood('eureka');
  };

  const reveal = () => {
    actions.track('reveal');
    setRevealed(true);
    setReview(null);
    setHintOpen(false);
    setRung(3);
    setMood('idle');
    record(finalAnalysis(), 3);
  };

  const finish = (skipped = false) => {
    const a = finalAnalysis();
    for (const m of a.marks) seen.current.set(`${m.code}:${m.concept}`, m);
    onDone({
      problem,
      verdict: a.verdict,
      marks: marksNow(),
      hintRung: revealed ? 3 : rung,
      seconds: (Date.now() - started.current) / 1000,
      steps: a.steps,
      cleanSteps: a.cleanSteps,
      skipped,
    });
  };

  const marks = marksNow();
  const hintText = hint ? (rung <= 1 ? hint.nudge : rung === 2 ? hint.method : tr('Here is the next line. Read it, then write it yourself:')) : '';

  return (
    <>
      <div className="scroll ws" ref={scroller}>
        <div className="problem">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className={`chip ${problem.source === 'review' ? 'gap' : problem.source === 'notes' ? '' : 'plain'}`}>
              {problem.source === 'review' ? <Icon name="refresh" size={13} /> : problem.source === 'notes' ? <Icon name="file" size={13} /> : null}
              {tr(SOURCE_LABEL[problem.source])}
            </span>
            <Lera size={42} mood={mood} />
          </div>
          <p className="prompt"><RichText text={promptText(problem.prompt)} /></p>
          <div className="given"><MathView text={problem.given} block /></div>
        </div>

        {answerFirst && !finished && (
          <div className="answer-first">
            <div className="row" style={{ gap: 8 }}>
              <span className="chip ok"><Icon name="check" size={13} stroke={3.2} />{' '}{tr('Right answer')}</span>
              <MathView text={answerFirst} />
            </div>
            <p><b>{tr('Now show me how you got there.')}</b>{' '}{tr('Write your working in as many steps as help you, ending with the answer. The steps show me how you think, and that is where I can help.')}</p>
          </div>
        )}
        <ol className="lines">
          {analysis.lines.map((line, i) => (
            <li key={`${i}:${line.text}`} className={`line ${isChecked(i) ? line.status : 'pending'}`} data-final={line.isFinal && solved && i === analysis.lines.length - 1 ? '' : undefined}>
              <button
                className="line-row"
                onClick={() => isChecked(i) && line.status === 'wrong' && setOpenDiag(openDiag === i ? null : i)}
                aria-expanded={isChecked(i) && line.status === 'wrong' ? openDiag === i : undefined}
                disabled={!isChecked(i) || line.status !== 'wrong'}
              >
                <span className="n">{i + 1}</span>
                <span className="grow" style={{ textAlign: 'left' }}>
                  {line.latex ? <MathView latex={line.latex} block /> : <MathView text={line.text} block />}
                </span>
                <Mark line={line} pending={!isChecked(i)} />
              </button>
              {isChecked(i) && line.status === 'step' && line.note && <p className="line-next">{line.note}</p>}
              {isChecked(i) && line.status === 'wrong' && line.diag && openDiag === i && (
                <DiagnosisCard
                  diag={line.diag}
                  onSense={async (ok) => {
                    const d = line.diag as Diagnosis;
                    actions.setUnderstood(d.concept, ok);
                    const st = getState();
                    if (ok || !aiReady(st.ai)) return null;
                    // a connected model rewords the same point more simply; the engine's verdict stays the authority
                    return aiSimplify(st.ai, { concept: d.concept, title: d.title, message: d.message, plain: PLAIN[d.concept], problem, line: line.text, fix: d.fix });
                  }}
                  aiNote={aiNotes[line.text]}
                  fixShown={!!fixShown[i]}
                  onFix={() => {
                    setFixShown({ ...fixShown, [i]: true });
                    setRung(3);
                  }}
                  onReview={() => openOverlay({ name: 'review', concept: (line.diag as Diagnosis).concept })}
                />
              )}
            </li>
          ))}
        </ol>

        {!finished && (
          <div className="entry" data-shake={shake ? (shake % 2 ? 'a' : 'b') : undefined}>
            <span className="n">{lines.length + 1}</span>
            <div className="grow">
              <MathField
                ref={fieldRef}
                label={tr('Line {0} of your working', { 0: lines.length + 1 })}
                placeholder={lines.length ? (mode === 'end' ? tr('Next line… then “Check my work”') : tr('Next line…')) : tr('Write your first line…')}
                onChange={(text, hasGaps) => {
                  setInput(text);
                  setGaps(hasGaps);
                  setNote(null);
                }}
                onEnter={() => commitRef.current()}
                onEmptyDelete={pullBack}
              />
            </div>
          </div>
        )}
        {note && !finished && <p className="ws-note"><Icon name="question" size={16} /> <span>{note}</span></p>}

        {review && !finished && (
          <div className={`ws-review ${review.wrong.length ? 'bad' : ''}`} role="status">
            <b>{review.wrong.length ? (lines.length === 1 ? tr('I read your line. It needs another look.') : `I read all ${lines.length} of your lines. ${review.wrong.length === 1 ? 'One needs' : `${review.wrong.length} need`} another look.`) : tr('Right so far, but not finished.')}</b>
            {review.wrong.map((i) => {
              const d = analysis.lines[i]?.diag;
              return (
                <button key={i} className="ws-review-line" onClick={() => setOpenDiag(i)}>
                  <span className={`chip ${d ? chipTone(d.severity) : 'gap'}`}>{tr('Line {0}', { 0: i + 1 })}</span>
                  <span className="grow"><RichText text={d?.title ?? tr('This line does not follow from the one above.')} /></span>
                  <Icon name="chevron" size={15} />
                </button>
              );
            })}
            {review.remaining && <p><TermText text={review.remaining} /></p>}
            <div className="row" style={{ gap: 8, marginTop: 4 }}>
              <button className="tool" onClick={() => setReview(null)}>{review.wrong.length ? tr('Fix it myself') : tr('Keep going')}</button>
              <button className="tool go" onClick={reveal}>{tr('Show it solved, step by step')}</button>
            </div>
          </div>
        )}

        {hintOpen && hint && !finished && (
          <div className="hint">
            <LeraSays size={40} mood="thinking" solid text={hintText}>
              {rung >= 3 && (
                <span className="hint-line">
                  <MathView text={hint.line} block />
                </span>
              )}
              <span className="row" style={{ gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                <span className="hint-rungs" aria-label={tr('Hint {0} of 3', { 0: rung })}>{[1, 2, 3].map((n) => <i key={n} data-on={n <= rung ? '' : undefined} />)}</span>
                {rung < 3 ? (
                  <button className="linkbtn" style={{ fontSize: 13.5, padding: '4px 8px' }} onClick={askHint}>
                    {rung === 1 ? tr('Tell me the method') : tr('Show me the line')}
                  </button>
                ) : (
                  <button className="linkbtn" style={{ fontSize: 13.5, padding: '4px 8px' }} onClick={reveal}>
                    {tr('Show the whole solution')}
                  </button>
                )}
              </span>
            </LeraSays>
          </div>
        )}

        {finished && (
          <div className="outcome stagger">
            {solved ? (
              <div className="solved-banner">
                <span className="big-tick"><Icon name="check" size={26} stroke={3.2} /></span>
                <div>
                  <b>{rung >= 3 ? tr('Solved, with the line shown') : tr('Solved')}</b>
                  <p className="muted" style={{ fontSize: 14 }}>
                    {analysis.steps} {analysis.steps === 1 ? 'line' : 'lines'}
                    {analysis.approach ? ` · ${analysis.approach}` : ''}
                  </p>
                </div>
              </div>
            ) : (
              <div className="card tint">
                <b>{tr('Step by step')}</b>
                <p className="muted" style={{ fontSize: 14, marginTop: 2 }}>{tr('Read each step and the reason beside it. This one comes back later so you can do it yourself.')}</p>
              </div>
            )}

            {marks.length > 0 && (
              <div className="card">
                <span className="label">{tr('What I noticed')}</span>
                {marks.map((m) => (
                  <button key={m.code + m.concept} className="noticed" onClick={() => openOverlay({ name: 'review', concept: m.concept })}>
                    <span className={`chip ${chipTone(m.severity)}`}>{tr(SEVERITY_LABEL[m.severity])}</span>
                    <span className="grow"><RichText text={m.title} /></span>
                    <Icon name="chevron" size={16} />
                  </button>
                ))}
              </div>
            )}


            {clean.length > 0 && (
              <div className="card">
                <button className="row" style={{ width: '100%', justifyContent: 'space-between' }} onClick={() => setCompare(!compare)} aria-expanded={compare || revealed}>
                  <span className="label">{tr('Step by step')}</span>
                  {!revealed && <Icon name={compare ? 'down' : 'chevron'} size={17} />}
                </button>
                {(compare || revealed) && <StepList problem={problem} steps={clean} />}
              </div>
            )}
          </div>
        )}
      </div>

      {finished ? (
        <div className="ws-foot">
          <Button3D variant={solved ? 'ok' : 'primary'} sheen onClick={() => finish()}>
            {last ? tr('Finish') : tr('Next problem')} <Icon name="arrow" size={19} />
          </Button3D>
        </div>
      ) : (
        <div className="ws-keys">
          <div className="row ws-tools">
            <button className="tool" onClick={askHint}>
              <Icon name="bulb" size={18} />{' '}{tr('Hint')}{rung ? ` ${rung}/3` : ''}
            </button>
            <button className="tool" onClick={switchMode} aria-label={tr('Change when your working is checked')}>
              <Icon name={mode === 'end' ? 'clock' : 'check'} size={16} stroke={2.6} /> {mode === 'end' ? tr('At the end') : tr('As I go')}
            </button>
            <span className="grow" />
            {(lines.length > 0 || !!input.trim()) && (
              <button className="tool go" onClick={done} aria-label={tr('I have finished solving: check all my work')}>
                <Icon name="check" size={16} stroke={3} />{' '}{tr('Done')}
              </button>
            )}
            <button className="tool" onClick={() => (lines.length || rung ? reveal() : finish(true))}>
              {lines.length || rung ? tr('Show solution') : tr('Skip')}
            </button>
          </div>
          <Keyboard vars={vars} onKey={insert} onTpl={tpl} onDelete={del} onEnter={commit} onMove={move} ready={!!input.trim()} calc={calc} />
        </div>
      )}
      {solved && <Confetti fire={1} />}
    </>
  );
}

/* ───────────── a word problem: written answer ───────────── */

function OpenWork({ problem, last, onDone }: { problem: Problem; last: boolean; onDone: (r: Result) => void }) {
  const ai = useStore((s) => s.ai);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<{ correct: boolean; feedback: string } | null>(null);
  const started = useRef(Date.now());
  const done = (ok: boolean, skipped = false) =>
    onDone({ problem, verdict: ok ? 'solved' : 'unfinished', marks: [], hintRung: 0, seconds: (Date.now() - started.current) / 1000, steps: text.split('\n').filter(Boolean).length, cleanSteps: 0, skipped });
  const check = async () => {
    setBusy(true);
    try {
      const v = await aiCheckOpen(ai, problem, text.split('\n').filter((l) => l.trim()));
      if (v) setVerdict(v);
      else toast(tr('The AI reply couldn’t be read. Try again.'));
    } catch (e) {
      toast(e instanceof Error ? e.message : tr('The AI check failed.'));
    }
    setBusy(false);
  };
  return (
    <>
      <div className="scroll ws">
        <div className="problem">
          <span className="chip"><Icon name="file" size={13} />{' '}{tr('From your notes · written answer')}</span>
          <p className="prompt" style={{ fontSize: 17, lineHeight: 1.5 }}><RichText text={problem.original ?? promptText(problem.prompt)} /></p>
        </div>
        <textarea className="field" style={{ minHeight: 150, margin: '4px 0 10px', resize: 'none' }} placeholder={tr('Write your working here, one step per line…')} value={text} onChange={(e: { target: { value: string } }) => setText(e.target.value)} aria-label={tr('Your working')} />
        {verdict ? (
          <div className={`diag ${verdict.correct ? 'okc' : 'slip'}`}>
            <span className={`chip ${verdict.correct ? 'ok' : 'slip'}`}>{verdict.correct ? tr('Looks right') : tr('Not yet')}</span>
            <p style={{ marginTop: 8, lineHeight: 1.5, fontSize: 14.5 }}>{verdict.feedback}</p>
            <p className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>{tr('Checked by the AI model you connected, not by the built-in engine.')}</p>
          </div>
        ) : (
          <p className="ws-note"><Icon name="question" size={16} /> <span>{aiReady(ai) ? tr('Word problems are checked by the AI model you connected.') : tr('The built-in engine checks algebra line by line, but it can’t mark a word problem. Connect an AI model in Settings to have these checked, or mark it yourself.')}</span></p>
        )}
      </div>
      <div className="ws-foot" style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
        {aiReady(ai) && !verdict && <Button3D busy={busy} disabled={!text.trim()} onClick={check}>{tr('Check my answer')}</Button3D>}
        <Button3D variant={verdict?.correct ? 'ok' : 'secondary'} onClick={() => done(verdict ? verdict.correct : !!text.trim())}>
          {verdict ? (last ? tr('Finish') : tr('Next problem')) : tr('I’ve done this one')}
        </Button3D>
        {!verdict && <button className="linkbtn" onClick={() => done(false, true)}>{tr('Skip')}</button>}
      </div>
    </>
  );
}

/* ───────────── the session around the problems ───────────── */

export function SessionScreen({ route }: { route: Extract<Route, { name: 'session' }> }) {
  const [session] = useState<Session>(() => {
    const st = getState();
    if (route.problems?.length) {
      return { title: route.title ?? tr('Practice'), topicId: route.topicId, problems: route.problems, reviews: route.problems.filter((p) => p.source === 'review').length, minutes: Math.max(1, Math.round(route.problems.length * 1.4)) };
    }
    const topic = findTopic(st.docs, route.topicId)?.topic ?? null;
    return buildSession(st, topic);
  });
  const [phase, setPhase] = useState<'brief' | 'solve' | 'done'>(session.problems.length > 1 ? 'brief' : 'solve');
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [leaving, setLeaving] = useState(false);
  const total = session.problems.length;
  const problem = session.problems[index];

  // the phone's back button asks before throwing away a session that is under way
  useEffect(() => {
    setBackGuard(() => {
      if (phase === 'solve' && results.length + 1 < total && !leaving) {
        setLeaving(true);
        return true;
      }
      return false;
    });
    return () => setBackGuard(null);
  }, [phase, results.length, total, leaving]);

  // a lesson whose part of the file has no exercises: Lera writes the practice from the notes, with nothing to set up
  const emptyTopic = total === 0 && route.topicId ? findTopic(getState().docs, route.topicId)?.topic ?? null : null;
  if (emptyTopic) {
    return (
      <div className="screen" data-dir="1">
        <div className="topbar"><button className="iconbtn" onClick={back} aria-label={tr('Close')}><Icon name="close" /></button></div>
        <div className="scroll" style={{ padding: '0 20px 28px', justifyContent: 'center' }}>
          <WritePractice topic={emptyTopic} onMade={(made) => replace({ name: 'session', topicId: emptyTopic.id, problems: made, title: emptyTopic.title })} />
        </div>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="screen" data-dir="1">
        <div className="topbar"><button className="iconbtn" onClick={back} aria-label={tr('Close')}><Icon name="close" /></button></div>
        <div className="scroll center" style={{ justifyContent: 'center', gap: 14, padding: '0 30px' }}>
          <Lera size={100} mood="proud" />
          <h2 style={{ fontSize: 22 }}>{tr('Nothing is due right now')}</h2>
          <p className="muted" style={{ lineHeight: 1.5 }}>{tr('When a topic is ready to come back, it will show up here. Until then, pick a lesson and practise it.')}</p>
          <Button3D onClick={back}>{tr('Back')}</Button3D>
        </div>
      </div>
    );
  }

  const next = (r: Result) => {
    const all = [...results, r];
    setResults(all);
    if (index + 1 < total) setIndex(index + 1);
    else setPhase('done');
  };

  return (
    <div className="screen session" data-dir="1">
      <div className="topbar" style={{ gap: 12 }}>
        <button className="iconbtn" onClick={() => (phase === 'solve' && results.length + 1 < total ? setLeaving(true) : back())} aria-label={tr('Close session')}>
          <Icon name="close" />
        </button>
        <div className="segbar grow" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={results.length} aria-label={tr('Problems done')}>
          {session.problems.map((p, i) => {
            const r = results[i];
            const state = !r ? (i === index && phase === 'solve' ? 'now' : 'todo') : r.skipped ? 'skip' : r.verdict === 'solved' && r.marks.length === 0 ? 'ok' : r.verdict === 'solved' ? 'mixed' : 'miss';
            return <i key={p.id + i} data-state={state} />;
          })}
        </div>
        <span className="faint" style={{ fontSize: 13, fontWeight: 600, minWidth: 34, textAlign: 'right' }}>
          {Math.min(total, index + (phase === 'done' ? 1 : 1))}/{total}
        </span>
      </div>

      {phase === 'brief' && <Brief session={session} onStart={() => setPhase('solve')} />}
      {phase === 'solve' &&
        (problem.kind === 'open' ? (
          <OpenWork key={index} problem={problem} last={index + 1 === total} onDone={next} />
        ) : (
          <Workspace key={index} problem={problem} last={index + 1 === total} onDone={next} />
        ))}
      {phase === 'done' && <Summary session={session} results={results} />}

      {leaving && (
        <>
          <div className="scrim" onClick={() => setLeaving(false)} />
          <div className="dialog" role="alertdialog" aria-label={tr('Leave this session?')}>
            <Lera size={64} mood="curious" interactive={false} />
            <b style={{ fontSize: 18 }}>{tr('Leave this session?')}</b>
            <p className="muted" style={{ fontSize: 14.5 }}>{tr('What you’ve solved so far is already saved.')}</p>
            <Button3D onClick={() => setLeaving(false)}>{tr('Keep going')}</Button3D>
            <button className="linkbtn" onClick={back}>{tr('Leave')}</button>
          </div>
        </>
      )}
    </div>
  );
}

function Brief({ session, onStart }: { session: Session; onStart: () => void }) {
  const fromNotes = session.problems.filter((p) => p.source === 'notes').length;
  const fresh = session.problems.length - fromNotes - session.reviews;
  const text =
    session.reviews > 0
      ? `**${session.reviews}** of these ${session.reviews === 1 ? 'is' : 'are'} coming back from an earlier mistake. Let’s see if ${session.reviews === 1 ? 'it holds' : 'they hold'}.`
      : fromNotes > 0
        ? tr('These come straight from your notes. Write every line, I read the working, not just the answer.')
        : tr('Fresh problems for this topic. Write every line, I read the working, not just the answer.');
  return (
    <>
      <div className="scroll center stagger" style={{ justifyContent: 'center', gap: 16, padding: '0 26px' }}>
        <LeraSays stack size={104} mood="wave" text={text} />
        <h2 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>{session.title}</h2>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <span className="chip plain"><Icon name="pencil" size={13} /> {session.problems.length} problems</span>
          <span className="chip plain"><Icon name="clock" size={13} /> about {session.minutes} min</span>
          {fromNotes > 0 && <span className="chip"><Icon name="file" size={13} /> {fromNotes} from your notes</span>}
          {session.reviews > 0 && <span className="chip gap"><Icon name="refresh" size={13} /> {session.reviews} coming back</span>}
          {fresh > 0 && fromNotes + session.reviews > 0 && <span className="chip plain">{fresh} fresh</span>}
        </div>
      </div>
      <div className="ws-foot">
        <Button3D sheen onClick={onStart}>{tr('Start')}</Button3D>
      </div>
    </>
  );
}

function Summary({ session, results }: { session: Session; results: Result[] }) {
  const concepts = useStore((s) => s.concepts);
  const done = results.filter((r) => !r.skipped);
  const solved = done.filter((r) => r.verdict === 'solved').length;
  const clean = done.filter((r) => r.verdict === 'solved' && r.marks.length === 0 && r.hintRung < 3).length;
  const seconds = results.reduce((s, r) => s + r.seconds, 0);
  const marks = new Map<string, Diagnosis>();
  for (const r of results) for (const m of r.marks) if (m.severity === 'gap' || m.severity === 'slip') marks.set(`${m.severity}:${m.concept}`, m);
  const list = [...marks.values()].sort((a) => (a.severity === 'gap' ? -1 : 1));
  const gap = list.find((m) => m.severity === 'gap');
  const today = dayOf();
  const allClean = done.length > 0 && clean === done.length;
  const attempts = useStore((s) => s.attempts);
  const read = useStore((s) => s.read);
  const docs = useStore((s) => s.docs);
  const understood = useStore((s) => s.understood);
  const goal = useStore((s) => s.profile.dailyXp) || 30;
  const xpToday = xpByDay({ attempts, read }).get(today) ?? 0;
  // what this session was worth, by the same rules as the log
  const earned = done.reduce((sum, r) => sum + (r.verdict === 'solved' ? 10 + (r.marks.length === 0 && r.hintRung < 3 ? 5 : 0) + (r.problem.source === 'review' ? 5 : 0) + (r.hintRung === 0 ? 2 : 0) : 2), 0);
  const lv = levelOf(totalXp({ attempts, read }));
  const days = streak(attempts);
  const touched = new Set(list.map((m) => m.concept));
  const weak = weaknesses({ attempts, concepts, docs, understood }).filter((w) => (w.concept && touched.has(w.concept)) || w.kind === 'lesson').slice(0, 2);
  const [party, setParty] = useState(true);
  useEffect(() => {
    actions.track('session_end', { solved, total: results.length, seconds: Math.round(seconds) });
    // once, when the summary first shows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const scenes = useMemo<Scene[]>(() => {
    if (solved === 0) return [];
    const out: Scene[] = [
      {
        kind: allClean && results.length >= 3 ? 'perfect' : 'done',
        title: allClean ? tr('Flawless session!') : tr('Session complete!'),
        sub: allClean ? tr('Every line followed from the one before.') : undefined,
        stats: [
          { label: tr('XP earned'), value: earned, tone: 'xp' },
          { label: tr('Solved'), value: solved, of: results.length, tone: 'score' },
        ],
      },
    ];
    const solvedToday = attempts.filter((a) => a.day === today).length;
    if (days > 0 && solvedToday <= done.length) {
      out.push({
        kind: 'streak',
        value: days,
        title: days === 1 ? tr('Your streak starts today') : tn(days, '{n} day in a row!', '{n} days in a row!'),
        sub: days === 1 ? tr('Come back tomorrow to make it two.') : tr('You showed up again. That is how it sticks.'),
        week: weekStrip({ attempts, read }).map((d) => d.active),
      });
    }
    if (xpToday >= goal && xpToday - earned < goal) out.push({ kind: 'goal', value: xpToday, title: tr('Daily goal reached!'), sub: tr('Anything more today is a bonus.') });
    const before = levelOf(Math.max(0, totalXp({ attempts, read }) - earned));
    if (before.level < lv.level) out.push({ kind: 'level', value: lv.level, title: tr('Level {0} · {1}', { 0: lv.level, 1: lv.title }), sub: tr('A new level, earned one checked line at a time.') });
    // a round number of problems solved, all told
    const allSolved = attempts.filter((a) => a.verdict === 'solved').length;
    const reached = [10, 25, 50, 100, 250, 500, 1000].find((m) => allSolved - solved < m && allSolved >= m);
    if (reached) out.push({ kind: 'milestone', value: reached, title: tr('{0} problems solved!', { 0: reached }), sub: tr('Every one of them checked line by line.') });
    // badges this session earned
    const had = new Set(badges({ attempts: attempts.slice(0, Math.max(0, attempts.length - done.length)), read, concepts, saved: [], notes: [], highlights: [] }).filter((b) => b.earned).map((b) => b.id));
    for (const b of badges({ attempts, read, concepts, saved: [], notes: [], highlights: [] }).filter((x) => x.earned && !had.has(x.id) && !['collector', 'bookworm'].includes(x.id)).slice(0, 2)) {
      out.push({ kind: 'badge', icon: b.icon, title: tr('New badge: {0}', { 0: b.title }), sub: b.desc });
    }
    return out;
    // the scenes are fixed the moment the session ends
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (party && scenes.length > 0) return <CelebrationFlow scenes={scenes} onDone={() => setParty(false)} />;
  const text = allClean
    ? tr('Every line followed from the one before. That’s what solid looks like.')
    : gap
      ? tr('One thing to tighten: **{0}**. I’ll bring it back tomorrow.', { 0: conceptOf(gap.concept).title.toLowerCase() })
      : solved > 0
        ? tr('Good work. The slips I marked are noted, nothing to review, just slow that line down.')
        : tr('That was a hard set. Have a look at the routes, and we’ll come back to these.');
  return (
    <>
      <div className="scroll stagger" style={{ padding: '6px 20px 20px' }}>
        <div className="center" style={{ padding: '6px 0 4px' }}>
          <LeraSays stack size={112} mood={allClean || solved === done.length ? 'celebrate' : 'proud'} text={text} />
        </div>
        <div className="reward">
          <div className="reward-xp">
            <span className="reward-plus">+<CountUp to={earned} /></span>
            <span>XP</span>
          </div>
          <div className="reward-side">
            <span className={`streakpill ${days > 0 ? 'lit' : ''}`}><Icon name="flame" size={16} fill />{' '}{tr('Day')}{' '}{Math.max(1, days)}</span>
            <span className="faint" style={{ fontSize: 12.5 }}>{tr('Level {0} · {1}', { 0: lv.level, 1: lv.title })}</span>
          </div>
          <Ring value={Math.min(1, xpToday / goal)} size={58} stroke={7} color="var(--flame)">
            <span style={{ fontSize: 11, fontWeight: 700 }}>{xpToday >= goal ? tr('Goal!') : `${xpToday}/${goal}`}</span>
          </Ring>
        </div>
        <div className="row" style={{ gap: 10, marginTop: 12 }}>
          <div className="stat grow"><b><CountUp to={solved} />/{results.length}</b><span>{tr('solved')}</span></div>
          <div className="stat grow"><b><CountUp to={clean} /></b><span>{tr('clean')}</span></div>
          <div className="stat grow"><b><CountUp to={Math.max(1, Math.round(seconds / 60))} /></b><span>{tr('min')}</span></div>
        </div>
        {list.length > 0 && (
          <div className="card" style={{ marginTop: 14 }}>
            <span className="label">{tr('What I noticed')}</span>
            {list.map((m) => {
              const c = concepts[m.concept];
              const due = c?.due;
              return (
                <button key={m.severity + m.concept} className="noticed" onClick={() => openOverlay({ name: 'review', concept: m.concept })}>
                  <span className={`chip ${chipTone(m.severity)}`}>{tr(SEVERITY_LABEL[m.severity])}</span>
                  <span className="grow">
                    <b style={{ display: 'block', fontSize: 14.5 }}>{conceptOf(m.concept).title}</b>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {m.severity === 'gap' ? (due && due > today ? `Comes back ${due === addDays(today, 1) ? 'tomorrow' : `on ${due}`}` : tr('In your review queue')) : c?.rushing ? tr('Keeps happening, worth a look') : tr('Noted. No review needed.')}
                    </span>
                  </span>
                  <Icon name="chevron" size={16} />
                </button>
              );
            })}
          </div>
        )}
        {weak.length > 0 && (
          <div className="col" style={{ gap: 10, marginTop: 14 }}>
            <span className="label">{tr('Worth going back to')}</span>
            {weak.map((w) => <WeakCard key={w.id} w={w} />)}
          </div>
        )}
        <p className="faint" style={{ fontSize: 13, textAlign: 'center', marginTop: 14 }}>{session.title}</p>
      </div>
      <div className="ws-foot" style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
        {gap && (
          <Button3D onClick={() => openOverlay({ name: 'review', concept: gap.concept })}>
            <Icon name="book" size={18} />{' '}{tr('Review it now ·')}{' '}{conceptOf(gap.concept).minutes} min
          </Button3D>
        )}
        <Button3D variant={gap ? 'secondary' : 'primary'} onClick={back}>{tr('Done')}</Button3D>
      </div>
      <Confetti fire={solved > 0 ? 1 : 0} />
    </>
  );
}
