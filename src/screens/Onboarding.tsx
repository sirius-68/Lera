import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Subject } from '../engine/types';
import { Lera, Mood } from '../mascot/Lera';
import { actions, useStore } from '../store';
import { GOALS } from '../store/game';
import { resetNav } from '../store/nav';
import { enableReminders } from '../store/remind';
import { Button3D, Confetti, haptic } from '../ui/kit';
import { Icon } from '../ui/icons';
import { MathView } from '../ui/math';
import '../styles/onb.css';
import { SceneBell, SceneGraph, SceneLines, ScenePath, ScenePlain, SceneReturn, SceneReward } from './onb/Scenes';
import { Processing, Source, UploadPicker } from './Upload';

/**
 * First run.
 *
 * It alternates between two kinds of screen: a question whose answer changes
 * how the app behaves, and a short moving picture of what Lera will do with
 * that answer. By the end the learner has seen every part of the method —
 * line-by-line checking, notes as a path, ideas coming back, plain-words
 * explanations, graphs, streaks — and has tried the core of it once.
 */

type Step =
  | 'splash' | 'hello' | 'how' | 'subjects' | 'stage' | 'goal' | 'path' | 'spot' | 'feel' | 'struggle'
  | 'return' | 'check' | 'plain' | 'daily' | 'graph' | 'when' | 'reward' | 'name' | 'plan' | 'remind' | 'upload' | 'done';

const LANGS = [
  { id: 'en', label: 'English' },
  { id: 'ru', label: 'Русский' },
  { id: 'fr', label: 'Français' },
];

const SUBJECTS: { id: Subject; title: string; sub: string; sample: string; tone: string }[] = [
  { id: 'algebra', title: 'Algebra', sub: 'Equations, brackets, factorising', sample: '3x + 4 = 19', tone: 'a' },
  { id: 'calc1', title: 'Calculus 1', sub: 'Limits and derivatives', sample: 'd/dx(x^2 sin(x))', tone: 'b' },
  { id: 'calc2', title: 'Calculus 2', sub: 'Integrals and their techniques', sample: '∫ x e^x dx', tone: 'c' },
];

interface Choice {
  id: string;
  emoji: string;
  title: string;
  sub?: string;
  reply?: string;
  focus?: string;
}

const STAGE: Choice[] = [
  { id: 'school', emoji: '🎒', title: 'At school', reply: 'Good — I’ll keep to what your notes cover and build it up step by step.' },
  { id: 'uni', emoji: '🎓', title: 'College or university', reply: 'Then pace matters. I’ll help you keep up with the lectures you upload.' },
  { id: 'self', emoji: '📚', title: 'Teaching myself', reply: 'I like that. Bring any book or notes; I’ll turn them into a path.' },
  { id: 'back', emoji: '🔁', title: 'Coming back after a break', reply: 'It comes back faster than you’d think. We’ll find what’s still solid first.' },
];

const WHY: Choice[] = [
  { id: 'exam', emoji: '🎯', title: 'I have an exam coming', reply: 'Then we hunt down the marks you’re losing, one rule at a time.' },
  { id: 'grades', emoji: '📈', title: 'I want better grades', reply: 'Grades follow from fewer repeated mistakes. That’s my whole job.' },
  { id: 'understand', emoji: '💡', title: 'I want it to finally make sense', reply: 'Good. I explain the why, in plain words, every time.' },
  { id: 'ahead', emoji: '🚀', title: 'I want to get ahead', reply: 'Then I’ll raise the level as soon as something holds.' },
  { id: 'sharp', emoji: '🧩', title: 'I just want to stay sharp', reply: 'A few minutes a day is plenty. I’ll bring back what’s fading.' },
];

const TRIPS: Choice[] = [
  { id: 'signs', emoji: '➖', title: 'Minus signs and small slips', focus: 'catching sign slips' },
  { id: 'method', emoji: '🧭', title: 'Not knowing which method to use', focus: 'choosing the right method' },
  { id: 'steps', emoji: '⏩', title: 'Skipping steps and rushing', focus: 'slowing down the last line' },
  { id: 'blank', emoji: '😶', title: 'Going blank when it gets hard', focus: 'small steps and gentle hints' },
  { id: 'find', emoji: '🔍', title: 'Not finding where I went wrong', focus: 'pointing at the exact line' },
  { id: 'forget', emoji: '🫧', title: 'Understanding it, then forgetting', focus: 'bringing ideas back before they fade' },
];

const WHEN: (Choice & { time: string })[] = [
  { id: 'morning', emoji: '🌅', title: 'Morning', sub: 'Before the day gets going', time: '8:00' },
  { id: 'afternoon', emoji: '☀️', title: 'Afternoon', sub: 'Between classes or work', time: '14:30' },
  { id: 'evening', emoji: '🌆', title: 'Evening', sub: 'When things calm down', time: '19:00' },
  { id: 'night', emoji: '🌙', title: 'Late at night', sub: 'When it’s finally quiet', time: '22:00' },
];

const FEEL: { mood: Mood; label: string; line: string }[] = [
  { mood: 'oops', label: 'Lost', line: 'That’s an honest answer. We’ll start where it’s solid and build from there.' },
  { mood: 'thinking', label: 'Shaky', line: 'Shaky usually means two or three rules aren’t fixed yet. I’ll find which.' },
  { mood: 'happy', label: 'Okay', line: 'Okay is a good place to start. Let’s turn it into reliable.' },
  { mood: 'proud', label: 'Confident', line: 'Then I’ll be picky — and show you the faster routes.' },
];

interface Spot {
  prompt: string;
  given: string;
  lines: string[];
  wrong: number;
  right: string;
  why: string;
}

const SPOT_ALGEBRA: Spot = {
  prompt: 'Someone solved this',
  given: '3x + 4 = 19',
  lines: ['3x = 19 + 4', '3x = 23', 'x = 23/3'],
  wrong: 0,
  right: '3x = 19 - 4',
  why: 'The **+ 4** crossed the equals sign but kept its sign. It should arrive as **− 4**. Everything after that line was done correctly — on top of a mistake.',
};

const SPOT_CALC: Spot = {
  prompt: 'Someone differentiated this',
  given: 'd/dx((2x+1)^3)',
  lines: ['3(2x+1)^2', '3(4x^2 + 4x + 1)', '12x^2 + 12x + 3'],
  wrong: 0,
  right: '3(2x+1)^2 * 2',
  why: 'The outside was differentiated, but the **inside (2x + 1)** was forgotten. The chain rule says: multiply by the inside’s derivative, which is **2**.',
};

function Rich({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : <span key={i}>{part}</span>))}</>;
}

/** A screen that shows one idea in motion. */
function Show({ kicker, title, text, tone, children }: { kicker: string; title: ReactNode; text: ReactNode; tone?: string; children: ReactNode }) {
  return (
    <>
      <div className={`ob-stage ${tone ?? ''}`}>{children}</div>
      <span className="ob-kicker">{kicker}</span>
      <h2 className="ob-h">{title}</h2>
      <p className="ob-p">{text}</p>
    </>
  );
}

function Reply({ text, mood = 'happy' }: { text: string; mood?: Mood }) {
  return (
    <div className="ob-reply" key={text}>
      <Lera size={34} mood={mood} interactive={false} />
      <span>{text}</span>
    </div>
  );
}

export function Onboarding() {
  const profile = useStore((s) => s.profile);
  const [step, setStep] = useState<Step>('splash');
  const [dir, setDir] = useState<1 | -1>(1);
  const [subjects, setSubjects] = useState<Subject[]>(profile.subjects?.length ? profile.subjects : ['algebra']);
  const [stage, setStage] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [feel, setFeel] = useState<number | null>(null);
  const [trips, setTrips] = useState<string[]>([]);
  const [mode, setMode] = useState<'line' | 'end'>(profile.checkMode ?? 'line');
  const [daily, setDaily] = useState(profile.dailyXp || 30);
  const [when, setWhen] = useState<string | null>(null);
  const [name, setName] = useState(profile.name);
  const [tapped, setTapped] = useState<number | null>(null);
  const [found, setFound] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [built, setBuilt] = useState(0);
  const [tour, setTour] = useState(true);

  const calc = subjects.includes('calc1') || subjects.includes('calc2');
  // the graph scene is only for people doing calculus
  const all: Step[] = ['hello', 'how', 'subjects', 'stage', 'goal', 'path', 'spot', 'feel', 'struggle', 'return', 'check', 'plain', 'daily', ...(calc ? (['graph'] as Step[]) : []), 'when', 'reward', 'name', 'plan', 'remind', 'upload', 'done'];
  // "Skip the tour" keeps the questions and drops the moving pictures
  const order = tour ? all : all.filter((s) => !['how', 'path', 'return', 'plain', 'graph', 'reward'].includes(s));

  useEffect(() => {
    if (step !== 'splash') return;
    const id = setTimeout(() => setStep('hello'), 1900);
    return () => clearTimeout(id);
  }, [step]);

  useEffect(() => {
    if (step !== 'plan') return;
    setBuilt(0);
    const ids = [1, 2, 3, 4, 5].map((n) => setTimeout(() => setBuilt(n), 520 * n));
    return () => ids.forEach(clearTimeout);
  }, [step]);

  const go = (s: Step, d: 1 | -1 = 1) => {
    haptic(6);
    setDir(d);
    setStep(s);
  };
  const next = () => go(order[Math.min(order.length - 1, order.indexOf(step) + 1)]);
  const backStep = () => {
    if (step === 'upload' && source) return setSource(null);
    const i = order.indexOf(step);
    if (i > 0) go(order[i - 1], -1);
  };
  const finish = () => {
    actions.finishOnboarding();
    resetNav();
  };

  const spot = subjects.includes('algebra') ? SPOT_ALGEBRA : SPOT_CALC;
  const focus = TRIPS.filter((t) => trips.includes(t.id)).map((t) => t.focus as string);
  const goalInfo = GOALS.find((g) => g.xp === daily) ?? GOALS[1];
  const whenInfo = WHEN.find((w) => w.id === when) ?? WHEN[2];
  const at = order.indexOf(step);
  const progress = at <= 0 ? 0 : at / (order.length - 1);

  const savePlan = () => {
    actions.setProfile({
      name: name.trim(),
      subjects,
      stage: STAGE.find((s) => s.id === stage)?.title,
      goal: WHY.find((w) => w.id === why)?.title,
      struggle: TRIPS.filter((t) => trips.includes(t.id)).map((t) => t.title).join('; ') || undefined,
      feel: feel ?? undefined,
      checkMode: mode,
      dailyXp: daily,
      studyTime: when ?? undefined,
      focusMinutes: daily <= 15 ? 5 : daily <= 30 ? 10 : daily <= 50 ? 15 : 20,
    });
  };

  const foot = (label: string, opts: { disabled?: boolean; onClick?: () => void; sheen?: boolean; ok?: boolean; under?: ReactNode } = {}) => (
    <div className="ob-foot">
      <Button3D disabled={opts.disabled} sheen={opts.sheen} variant={opts.ok ? 'ok' : 'primary'} onClick={opts.onClick ?? next}>{label}</Button3D>
      {opts.under}
    </div>
  );

  const pickList = (items: Choice[], value: string | null, set: (id: string) => void) => (
    <div className="ob-list">
      {items.map((c) => (
        <button key={c.id} className={`ob-card ${value === c.id ? 'on' : ''}`} aria-pressed={value === c.id} onClick={() => { haptic(6); set(c.id); }}>
          <span className="ob-emoji">{c.emoji}</span>
          <span className="grow">
            {c.title}
            {c.sub && <span className="sub">{c.sub}</span>}
          </span>
        </button>
      ))}
    </div>
  );

  const cls = `ob-step ${dir < 0 ? 'back' : ''}`;
  // a week of the chosen goal, as bars
  const perDay = Math.max(1, Math.round(daily / 15));

  return (
    <div className="screen ob" data-dir="0">
      {step !== 'splash' && step !== 'hello' && step !== 'done' && (
        <div className="ob-top">
          <button className="iconbtn" onClick={backStep} aria-label="Back"><Icon name="back" /></button>
          <div className="ob-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Set-up progress">
            <i style={{ width: `${Math.max(4, progress * 100)}%` }} />
          </div>
          <span style={{ width: 42 }} />
        </div>
      )}

      {step === 'splash' && (
        <div className="ob-hero full" onClick={() => setStep('hello')}>
          <Orbit />
          <div className="splash-mark"><span className="halo"><Lera size={116} mood="wave" interactive={false} /></span></div>
          <h1 className="wordmark">Lera</h1>
          <p className="splash-tag">Your maths, line by line.</p>
        </div>
      )}

      {step === 'hello' && (
        <div className="ob-welcome" key="hello">
          <div className="ob-hero">
            <Orbit />
            <span className="halo big"><Lera size={132} mood="wave" /></span>
          </div>
          <div className="ob-sheet">
            <h2 className="ob-h">Hi, I’m Lera.</h2>
            <p className="ob-p">A maths tutor that reads <b>your working</b>, not just your answer.</p>
            <div className="ob-points">
              <span><Icon name="check" size={13} stroke={3} /> Line by line</span>
              <span><Icon name="file" size={13} /> From your notes</span>
              <span><Icon name="refresh" size={13} /> Until it sticks</span>
            </div>
            <div className="lang-row" role="radiogroup" aria-label="Language">
              {LANGS.map((l) => (
                <button key={l.id} role="radio" aria-checked={profile.language === l.id} className={profile.language === l.id ? 'on' : ''} onClick={() => actions.setProfile({ language: l.id })}>{l.label}</button>
              ))}
            </div>
            {profile.language !== 'en' && <p className="faint" style={{ fontSize: 12.5, textAlign: 'center' }}>The app is in English for now; your choice is saved for when translations arrive.</p>}
            <div className="center" style={{ marginTop: 4 }}>
              <Button3D sheen onClick={next}>Show me how</Button3D>
              <button className="linkbtn" onClick={() => { setTour(false); go('subjects'); }}>Skip the tour</button>
            </div>
          </div>
        </div>
      )}

      {step === 'how' && (
        <div className={cls} key="how">
          <Show kicker="How I teach · 1 of 5" title={<>I read <em>every line</em> you write.</>} text="Most apps only check the final answer. I follow your working, find the exact line where a rule breaks, and tell you which rule — so one mistake is fixed once, not repeated for a year.">
            <SceneLines />
          </Show>
          {foot('Continue')}
        </div>
      )}

      {step === 'subjects' && (
        <div className={cls} key="subjects">
          <h2 className="ob-q">What are you working on?</h2>
          <p className="ob-hint">Pick everything that fits. You can change it later.</p>
          <div className="ob-list">
            {SUBJECTS.map((s) => {
              const on = subjects.includes(s.id);
              return (
                <button key={s.id} className={`subject-card tone-${s.tone} ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => { haptic(6); setSubjects(on ? subjects.filter((x) => x !== s.id) : [...subjects, s.id]); }}>
                  <span className="subject-sample"><MathView text={s.sample} /></span>
                  <span className="grow" style={{ textAlign: 'left' }}>
                    <b>{s.title}</b>
                    <span className="sub">{s.sub}</span>
                  </span>
                  <span className="tickbox">{on && <Icon name="check" size={15} stroke={3.2} />}</span>
                </button>
              );
            })}
          </div>
          {foot('Continue', { disabled: subjects.length === 0 })}
        </div>
      )}

      {step === 'stage' && (
        <div className={cls} key="stage">
          <h2 className="ob-q">Where are you studying?</h2>
          <p className="ob-hint">So I know what pace to expect.</p>
          {pickList(STAGE, stage, setStage)}
          {stage && <Reply text={STAGE.find((s) => s.id === stage)!.reply as string} />}
          {foot('Continue', { disabled: !stage })}
        </div>
      )}

      {step === 'goal' && (
        <div className={cls} key="goal">
          <h2 className="ob-q">What brings you here?</h2>
          <p className="ob-hint">Choose the one that matters most right now.</p>
          {pickList(WHY, why, setWhy)}
          {why && <Reply text={WHY.find((w) => w.id === why)!.reply as string} />}
          {foot('Continue', { disabled: !why })}
        </div>
      )}

      {step === 'path' && (
        <div className={cls} key="path">
          <Show kicker="How I teach · 2 of 5" title={<>Your notes become <em>your path</em>.</>} text="Upload a PDF or Word file — a page of class notes or a whole textbook. I find its chapters and sections, turn them into short lessons, rebuild its graphs, and pull every exercise into practice.">
            <ScenePath />
          </Show>
          {foot('Continue')}
        </div>
      )}

      {step === 'spot' && (
        <div className={cls} key="spot">
          <h2 className="ob-q">{found ? 'Exactly.' : 'Your turn. One line breaks a rule.'}</h2>
          <p className="ob-hint">{found ? 'That’s what I do for you — I find the line, not just the wrong answer.' : tapped !== null ? 'That line follows from the one above it. Look for where a rule first breaks.' : 'Tap the line where it first goes wrong.'}</p>
          <div className="spot" style={{ marginTop: 8 }}>
            <span className="label">{spot.prompt}</span>
            <div className="spot-given"><MathView text={spot.given} block /></div>
            {spot.lines.map((l, i) => {
              const state = found ? (i === spot.wrong ? 'bad' : 'carried') : tapped === i ? 'nope' : '';
              return (
                <button
                  key={l}
                  className={`spot-line ${state}`}
                  disabled={found}
                  onClick={() => {
                    if (i === spot.wrong) {
                      haptic([10, 40, 16]);
                      setFound(true);
                    } else {
                      haptic([12, 30, 12]);
                      setTapped(i);
                    }
                  }}
                >
                  <span className="n">{i + 1}</span>
                  <span className="grow" style={{ textAlign: 'left' }}><MathView text={l} block /></span>
                  {found && i === spot.wrong && <span className="chip gap">Breaks here</span>}
                  {found && i !== spot.wrong && <span className="chip plain">Carried</span>}
                </button>
              );
            })}
            {found && (
              <div className="spot-why stagger">
                <p><Rich text={spot.why} /></p>
                <div className="fixline" style={{ marginTop: 8 }}>
                  <span className="faint" style={{ fontSize: 12.5 }}>Line 1 should read</span>
                  <MathView text={spot.right} block />
                </div>
              </div>
            )}
          </div>
          {foot(found ? 'Continue' : 'Skip', { ok: found, sheen: found })}
          {found && <Confetti fire={1} />}
        </div>
      )}

      {step === 'feel' && (
        <div className={cls} key="feel">
          <div className="center" style={{ gap: 8, paddingTop: 2 }}>
            <Lera size={124} mood={feel === null ? 'curious' : FEEL[feel].mood} />
          </div>
          <h2 className="ob-q" style={{ textAlign: 'center' }}>How does maths feel right now?</h2>
          <p className="ob-hint" style={{ textAlign: 'center', minHeight: 44 }}>{feel === null ? 'No wrong answers. This sets how gently I start.' : FEEL[feel].line}</p>
          <div className="feel-row" role="radiogroup" aria-label="How maths feels">
            {FEEL.map((f, i) => (
              <button key={f.label} role="radio" aria-checked={feel === i} className={feel === i ? 'on' : ''} onClick={() => { haptic(6); setFeel(i); }}>
                <span className="feel-dot" data-i={i} />
                {f.label}
              </button>
            ))}
          </div>
          {foot('Continue', { disabled: feel === null })}
        </div>
      )}

      {step === 'struggle' && (
        <div className={cls} key="struggle">
          <h2 className="ob-q">What usually trips you up?</h2>
          <p className="ob-hint">Choose up to three — I’ll watch for them.</p>
          <div className="ob-grid2">
            {TRIPS.map((t) => {
              const on = trips.includes(t.id);
              return (
                <button key={t.id} className={`ob-card ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => { haptic(6); setTrips(on ? trips.filter((x) => x !== t.id) : trips.length >= 3 ? [...trips.slice(1), t.id] : [...trips, t.id]); }}>
                  <span className="ob-emoji">{t.emoji}</span>
                  <span>{t.title}</span>
                </button>
              );
            })}
          </div>
          {foot('Continue', { disabled: trips.length === 0 })}
        </div>
      )}

      {step === 'return' && (
        <div className={cls} key="return">
          <Show
            kicker="How I teach · 3 of 5"
            tone="green"
            title={<>Ideas come back <em>before they fade</em>.</>}
            text={trips.includes('forget') ? 'You said you understand things and then forget them. That’s how memory works for everyone. So when I find a gap, I bring that idea back a day later, then three, then seven — each time it holds a little longer.' : 'A gap isn’t fixed by one right answer. When I find one, I bring that idea back a day later, then three, then seven — until it holds without help.'}
          >
            <SceneReturn />
          </Show>
          {foot('Continue')}
        </div>
      )}

      {step === 'check' && (
        <div className={cls} key="check">
          <h2 className="ob-q">When should I check your working?</h2>
          <p className="ob-hint">You can switch any time, even in the middle of a problem.</p>
          <div className="ob-list">
            {(
              [
                ['line', 'As I go', 'Every line gets a tick or a flag the moment you write it. Best for learning a new method.', ['ok', 'ok', 'bad']],
                ['end', 'When I finish', 'Write the whole solution first. Then I mark every line at once — like handing in your work.', ['wait', 'wait', 'wait']],
              ] as ['line' | 'end', string, string, string[]][]
            ).map(([id, title, sub, demo]) => (
              <button key={id} className={`mode-card ${mode === id ? 'on' : ''}`} aria-pressed={mode === id} onClick={() => { haptic(6); setMode(id); }}>
                <span className="mode-demo" data-mode={id}>
                  {demo.map((d, i) => <i key={i} className={d} style={{ animationDelay: `${i * 0.35}s` }} />)}
                </span>
                <span className="grow" style={{ textAlign: 'left' }}>
                  <b>{title}</b>
                  <span className="sub">{sub}</span>
                </span>
                <span className="radio" />
              </button>
            ))}
          </div>
          {foot('Continue')}
        </div>
      )}

      {step === 'plain' && (
        <div className={cls} key="plain">
          <Show kicker="How I teach · 4 of 5" title={<>Explained in <em>plain words</em>.</>} text="No jargon first. Every idea has a version you could tell a friend, and I always ask whether it made sense. If it didn’t, I say it again more simply — and walk you through an example.">
            <ScenePlain />
          </Show>
          {foot('Continue')}
        </div>
      )}

      {step === 'daily' && (
        <div className={cls} key="daily">
          <h2 className="ob-q">How much each day?</h2>
          <p className="ob-hint">Small and regular beats big and rare.</p>
          <div className="ob-list">
            {GOALS.map((g) => (
              <button key={g.xp} className={`ob-card ${daily === g.xp ? 'on' : ''}`} aria-pressed={daily === g.xp} onClick={() => { haptic(6); setDaily(g.xp); }}>
                <span className="grow">
                  {g.label}
                  <span className="sub">{g.sub}</span>
                </span>
                <span className="xp-tag">{g.xp} XP</span>
              </button>
            ))}
          </div>
          <div className="ob-projection" key={daily} aria-hidden="true">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <i key={d} style={{ height: `${Math.min(100, 22 + perDay * 14 + (d % 3) * 6)}%`, animationDelay: `${d * 60}ms` } as CSSProperties} />
            ))}
          </div>
          <p className="ob-projection-cap">That’s about <b>{perDay * 7} problems a week</b> — roughly {perDay * 30} a month, each one checked line by line.</p>
          {foot('Continue')}
        </div>
      )}

      {step === 'graph' && (
        <div className={cls} key="graph">
          <Show kicker="For calculus" title={<>Graphs you can <em>touch</em>.</>} text="When your notes mention a curve, I rebuild it as a live graph. Drag along it to read any point and its slope, and switch on the derivative to see how the two are tied together.">
            <SceneGraph />
          </Show>
          {foot('Continue')}
        </div>
      )}

      {step === 'when' && (
        <div className={cls} key="when">
          <h2 className="ob-q">When do you usually study?</h2>
          <p className="ob-hint">I’ll time reminders for then — never in the middle of the night.</p>
          {pickList(WHEN, when, setWhen)}
          {foot('Continue', { disabled: !when })}
        </div>
      )}

      {step === 'reward' && (
        <div className={cls} key="reward">
          <Show kicker="How I teach · 5 of 5" tone="warm" title={<>Showing up <em>counts</em>.</>} text={`Every solved problem earns XP, and a clean one earns more. Hit ${goalInfo.xp} XP in a day to keep your streak alive, level up, and collect badges for the things that actually matter — like closing a gap.`}>
            <SceneReward />
          </Show>
          {foot('Continue')}
        </div>
      )}

      {step === 'name' && (
        <form
          className={cls}
          key="name"
          onSubmit={(e: { preventDefault(): void }) => {
            e.preventDefault();
            if (!name.trim()) return;
            savePlan();
            go('plan');
          }}
        >
          <div className="center" style={{ paddingTop: 6 }}>
            <Lera size={112} mood={name.trim() ? 'happy' : 'curious'} />
          </div>
          <h2 className="ob-q" style={{ textAlign: 'center' }}>What should I call you?</h2>
          <p className="ob-hint" style={{ textAlign: 'center' }}>Everything stays on this device. No account, no sign-in.</p>
          <input className="field big" placeholder="First name" value={name} maxLength={24} onChange={(e: { target: { value: string } }) => setName(e.target.value)} autoComplete="given-name" aria-label="First name" />
          <div className="ob-foot">
            <Button3D type="submit" disabled={!name.trim()}>Build my plan</Button3D>
          </div>
        </form>
      )}

      {step === 'plan' && (
        <div className={cls} key="plan">
          <div className="center" style={{ gap: 6, paddingTop: 2 }}>
            <Lera size={96} mood={built >= 5 ? 'celebrate' : 'thinking'} interactive={false} />
          </div>
          <h2 className="ob-q" style={{ textAlign: 'center' }}>{built >= 5 ? `Your plan is ready, ${name.trim()}` : 'Building your plan…'}</h2>
          <ul className="plan">
            {[
              ['target', 'What you’ll study', subjects.map((s) => SUBJECTS.find((x) => x.id === s)?.title).join(' · ')],
              ['eye', 'What I’ll watch for', focus.length ? focus.join(', ') : 'where your reasoning breaks'],
              ['check', 'How I’ll check', mode === 'line' ? 'each line, as you write it' : 'the whole solution, when you finish'],
              ['flame', 'Your daily goal', `${goalInfo.xp} XP — ${goalInfo.sub}`],
              ['bell', 'Best time for you', `${whenInfo.title.toLowerCase()}, around ${whenInfo.time}`],
            ].map(([icon, label, value], i) => (
              <li key={label} data-on={built > i ? '' : undefined}>
                <span className="plan-ic"><Icon name={icon} size={18} /></span>
                <div>
                  <span className="label">{label}</span>
                  <b>{value}</b>
                </div>
                <span className="plan-tick"><Icon name="check" size={14} stroke={3.2} /></span>
              </li>
            ))}
          </ul>
          {foot('Continue', { disabled: built < 5, sheen: true })}
          {built >= 5 && <Confetti fire={1} />}
        </div>
      )}

      {step === 'remind' && (
        <div className={cls} key="remind">
          <Show kicker="One last thing" tone="warm" title={<>A nudge at the <em>right moment</em>.</>} text={`A review does the most good on the day an idea is about to fade. Let me tell you when that is — and remind you to keep your streak, around ${whenInfo.time}. No spam, ever.`}>
            <SceneBell time={whenInfo.time} />
          </Show>
          {foot('Allow notifications', {
            sheen: true,
            onClick: async () => {
              const ok = await enableReminders(when ?? undefined, name.trim());
              actions.setProfile({ notifications: ok });
              next();
            },
            under: <button className="linkbtn" onClick={next}>Not now</button>,
          })}
        </div>
      )}

      {step === 'upload' && (
        <div className={cls} key="upload" style={{ justifyContent: 'center' }}>
          {source ? (
            <Processing
              source={source}
              onCancel={() => setSource(null)}
              onDone={(doc) => {
                actions.addDoc(doc);
                go('done');
              }}
            />
          ) : (
            <UploadPicker onPick={setSource} onSkip={() => go('done')} />
          )}
        </div>
      )}

      {step === 'done' && (
        <div className="ob-done" key="done">
          <span className="halo big" style={{ background: 'radial-gradient(circle, var(--tint) 0 62%, transparent 63%)' }}><Lera size={128} mood="celebrate" /></span>
          <h2 className="ob-h">You’re all set{name.trim() ? `, ${name.trim()}` : ''}.</h2>
          <p className="ob-p" style={{ marginTop: 0 }}>Solve one problem today and your streak begins.</p>
          <div style={{ height: 6 }} />
          <Button3D sheen onClick={finish}>Start learning</Button3D>
          <Confetti fire={1} />
        </div>
      )}
    </div>
  );
}

/** Symbols circling the mascot on the welcome screens. */
function Orbit() {
  return (
    <div className="ob-orbit" aria-hidden="true">
      {[
        ['210px', '26s', '∫'],
        ['300px', '38s', 'x²'],
        ['400px', '52s', 'π'],
        ['520px', '70s', '√'],
      ].map(([d, s, g]) => (
        <i key={g} data-g={g} style={{ '--d': d, '--s': s } as CSSProperties} />
      ))}
    </div>
  );
}
