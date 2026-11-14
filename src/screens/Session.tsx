import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { aiCheckOpen, aiDiagnose, aiSimplify } from '../ai/tasks';
import { aiReady } from '../ai/providers';
import { analyze, cleanPath, hintLadder, HintLadder } from '../engine/analyze';
import { isCalc } from '../engine/calc/check';
import { CONCEPTS } from '../engine/concepts';
import { PLAIN } from '../engine/concepts-calc';
import { AttemptAnalysis, CheckedLine, Diagnosis, Problem } from '../engine/types';
import { Lera, Mood } from '../mascot/Lera';
import { actions, getState, useStore } from '../store';
import { levelOf, totalXp, xpByDay } from '../store/game';
import { addDays, buildSession, dayOf, findTopic, Session, streak } from '../store/learner';
import { weaknesses } from '../store/weakness';
import { back, openOverlay, Route, setBackGuard } from '../store/nav';
import { Button3D, Confetti, CountUp, LeraSays, Ring, haptic, toast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { MathView, RichText, typeset } from '../ui/math';
import { WeakCard } from './Main';

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

const SOURCE_LABEL: Record<Problem['source'], string> = { notes: 'From your notes', generated: 'Fresh practice', review: 'Coming back' };

const SEVERITY_LABEL: Record<Diagnosis['severity'], string> = { gap: 'Gap', slip: 'Slip', notation: 'Notation', strategy: 'Route', incomplete: 'Not finished' };

const chipTone = (s: Diagnosis['severity']): string => (s === 'gap' ? 'gap' : s === 'slip' ? 'slip' : 'info');

/* ───────────── the keyboard ───────────── */

function Keyboard({ vars, onKey, onDelete, onEnter, onMove, ready, calc }: { vars: string[]; onKey: (s: string) => void; onDelete: () => void; onEnter: () => void; onMove: (d: -1 | 1) => void; ready: boolean; calc?: boolean }) {
  const [a, b] = [vars[0] ?? 'x', vars[1] ?? (vars[0] === 'y' ? 'x' : 'y')];
  type Key = { k: string; ins?: string; tone?: string; label?: string };
  // calculus swaps the inequality column for the functions it needs
  const calcRows: Key[][] = [
    [{ k: a, tone: 'var' }, { k: 'e', tone: 'var' }, { k: '(' }, { k: ')' }, { k: 'x²', ins: '^2', label: 'squared' }, { k: '⌫', tone: 'fn', label: 'Delete' }],
    [{ k: '7' }, { k: '8' }, { k: '9' }, { k: '+', tone: 'op' }, { k: 'sin', ins: 'sin(', tone: 'op' }, { k: 'xⁿ', ins: '^', label: 'to the power' }],
    [{ k: '4' }, { k: '5' }, { k: '6' }, { k: '−', ins: '-', tone: 'op', label: 'minus' }, { k: 'cos', ins: 'cos(', tone: 'op' }, { k: '√', ins: 'sqrt(', label: 'square root' }],
    [{ k: '1' }, { k: '2' }, { k: '3' }, { k: '×', ins: '*', tone: 'op', label: 'times' }, { k: 'ln', ins: 'ln(', tone: 'op' }, { k: '+C', ins: ' + C', tone: 'op', label: 'plus C' }],
    [{ k: '0' }, { k: '.' }, { k: '=', tone: 'op' }, { k: '÷', ins: '/', tone: 'op', label: 'divided by' }, { k: 'π', ins: 'pi', tone: 'op', label: 'pi' }, { k: '↵', tone: 'go', label: 'Check this line' }],
  ];
  const algebraRows: Key[][] = [
    [{ k: a, tone: 'var' }, { k: b, tone: 'var' }, { k: '(' }, { k: ')' }, { k: 'x²', ins: '^2', label: 'squared' }, { k: '⌫', tone: 'fn', label: 'Delete' }],
    [{ k: '7' }, { k: '8' }, { k: '9' }, { k: '+', tone: 'op' }, { k: '<', tone: 'op' }, { k: 'xⁿ', ins: '^', label: 'to the power' }],
    [{ k: '4' }, { k: '5' }, { k: '6' }, { k: '−', ins: '-', tone: 'op', label: 'minus' }, { k: '>', tone: 'op' }, { k: '√', ins: 'sqrt(', label: 'square root' }],
    [{ k: '1' }, { k: '2' }, { k: '3' }, { k: '×', ins: '*', tone: 'op', label: 'times' }, { k: '≤', ins: '<=', tone: 'op' }, { k: '±', tone: 'op' }],
    [{ k: '0' }, { k: '.' }, { k: '=', tone: 'op' }, { k: '÷', ins: '/', tone: 'op', label: 'divided by' }, { k: '≥', ins: '>=', tone: 'op' }, { k: '↵', tone: 'go', label: 'Check this line' }],
  ];
  const rows = calc ? calcRows : algebraRows;
  void b;
  return (
    <div className="kbd" aria-label="Maths keyboard">
      <div className="kbd-extra">
        <button onClick={() => onMove(-1)} aria-label="Move left"><Icon name="left" size={18} /></button>
        <button onClick={() => onMove(1)} aria-label="Move right"><Icon name="right" size={18} /></button>
        {calc ? (
          <>
            <button onClick={() => onKey(`d/d${a}(`)}>d/d{a}</button>
            <button onClick={() => onKey('∫ ')}>∫</button>
            <button onClick={() => onKey(` d${a}`)}>d{a}</button>
            <button onClick={() => onKey('tan(')}>tan</button>
            <button onClick={() => onKey('e^(')}>eˣ</button>
            <button onClick={() => onKey(`lim ${a}→`)}>lim</button>
            <button onClick={() => onKey('inf')}>∞</button>
            <button onClick={() => onKey('DNE')}>no limit</button>
          </>
        ) : (
          <>
            <button onClick={() => onKey(' or ')}>or</button>
            <button onClick={() => onKey(', ')}>,</button>
            <button onClick={() => onKey('no solution')}>no solution</button>
            <button onClick={() => onKey('all real numbers')}>all reals</button>
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
              if (key.k === '⌫') onDelete();
              else if (key.k === '↵') onEnter();
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
  if (pending) return <span className="mark wait" aria-label="Not checked yet" />;
  if (line.status === 'ok' || line.status === 'recovered') {
    return (
      <span className="mark ok" aria-label="Follows">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path className="draw" d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </span>
    );
  }
  if (line.status === 'wrong') return <span className={`mark ${line.diag?.severity === 'slip' ? 'slip' : 'gap'}`} aria-label="Doesn’t follow" />;
  if (line.status === 'carried') return <span className="mark carried" aria-label="Follows from a line that is off" />;
  return <span className="mark none" aria-label="Not checked" />;
}

function DiagnosisCard({ diag, onReview, onFix, fixShown, aiNote, onSense }: { diag: Diagnosis; onReview: () => void; onFix: () => void; fixShown: boolean; aiNote?: string; onSense: (ok: boolean) => Promise<string | null> }) {
  const concept = CONCEPTS[diag.concept];
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
        <span className={`chip ${chipTone(diag.severity)}`}>{SEVERITY_LABEL[diag.severity]}</span>
        <b className="grow" style={{ fontSize: 14.5, lineHeight: 1.3 }}><RichText text={diag.title} /></b>
      </div>
      <p style={{ fontSize: 14.5, lineHeight: 1.5, marginTop: 8 }}><RichText text={aiNote ?? diag.message} /></p>
      {diag.severity !== 'strategy' && (
        <div className="sense" data-state={sense ?? 'ask'}>
          {sense === null && (
            <>
              <span>Did that make sense?</span>
              <button onClick={() => answer(true)}>Yes</button>
              <button onClick={() => answer(false)}>Not really</button>
            </>
          )}
          {sense === 'yes' && <span className="sense-ok"><Icon name="check" size={14} stroke={3} /> Good. Fix the line and carry on.</span>}
          {sense === 'no' && (
            <div className="plainer">
              <span className="label">In plain words</span>
              <p><RichText text={simpler ?? PLAIN[diag.concept]} /></p>
              <button className="review-link" onClick={onReview}>
                <Icon name="play" size={14} fill />
                <span>Walk me through an example</span>
                <Icon name="chevron" size={15} />
              </button>
            </div>
          )}
        </div>
      )}
      {fixShown && diag.fix && (
        <p className="fixline">
          <span className="faint" style={{ fontSize: 12.5 }}>This line should read</span>
          <MathView text={diag.fix} block />
        </p>
      )}
      <div className="row" style={{ gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
        {(diag.severity === 'gap' || diag.code !== 'arithmetic-slip') && (
          <button className="review-link" onClick={onReview}>
            <Icon name="book" size={16} />
            <span>Review: {concept.title}</span>
            <span className="faint">· {concept.minutes} min</span>
            <Icon name="chevron" size={15} />
          </button>
        )}
        {diag.fix && !fixShown && (
          <button className="linkbtn" style={{ fontSize: 13.5, padding: '6px 8px' }} onClick={onFix}>
            Show the corrected line
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
  // 'line' marks each line as it lands; 'end' holds every mark back until the learner asks
  const [mode, setMode] = useState<'line' | 'end'>(() => getState().profile.checkMode ?? 'line');
  const [checkedCount, setCheckedCount] = useState(0);
  const calc = isCalc(problem.kind);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const caret = useRef<number | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const started = useRef(Date.now());
  const seen = useRef(new Map<string, Diagnosis>());
  const recorded = useRef(false);

  const analysis = useMemo(() => analyze(problem, lines), [problem, lines]);
  const isChecked = (i: number): boolean => mode === 'line' || i < checkedCount;
  const allChecked = mode === 'line' || checkedCount >= lines.length;
  const solved = analysis.verdict === 'solved' && allChecked;
  const finished = solved || revealed;
  const clean = useMemo(() => cleanPath(problem), [problem]);
  const vars = useMemo(() => {
    if (isCalc(problem.kind)) return [problem.variable ?? 'x'];
    const found = [...new Set((problem.given.match(/[a-z]/gi) ?? []).filter((c) => !/[e]/i.test(c) || problem.given.includes('e')))];
    return (problem.variable ? [problem.variable, ...found.filter((v) => v !== problem.variable)] : found).slice(0, 2);
  }, [problem]);

  analysis.lines.forEach((l, i) => {
    if (isChecked(i) && l.status === 'wrong' && l.diag) seen.current.set(`${l.diag.code}:${l.diag.concept}`, l.diag);
  });

  useLayoutEffect(() => {
    if (caret.current !== null && inputRef.current) {
      inputRef.current.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [input]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [lines.length, openDiag, hintOpen, finished, compare]);

  useEffect(() => {
    if (!finished) inputRef.current?.focus({ preventScroll: true });
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

  const insert = (s: string) => {
    const el = inputRef.current;
    const from = el?.selectionStart ?? input.length;
    const to = el?.selectionEnd ?? input.length;
    setInput(input.slice(0, from) + s + input.slice(to));
    caret.current = from + s.length;
    setNote(null);
  };

  const del = () => {
    const el = inputRef.current;
    const from = el?.selectionStart ?? input.length;
    const to = el?.selectionEnd ?? input.length;
    if (from !== to) {
      setInput(input.slice(0, from) + input.slice(to));
      caret.current = from;
    } else if (from > 0) {
      setInput(input.slice(0, from - 1) + input.slice(from));
      caret.current = from - 1;
    } else if (!input && lines.length) {
      // deleting on an empty line pulls the previous line back for editing
      const prev = lines[lines.length - 1];
      setLines(lines.slice(0, -1));
      setCheckedCount((c) => Math.min(c, lines.length - 1));
      setInput(prev);
      caret.current = prev.length;
      setOpenDiag(null);
    }
    setNote(null);
  };

  const move = (d: -1 | 1) => {
    const el = inputRef.current;
    if (!el) return;
    const pos = Math.max(0, Math.min(input.length, (el.selectionStart ?? input.length) + d));
    el.setSelectionRange(pos, pos);
  };

  const commit = () => {
    const text = input.trim();
    if (!text || finished) return;
    const next = [...lines, text];
    const a = analyze(problem, next);
    const line = a.lines[a.lines.length - 1];
    if (!line || line.status === 'unreadable') {
      setNote(line?.note ?? 'I couldn’t read that line. Check the brackets and signs.');
      setShake((n) => n + 1);
      setMood('curious');
      haptic([12, 30, 12]);
      return;
    }
    setLines(next);
    setInput('');
    setHintOpen(false);
    if (mode === 'end') {
      // nothing is marked yet: the learner finishes first, then asks
      setNote(null);
      setOpenDiag(null);
      setMood('idle');
      return;
    }
    setNote(line.status === 'unchecked' ? line.note ?? 'I can’t compare this line with the one above, so I’ve left it unmarked.' : null);
    const idx = next.length - 1;
    if (line.status === 'wrong') {
      setOpenDiag(idx);
      setMood('oops');
      haptic([14, 40, 14]);
      setTimeout(() => setMood('thinking'), 1400);
      const st = getState();
      // the rules couldn't name it: ask the model for a second opinion in words, if one is connected
      if (line.diag?.code === 'unknown' && aiReady(st.ai)) {
        const prev = next[idx - 1] ?? problem.given;
        aiDiagnose(st.ai, problem, prev, text)
          .then((d) => d && setAiNotes((n) => ({ ...n, [text]: `**${d.title}** ${d.message}` })))
          .catch(() => undefined);
      }
    } else if (a.verdict === 'solved') {
      setOpenDiag(null);
      setMood('celebrate');
      haptic([10, 50, 20]);
      record(a, rung);
    } else {
      setOpenDiag(null);
      setMood(line.status === 'carried' ? 'thinking' : 'happy');
      if (line.status === 'carried') setNote('That follows from the line above — but that line was already off, so the mistake is carried along.');
      if (line.status === 'recovered') setNote('Back on track: this line is true to the original problem again.');
      setTimeout(() => setMood('idle'), 1100);
    }
  };

  /** "When I finish" mode: mark every line written so far, all at once. */
  const checkAll = () => {
    if (!lines.length || finished) return;
    const a = analysis;
    setCheckedCount(lines.length);
    setHintOpen(false);
    const wrong = a.lines.filter((l) => l.status === 'wrong');
    if (a.verdict === 'solved') {
      for (const l of wrong) if (l.diag) seen.current.set(`${l.diag.code}:${l.diag.concept}`, l.diag);
      setOpenDiag(wrong.length ? a.lines.findIndex((l) => l.status === 'wrong') : null);
      setNote(null);
      setMood('celebrate');
      haptic([10, 50, 20]);
      record(a, rung);
    } else if (wrong.length) {
      setOpenDiag(a.lines.findIndex((l) => l.status === 'wrong'));
      setMood('oops');
      haptic([14, 40, 14]);
      setTimeout(() => setMood('thinking'), 1400);
      setNote(`${wrong.length === 1 ? 'One line doesn’t' : `${wrong.length} lines don’t`} follow. Tap a flagged line to see why — then write the corrected line underneath, or delete back to it.`);
    } else {
      setOpenDiag(null);
      setMood('happy');
      setNote(a.remaining ?? 'Every line follows — but it isn’t finished yet. Keep going.');
    }
  };

  const switchMode = () => {
    const nextMode = mode === 'line' ? 'end' : 'line';
    haptic(5);
    if (nextMode === 'line') checkAll();
    else setCheckedCount(lines.length);
    setMode(nextMode);
    actions.setProfile({ checkMode: nextMode });
    toast(nextMode === 'end' ? 'I’ll wait until you ask before marking anything' : 'Marking each line as you write it');
  };

  const askHint = () => {
    const ladder = hintLadder(problem, lines);
    if (!ladder) {
      toast('I don’t have a hint for this one.');
      return;
    }
    setHint(ladder);
    setRung((r) => Math.min(3, hintOpen ? r + 1 : Math.max(1, r)));
    setHintOpen(true);
    setMood('thinking');
  };

  const reveal = () => {
    setRevealed(true);
    setHintOpen(false);
    setRung(3);
    setMood('idle');
    record(analysis, 3);
  };

  const finish = (skipped = false) => {
    onDone({
      problem,
      verdict: analysis.verdict,
      marks: marksNow(),
      hintRung: revealed ? 3 : rung,
      seconds: (Date.now() - started.current) / 1000,
      steps: analysis.steps,
      cleanSteps: analysis.cleanSteps,
      skipped,
    });
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && !input && lines.length) {
      e.preventDefault();
      del();
    }
  };

  const preview = input.trim() ? typeset(input) : null;
  const marks = marksNow();
  const strategy = analysis.marks.find((m) => m.severity === 'strategy');
  const hintText = hint ? (rung <= 1 ? hint.nudge : rung === 2 ? hint.method : 'Here is the next line. Read it, then write it yourself:') : '';

  return (
    <>
      <div className="scroll ws" ref={scroller}>
        <div className="problem">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className={`chip ${problem.source === 'review' ? 'gap' : problem.source === 'notes' ? '' : 'plain'}`}>
              {problem.source === 'review' ? <Icon name="refresh" size={13} /> : problem.source === 'notes' ? <Icon name="file" size={13} /> : null}
              {SOURCE_LABEL[problem.source]}
            </span>
            <Lera size={42} mood={mood} />
          </div>
          <p className="prompt"><RichText text={problem.prompt} /></p>
          <div className="given"><MathView text={problem.given} block /></div>
        </div>

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
          <div className="entry" key={shake} data-shake={shake ? '' : undefined}>
            <span className="n">{lines.length + 1}</span>
            <div className="grow">
              {preview && <div className="preview" dangerouslySetInnerHTML={{ __html: preview }} />}
              <input
                ref={inputRef}
                className="mathin"
                value={input}
                inputMode="none"
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                placeholder={lines.length ? (mode === 'end' ? 'Next line… then “Check my work”' : 'Next line…') : 'Write your first line…'}
                aria-label={`Line ${lines.length + 1} of your working`}
                onChange={(e: { target: { value: string } }) => {
                  setInput(e.target.value);
                  setNote(null);
                }}
                onKeyDown={onKeyDown}
              />
            </div>
          </div>
        )}
        {note && !finished && <p className="ws-note"><Icon name="question" size={16} /> <span>{note}</span></p>}

        {hintOpen && hint && !finished && (
          <div className="hint">
            <LeraSays size={40} mood="thinking" solid text={hintText}>
              {rung >= 3 && (
                <span className="hint-line">
                  <MathView text={hint.line} block />
                </span>
              )}
              <span className="row" style={{ gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                <span className="hint-rungs" aria-label={`Hint ${rung} of 3`}>{[1, 2, 3].map((n) => <i key={n} data-on={n <= rung ? '' : undefined} />)}</span>
                {rung < 3 ? (
                  <button className="linkbtn" style={{ fontSize: 13.5, padding: '4px 8px' }} onClick={askHint}>
                    {rung === 1 ? 'Tell me the method' : 'Show me the line'}
                  </button>
                ) : (
                  <button className="linkbtn" style={{ fontSize: 13.5, padding: '4px 8px' }} onClick={reveal}>
                    Show the whole solution
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
                  <b>{marks.length ? 'Solved — with a detour' : rung >= 3 ? 'Solved, with the line shown' : 'Solved'}</b>
                  <p className="muted" style={{ fontSize: 14 }}>
                    {analysis.steps} {analysis.steps === 1 ? 'line' : 'lines'}
                    {analysis.approach ? ` · ${analysis.approach}` : ''}
                  </p>
                </div>
              </div>
            ) : (
              <div className="card tint">
                <b>Here’s a clean route</b>
                <p className="muted" style={{ fontSize: 14, marginTop: 2 }}>Read each step and the reason beside it. This one comes back later so you can do it yourself.</p>
              </div>
            )}

            {marks.filter((m) => m.severity !== 'strategy').length > 0 && (
              <div className="card">
                <span className="label">What I noticed</span>
                {marks.filter((m) => m.severity !== 'strategy').map((m) => (
                  <button key={m.code + m.concept} className="noticed" onClick={() => openOverlay({ name: 'review', concept: m.concept })}>
                    <span className={`chip ${chipTone(m.severity)}`}>{SEVERITY_LABEL[m.severity]}</span>
                    <span className="grow"><RichText text={m.title} /></span>
                    <Icon name="chevron" size={16} />
                  </button>
                ))}
              </div>
            )}

            {strategy && <p className="ws-note info"><Icon name="swap" size={16} /> <span><RichText text={strategy.message} /></span></p>}

            {clean.length > 0 && (solved ? analysis.steps !== clean.length || marks.length > 0 || compare : true) && (
              <div className="card">
                <button className="row" style={{ width: '100%', justifyContent: 'space-between' }} onClick={() => setCompare(!compare)} aria-expanded={compare || revealed}>
                  <span className="label">{revealed ? 'Clean route' : `A clean route · ${clean.length} ${clean.length === 1 ? 'line' : 'lines'}`}</span>
                  {!revealed && <Icon name={compare ? 'down' : 'chevron'} size={17} />}
                </button>
                {(compare || revealed) && (
                  <ol className="route">
                    {clean.map((s, i) => (
                      <li key={i} style={{ animationDelay: `${i * 90}ms` }}>
                        <MathView text={s.line} block />
                        <span className="muted"><RichText text={s.why} /></span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {finished ? (
        <div className="ws-foot">
          <Button3D variant={solved ? 'ok' : 'primary'} sheen onClick={() => finish()}>
            {last ? 'Finish' : 'Next problem'} <Icon name="arrow" size={19} />
          </Button3D>
        </div>
      ) : (
        <div className="ws-keys">
          <div className="row ws-tools">
            <button className="tool" onClick={askHint}>
              <Icon name="bulb" size={18} /> Hint{rung ? ` ${rung}/3` : ''}
            </button>
            <button className="tool" onClick={switchMode} aria-label="Change when your working is checked">
              <Icon name={mode === 'end' ? 'clock' : 'check'} size={16} stroke={2.6} /> {mode === 'end' ? 'At the end' : 'As I go'}
            </button>
            <span className="grow" />
            {mode === 'end' && lines.length > checkedCount && (
              <button className="tool go" onClick={checkAll}>
                <Icon name="check" size={16} stroke={3} /> Check my work
              </button>
            )}
            <button className="tool" onClick={() => (lines.length || rung ? reveal() : finish(true))}>
              {lines.length || rung ? 'Show solution' : 'Skip'}
            </button>
          </div>
          <Keyboard vars={vars} onKey={insert} onDelete={del} onEnter={commit} onMove={move} ready={!!input.trim()} calc={calc} />
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
      else toast('The AI reply couldn’t be read. Try again.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'The AI check failed.');
    }
    setBusy(false);
  };
  return (
    <>
      <div className="scroll ws">
        <div className="problem">
          <span className="chip"><Icon name="file" size={13} /> From your notes · written answer</span>
          <p className="prompt" style={{ fontSize: 17, lineHeight: 1.5 }}><RichText text={problem.original ?? problem.prompt} /></p>
        </div>
        <textarea className="field" style={{ minHeight: 150, margin: '4px 0 10px', resize: 'none' }} placeholder="Write your working here, one step per line…" value={text} onChange={(e: { target: { value: string } }) => setText(e.target.value)} aria-label="Your working" />
        {verdict ? (
          <div className={`diag ${verdict.correct ? 'okc' : 'slip'}`}>
            <span className={`chip ${verdict.correct ? 'ok' : 'slip'}`}>{verdict.correct ? 'Looks right' : 'Not yet'}</span>
            <p style={{ marginTop: 8, lineHeight: 1.5, fontSize: 14.5 }}>{verdict.feedback}</p>
            <p className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>Checked by the AI model you connected, not by the built-in engine.</p>
          </div>
        ) : (
          <p className="ws-note"><Icon name="question" size={16} /> <span>{aiReady(ai) ? 'Word problems are checked by the AI model you connected.' : 'The built-in engine checks algebra line by line, but it can’t mark a word problem. Connect an AI model in Settings to have these checked, or mark it yourself.'}</span></p>
        )}
      </div>
      <div className="ws-foot" style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
        {aiReady(ai) && !verdict && <Button3D busy={busy} disabled={!text.trim()} onClick={check}>Check my answer</Button3D>}
        <Button3D variant={verdict?.correct ? 'ok' : 'secondary'} onClick={() => done(verdict ? verdict.correct : !!text.trim())}>
          {verdict ? (last ? 'Finish' : 'Next problem') : 'I’ve done this one'}
        </Button3D>
        {!verdict && <button className="linkbtn" onClick={() => done(false, true)}>Skip</button>}
      </div>
    </>
  );
}

/* ───────────── the session around the problems ───────────── */

export function SessionScreen({ route }: { route: Extract<Route, { name: 'session' }> }) {
  const [session] = useState<Session>(() => {
    const st = getState();
    if (route.problems?.length) {
      return { title: route.title ?? 'Practice', topicId: route.topicId, problems: route.problems, reviews: route.problems.filter((p) => p.source === 'review').length, minutes: Math.max(1, Math.round(route.problems.length * 1.4)) };
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

  if (total === 0) {
    return (
      <div className="screen" data-dir="1">
        <div className="topbar"><button className="iconbtn" onClick={back} aria-label="Close"><Icon name="close" /></button></div>
        <div className="scroll center" style={{ justifyContent: 'center', gap: 14, padding: '0 30px' }}>
          <Lera size={100} mood="proud" />
          <h2 style={{ fontSize: 22 }}>Nothing is due right now</h2>
          <p className="muted" style={{ lineHeight: 1.5 }}>When a topic is ready to come back, it will show up here. Until then, pick a lesson and practise it.</p>
          <Button3D onClick={back}>Back</Button3D>
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
        <button className="iconbtn" onClick={() => (phase === 'solve' && results.length + 1 < total ? setLeaving(true) : back())} aria-label="Close session">
          <Icon name="close" />
        </button>
        <div className="segbar grow" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={results.length} aria-label="Problems done">
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
          <div className="dialog" role="alertdialog" aria-label="Leave this session?">
            <Lera size={64} mood="curious" interactive={false} />
            <b style={{ fontSize: 18 }}>Leave this session?</b>
            <p className="muted" style={{ fontSize: 14.5 }}>What you’ve solved so far is already saved.</p>
            <Button3D onClick={() => setLeaving(false)}>Keep going</Button3D>
            <button className="linkbtn" onClick={back}>Leave</button>
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
        ? `These come straight from your notes. Write every line — I read the working, not just the answer.`
        : 'Fresh problems for this topic. Write every line — I read the working, not just the answer.';
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
        <Button3D sheen onClick={onStart}>Start</Button3D>
      </div>
    </>
  );
}

function Summary({ session, results }: { session: Session; results: Result[] }) {
  const concepts = useStore((s) => s.concepts);
  const done = results.filter((r) => !r.skipped);
  const solved = done.filter((r) => r.verdict === 'solved').length;
  const clean = done.filter((r) => r.verdict === 'solved' && r.marks.filter((m) => m.severity !== 'strategy').length === 0 && r.hintRung < 3).length;
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
  const earned = done.reduce((sum, r) => sum + (r.verdict === 'solved' ? 10 + (r.marks.filter((m) => m.severity !== 'strategy').length === 0 && r.hintRung < 3 ? 5 : 0) + (r.problem.source === 'review' ? 5 : 0) + (r.hintRung === 0 ? 2 : 0) : 2), 0);
  const lv = levelOf(totalXp({ attempts, read }));
  const days = streak(attempts);
  const touched = new Set(list.map((m) => m.concept));
  const weak = weaknesses({ attempts, concepts, docs, understood }).filter((w) => (w.concept && touched.has(w.concept)) || w.kind === 'lesson').slice(0, 2);
  const text = allClean
    ? 'Every line followed from the one before. That’s what solid looks like.'
    : gap
      ? `One thing to tighten: **${CONCEPTS[gap.concept].title.toLowerCase()}**. I’ll bring it back tomorrow.`
      : solved > 0
        ? 'Good work. The slips I marked are noted — nothing to review, just slow that line down.'
        : 'That was a hard set. Have a look at the routes, and we’ll come back to these.';
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
            <span className={`streakpill ${days > 0 ? 'lit' : ''}`}><Icon name="flame" size={16} fill /> Day {Math.max(1, days)}</span>
            <span className="faint" style={{ fontSize: 12.5 }}>Level {lv.level} · {lv.title}</span>
          </div>
          <Ring value={Math.min(1, xpToday / goal)} size={58} stroke={7} color="var(--flame)">
            <span style={{ fontSize: 11, fontWeight: 700 }}>{xpToday >= goal ? 'Goal!' : `${xpToday}/${goal}`}</span>
          </Ring>
        </div>
        <div className="row" style={{ gap: 10, marginTop: 12 }}>
          <div className="stat grow"><b><CountUp to={solved} />/{results.length}</b><span>solved</span></div>
          <div className="stat grow"><b><CountUp to={clean} /></b><span>clean</span></div>
          <div className="stat grow"><b><CountUp to={Math.max(1, Math.round(seconds / 60))} /></b><span>min</span></div>
        </div>
        {list.length > 0 && (
          <div className="card" style={{ marginTop: 14 }}>
            <span className="label">What I noticed</span>
            {list.map((m) => {
              const c = concepts[m.concept];
              const due = c?.due;
              return (
                <button key={m.severity + m.concept} className="noticed" onClick={() => openOverlay({ name: 'review', concept: m.concept })}>
                  <span className={`chip ${chipTone(m.severity)}`}>{SEVERITY_LABEL[m.severity]}</span>
                  <span className="grow">
                    <b style={{ display: 'block', fontSize: 14.5 }}>{CONCEPTS[m.concept].title}</b>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {m.severity === 'gap' ? (due && due > today ? `Comes back ${due === addDays(today, 1) ? 'tomorrow' : `on ${due}`}` : 'In your review queue') : c?.rushing ? 'Keeps happening — worth a look' : 'Noted. No review needed.'}
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
            <span className="label">Worth going back to</span>
            {weak.map((w) => <WeakCard key={w.id} w={w} />)}
          </div>
        )}
        <p className="faint" style={{ fontSize: 13, textAlign: 'center', marginTop: 14 }}>{session.title}</p>
      </div>
      <div className="ws-foot" style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
        {gap && (
          <Button3D onClick={() => openOverlay({ name: 'review', concept: gap.concept })}>
            <Icon name="book" size={18} /> Review it now · {CONCEPTS[gap.concept].minutes} min
          </Button3D>
        )}
        <Button3D variant={gap ? 'secondary' : 'primary'} onClick={back}>Done</Button3D>
      </div>
      <Confetti fire={solved > 0 ? 1 : 0} />
    </>
  );
}
