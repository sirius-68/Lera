import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Subject } from '../engine/types';
import { Lera, Mood } from '../mascot/Lera';
import { actions, useStore } from '../store';
import { GOALS } from '../store/game';
import { getAccount } from '../store/auth';
import { resetNav } from '../store/nav';
import { enableReminders } from '../store/remind';
import { Celebration } from '../ui/Celebrate';
import { Button3D, Confetti, haptic, toast, Emph } from '../ui/kit';
import { Icon } from '../ui/icons';
import { Graph } from '../ui/Graph';
import { MathView } from '../ui/math';
import '../styles/onb.css';
import { SceneBell, SceneLines, ScenePath, ScenePlain, SceneReturn, SceneReward } from './onb/Scenes';
import { canPinWidget, hasWidget, pinWidget } from '../store/widget';
import { AuthPanel } from './Auth';
import { SceneWidget, TileArt } from './onb/Art';
import { Processing, Source, UploadPicker } from './Upload';
import { msg, t as tr } from '../i18n';

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
  | 'return' | 'check' | 'plain' | 'daily' | 'graph' | 'when' | 'reward' | 'name' | 'account' | 'signin' | 'plan' | 'remind' | 'widget' | 'upload' | 'done';

const HELLO: Mood[] = ['wave', 'wink', 'writing', 'detective', 'wizard', 'starstruck', 'teacher', 'thumbsup'];

const SUBJECTS: { id: Subject; title: string; sub: string; sample: string; tone: string }[] = [
  { id: 'algebra', title: msg('Algebra'), sub: msg('Equations, brackets, factorising'), sample: '3x + 4 = 19', tone: 'a' },
  { id: 'calc1', title: msg('Calculus 1'), sub: msg('Limits and derivatives'), sample: 'd/dx(x^2 sin(x))', tone: 'b' },
  { id: 'calc2', title: msg('Calculus 2'), sub: msg('Integrals and their techniques'), sample: '∫ x e^x dx', tone: 'c' },
];

interface Choice {
  id: string;
  emoji: string;
  title: string;
  sub?: string;
  focus?: string;
}

const STAGE: Choice[] = [
  { id: 'school', emoji: '🎒', title: msg('At school') },
  { id: 'uni', emoji: '🎓', title: msg('College or university') },
  { id: 'self', emoji: '📚', title: msg('Teaching myself') },
  { id: 'back', emoji: '🔁', title: msg('Coming back after a break') },
];

const WHY: Choice[] = [
  { id: 'exam', emoji: '🎯', title: msg('I have an exam coming') },
  { id: 'grades', emoji: '📈', title: msg('I want better grades') },
  { id: 'understand', emoji: '💡', title: msg('I want it to finally make sense') },
  { id: 'ahead', emoji: '🚀', title: msg('I want to get ahead') },
  { id: 'sharp', emoji: '🧩', title: msg('I just want to stay sharp') },
];

// The places a solution usually goes wrong, in the order they happen: reading the question, setting it up,
// choosing a method, carrying it out, recalling the rule, and checking (after Newman's error analysis).
const TRIPS: Choice[] = [
  { id: 'read', emoji: '🔎', title: msg('Understanding what the question asks'), focus: 'reading the question before solving' },
  { id: 'setup', emoji: '🧱', title: msg('Setting the problem up as an equation'), focus: 'turning the problem into maths' },
  { id: 'method', emoji: '🧭', title: msg('Choosing which rule or method to use'), focus: 'choosing the right method' },
  { id: 'steps', emoji: '➗', title: msg('Signs, fractions and powers along the way'), focus: 'signs, fractions and powers in each line' },
  { id: 'forget', emoji: '🫧', title: msg('Remembering rules and formulas'), focus: 'bringing rules back before they fade' },
  { id: 'find', emoji: '✅', title: msg('Checking my work and finding the mistake'), focus: 'pointing at the exact line that breaks' },
];

const WHEN: (Choice & { time: string })[] = [
  { id: 'morning', emoji: '🌅', title: msg('Morning'), sub: msg('Before the day gets going'), time: '8:00' },
  { id: 'afternoon', emoji: '☀️', title: msg('Afternoon'), sub: msg('Between classes or work'), time: '14:30' },
  { id: 'evening', emoji: '🌆', title: msg('Evening'), sub: msg('When things calm down'), time: '19:00' },
  { id: 'night', emoji: '🌙', title: msg('Late at night'), sub: msg('When it’s finally quiet'), time: '22:00' },
];

const FEEL: { mood: Mood; label: string; short: string }[] = [
  { mood: 'sad', label: msg('Lost'), short: msg('We’ll start where it’s solid.') },
  { mood: 'nervous', label: msg('Shaky'), short: msg('I’ll find the loose rules.') },
  { mood: 'happy', label: msg('Okay'), short: msg('Let’s make it reliable.') },
  { mood: 'cool', label: msg('Confident'), short: msg('Then I’ll be picky.') },
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
  prompt: msg('Someone solved this'),
  given: '3x + 4 = 19',
  lines: ['3x = 19 + 4', '3x = 23', 'x = 23/3'],
  wrong: 0,
  right: '3x = 19 - 4',
  why: msg('The **+ 4** crossed the equals sign but kept its sign. It should arrive as **− 4**. Everything after that line was done correctly, on top of a mistake.'),
};

const SPOT_CALC: Spot = {
  prompt: msg('Someone differentiated this'),
  given: 'd/dx((2x+1)^3)',
  lines: ['3(2x+1)^2', '3(4x^2 + 4x + 1)', '12x^2 + 12x + 3'],
  wrong: 0,
  right: '3(2x+1)^2 * 2',
  why: msg('The outside was differentiated, but the **inside (2x + 1)** was forgotten. The chain rule says: multiply by the inside’s derivative, which is **2**.'),
};

function Rich({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : <span key={i}>{part}</span>))}</>;
}

/** A screen that shows one idea in motion: the picture in the middle, a title, one short line. */
function Show({ title, text, children }: { title: ReactNode; text: ReactNode; children: ReactNode }) {
  return (
    <div className="ob-show">
      <div className="ob-pic">{children}</div>
      <h2 className="ob-h mid">{title}</h2>
      <p className="ob-p mid">{text}</p>
    </div>
  );
}

/** A question, asked by Lera in a speech bubble. Her face changes with what is being asked. */
function Ask({ mood, hint, children }: { mood: Mood; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="ob-ask">
      <Lera size={64} mood={mood} interactive={false} />
      <div className="ob-bubble">
        <h2>{children}</h2>
        {hint && <p>{hint}</p>}
      </div>
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
  const [cheer, setCheer] = useState(false);
  const [helloAt, setHelloAt] = useState(0);

  const calc = subjects.includes('calc1') || subjects.includes('calc2');
  // the graph scene is only for people doing calculus
  const order: Step[] = ['hello', 'how', 'subjects', 'stage', 'goal', 'path', 'spot', 'feel', 'struggle', 'return', 'check', 'plain', 'daily', ...(calc ? (['graph'] as Step[]) : []), 'when', 'reward', 'name', ...(profile.email ? [] : (['account'] as Step[])), 'plan', 'remind', ...(hasWidget() ? (['widget'] as Step[]) : []), 'upload', 'done'];

  useEffect(() => {
    if (step !== 'splash') return;
    const id = setTimeout(() => setStep('hello'), 1900);
    return () => clearTimeout(id);
  }, [step]);

  // on the welcome screen she runs through a few faces
  useEffect(() => {
    if (step !== 'hello') return;
    const id = setInterval(() => setHelloAt((n) => n + 1), 2600);
    return () => clearInterval(id);
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
    if (step === 'signin') return go('hello', -1);
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
            {tr(c.title)}
            {c.sub && <span className="sub">{tr(c.sub)}</span>}
          </span>
        </button>
      ))}
    </div>
  );

  const pickTiles = (items: Choice[], value: string | null, set: (id: string) => void) => (
    <div className="ob-tiles">
      {items.map((c, i) => (
        <button key={c.id} className={`ob-tile ${value === c.id ? 'on' : ''}`} aria-pressed={value === c.id} style={{ '--i': i } as CSSProperties} onClick={() => { haptic(6); set(c.id); }}>
          <span className="ob-art"><TileArt id={c.id} /></span>
          <b>{tr(c.title)}</b>
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
          <button className="iconbtn" onClick={backStep} aria-label={tr('Back')}><Icon name="back" /></button>
          <div className="ob-segs" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={tr('Set-up progress')}>
            {[0, 1, 2].map((i) => (
              <i key={i}><b style={{ width: `${Math.max(0, Math.min(1, progress * 3 - i)) * 100}%` }} /></i>
            ))}
          </div>
          <span style={{ width: 8 }} />
        </div>
      )}

      {step === 'splash' && (
        <div className="ob-hero full" onClick={() => setStep('hello')}>
          <Orbit />
          <div className="splash-mark"><span className="halo"><Lera size={116} mood="wave" interactive={false} /></span></div>
          <h1 className="wordmark">Lera</h1>
          <p className="splash-tag">{tr('Your maths, line by line.')}</p>
        </div>
      )}

      {step === 'hello' && (
        <div className="ob-welcome" key="hello">
          <div className="ob-hero">
            <Orbit />
            <span className="halo big"><Lera size={140} mood={HELLO[helloAt % HELLO.length]} /></span>
          </div>
          <div className="ob-sheet">
            <h2 className="ob-h">{tr('A maths tutor that reads your working')}</h2>
            <p className="ob-p">{tr('Line by line, until it sticks.')}</p>
            <div className="center" style={{ marginTop: 10, gap: 12 }}>
              <Button3D sheen onClick={next}>{tr('Get started')}</Button3D>
              <Button3D variant="secondary" onClick={() => go('signin')}>{tr('I already have a profile')}</Button3D>
            </div>
          </div>
        </div>
      )}

      {step === 'signin' && (
        <div className={cls} key="signin" style={{ justifyContent: 'center' }}>
          {/* someone who signs in already has a profile: they go straight in, and are never walked through the tour again */}
          <AuthPanel
            mode={getAccount() ? 'signin' : 'signup'}
            onDone={() => {
              if (!profile.name && getAccount()?.name) actions.setProfile({ name: getAccount()!.name });
              finish();
            }}
          />
        </div>
      )}

      {step === 'how' && (
        <div className={cls} key="how">
          <Show title={<Emph text={tr('I read *every line* you write.')} />} text={tr('Not just the final answer.')}>
            <SceneLines />
          </Show>
          {foot(tr('Continue'))}
        </div>
      )}

      {step === 'subjects' && (
        <div className={cls} key="subjects">
          <Ask mood={subjects.length > 1 ? 'eureka' : 'curious'}>{tr('What are you working on?')}</Ask>
          <div className="ob-list">
            {SUBJECTS.map((s) => {
              const on = subjects.includes(s.id);
              return (
                <button key={s.id} className={`subject-card tone-${s.tone} ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => { haptic(6); setSubjects(on ? subjects.filter((x) => x !== s.id) : [...subjects, s.id]); }}>
                  <span className="subject-sample"><MathView text={s.sample} /></span>
                  <span className="grow" style={{ textAlign: 'left' }}>
                    <b>{tr(s.title)}</b>
                    <span className="sub">{tr(s.sub)}</span>
                  </span>
                  <span className="tickbox">{on && <Icon name="check" size={15} stroke={3.2} />}</span>
                </button>
              );
            })}
          </div>
          {foot(tr('Continue'), { disabled: subjects.length === 0 })}
        </div>
      )}

      {step === 'stage' && (
        <div className={cls} key="stage">
          <Ask mood={stage === 'uni' || stage === 'school' ? 'graduate' : stage ? 'happy' : 'curious'}>{tr('Where are you studying?')}</Ask>
          {pickTiles(STAGE, stage, setStage)}
          {foot(tr('Continue'), { disabled: !stage })}
        </div>
      )}

      {step === 'goal' && (
        <div className={cls} key="goal">
          <Ask mood={why === 'exam' ? 'determined' : why === 'ahead' ? 'fired' : why === 'understand' ? 'eureka' : why === 'sharp' ? 'cool' : why ? 'happy' : 'curious'}>{tr('What brings you here?')}</Ask>
          {pickList(WHY, why, setWhy)}
          {foot(tr('Continue'), { disabled: !why })}
        </div>
      )}

      {step === 'path' && (
        <div className={cls} key="path">
          <Show title={<Emph text={tr('Your notes become *your path*.')} />} text={tr('Upload a PDF. Get lessons and practice.')}>
            <ScenePath />
          </Show>
          {foot(tr('Continue'))}
        </div>
      )}

      {step === 'spot' && (
        <div className={cls} key="spot">
          <Ask mood={found ? 'eureka' : tapped !== null ? 'thinking' : 'calculating'} hint={found ? undefined : tapped !== null ? tr('Not that one. Look higher.') : 'Tap it.'}>
            {found ? tr('Exactly.') : tr('One line breaks a rule.')}
          </Ask>
          <div className="spot" style={{ marginTop: 8 }}>
            <span className="label">{tr(spot.prompt)}</span>
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
                  {found && i === spot.wrong && <span className="chip gap">{tr('Breaks here')}</span>}
                  {found && i !== spot.wrong && <span className="chip plain">{tr('Carried')}</span>}
                </button>
              );
            })}
            {found && (
              <div className="spot-why stagger">
                <p><Rich text={tr(spot.why)} /></p>
                <div className="fixline" style={{ marginTop: 8 }}>
                  <span className="faint" style={{ fontSize: 12.5 }}>{tr('Line 1 should read')}</span>
                  <MathView text={spot.right} block />
                </div>
              </div>
            )}
          </div>
          {foot(found ? tr('Continue') : tr('Skip'), { ok: found, sheen: found, onClick: found ? () => setCheer(true) : undefined })}
          {found && <Confetti fire={1} />}
          {cheer && (
            <Celebration
              scene={{ kind: 'first', title: tr('You found it!'), sub: tr('That is the whole method: find the line, name the rule, fix it once.'), stats: [{ label: tr('First XP'), value: 10, tone: 'xp' }, { label: tr('Mistake caught'), value: 1, of: 1, tone: 'score' }] }}
              onNext={() => { setCheer(false); next(); }}
            />
          )}
        </div>
      )}

      {step === 'feel' && (
        <div className={cls} key="feel">
          <div className="center" style={{ gap: 8, paddingTop: 2 }}>
            <Lera size={124} mood={feel === null ? 'curious' : FEEL[feel].mood} />
          </div>
          <h2 className="ob-q" style={{ textAlign: 'center' }}>{tr('How does maths feel right now?')}</h2>
          <p className="ob-hint" style={{ textAlign: 'center', minHeight: 22 }}>{feel === null ? tr('No wrong answers.') : tr(FEEL[feel].short)}</p>
          <div className="feel-row" role="radiogroup" aria-label={tr('How maths feels')}>
            {FEEL.map((f, i) => (
              <button key={f.label} role="radio" aria-checked={feel === i} className={feel === i ? 'on' : ''} onClick={() => { haptic(6); setFeel(i); }}>
                <span className="feel-dot" data-i={i} />
                {tr(f.label)}
              </button>
            ))}
          </div>
          {foot(tr('Continue'), { disabled: feel === null })}
        </div>
      )}

      {step === 'struggle' && (
        <div className={cls} key="struggle">
          <Ask mood={trips.length ? 'calculating' : 'thinking'}>{tr('What usually trips you up?')}</Ask>
          <div className="ob-grid2">
            {TRIPS.map((t) => {
              const on = trips.includes(t.id);
              return (
                <button key={t.id} className={`ob-card ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => { haptic(6); setTrips(on ? trips.filter((x) => x !== t.id) : trips.length >= 3 ? [...trips.slice(1), t.id] : [...trips, t.id]); }}>
                  <span className="ob-emoji">{t.emoji}</span>
                  <span>{tr(t.title)}</span>
                </button>
              );
            })}
          </div>
          {foot(tr('Continue'), { disabled: trips.length === 0 })}
        </div>
      )}

      {step === 'return' && (
        <div className={cls} key="return">
          <Show title={<Emph text={tr('Ideas come back *before they fade*.')} />} text={tr('A day later. Then three. Then seven.')}>
            <SceneReturn />
          </Show>
          {foot(tr('Continue'))}
        </div>
      )}

      {step === 'check' && (
        <div className={cls} key="check">
          <Ask mood={mode === 'line' ? 'calculating' : 'thinking'}>{tr('When should I check your working?')}</Ask>
          <div className="ob-list">
            {(
              [
                ['line', tr('As I go'), tr('Every line gets a tick or a flag the moment you write it. Best for learning a new method.'), ['ok', 'ok', 'bad']],
                ['end', tr('When I finish'), tr('Write the whole solution first. Then I mark every line at once, like handing in your work.'), ['wait', 'wait', 'wait']],
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
          {foot(tr('Continue'))}
        </div>
      )}

      {step === 'plain' && (
        <div className={cls} key="plain">
          <Show title={<Emph text={tr('Explained in *plain words*.')} />} text={tr('And I always ask if it made sense.')}>
            <ScenePlain />
          </Show>
          {foot(tr('Continue'))}
        </div>
      )}

      {step === 'daily' && (
        <div className={cls} key="daily">
          <Ask mood={daily >= 50 ? 'fired' : daily >= 30 ? 'determined' : 'happy'}>{tr('How much each day?')}</Ask>
          <div className="ob-list">
            {GOALS.map((g) => (
              <button key={g.xp} className={`ob-card ${daily === g.xp ? 'on' : ''}`} aria-pressed={daily === g.xp} onClick={() => { haptic(6); setDaily(g.xp); }}>
                <span className="grow">
                  {tr(g.label)}
                  <span className="sub">{tr(g.sub)}</span>
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
          <p className="ob-projection-cap"><b>{perDay * 7} problems a week</b>{tr(', each one checked line by line.')}</p>
          {foot(tr('Continue'))}
        </div>
      )}

      {step === 'graph' && (
        <div className={cls} key="graph">
          <Ask mood="detective" hint={tr('Drag along the curve. Tap Slope.')}>{tr('Graphs you can touch.')}</Ask>
          <div data-noswipe><Graph fns={['x^2 - 4']} /></div>
          {foot(tr('Continue'))}
        </div>
      )}

      {step === 'when' && (
        <div className={cls} key="when">
          <Ask mood={when === 'night' ? 'sleepy' : when === 'morning' ? 'happy' : when === 'evening' ? 'cool' : when ? 'idle' : 'curious'}>{tr('When do you usually study?')}</Ask>
          {pickTiles(WHEN, when, setWhen)}
          {foot(tr('Continue'), { disabled: !when })}
        </div>
      )}

      {step === 'reward' && (
        <div className={cls} key="reward">
          <Show title={<Emph text={tr('Showing up *counts*.')} />} text={tr('XP, streaks and levels for real progress.')}>
            <SceneReward />
          </Show>
          {foot(tr('Continue'))}
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
            next();
          }}
        >
          <div className="center" style={{ paddingTop: 6 }}>
            <Lera size={112} mood={name.trim() ? 'love' : 'curious'} />
          </div>
          <h2 className="ob-q" style={{ textAlign: 'center' }}>{tr('What should I call you?')}</h2>
          <input className="field big" placeholder={tr('First name')} value={name} maxLength={24} onChange={(e: { target: { value: string } }) => setName(e.target.value)} autoComplete="given-name" aria-label={tr('First name')} />
          <div className="ob-foot">
            <Button3D type="submit" disabled={!name.trim()}>{tr('Build my plan')}</Button3D>
          </div>
        </form>
      )}

      {step === 'account' && (
        <div className={cls} key="account" style={{ justifyContent: 'center' }}>
          <AuthPanel mode="signup" name={name.trim()} onDone={next} onSkip={next} />
        </div>
      )}

      {step === 'widget' && (
        <div className={cls} key="widget">
          <Show title={<Emph text={tr('I’ll cheer you on from your *home screen*.')} />} text={tr('My mood changes with your streak.')}>
            <SceneWidget />
          </Show>
          {foot(tr('Add widget'), {
            sheen: true,
            onClick: () => {
              if (!(canPinWidget() && pinWidget())) toast(tr('Long-press your home screen, choose Widgets, then Lera.'), 4200);
              next();
            },
            under: <button className="linkbtn" onClick={next}>{tr('Not now')}</button>,
          })}
        </div>
      )}

      {step === 'plan' && (
        <div className={cls} key="plan">
          <span className="ob-kicker mid">{tr('Your learning plan')}</span>
          <h2 className="ob-h mid" style={{ fontSize: 24 }}>{built >= 5 ? tr('Ready, {0}. Here’s how we’ll work.', { 0: name.trim() }) : tr('Putting it together…')}</h2>
          <div className="ob-peek"><Lera size={74} mood={built >= 5 ? 'party' : 'calculating'} interactive={false} /></div>
          <ul className="plan peeked">
            {[
              ['target', tr('Where your lessons come from'), `your own notes · ${subjects.map((s) => SUBJECTS.find((x) => x.id === s)?.title).join(' · ')}`],
              ['eye', tr('What I’ll watch for'), focus.length ? focus.join(', ') : 'where your reasoning breaks'],
              ['check', tr('How I’ll check'), mode === 'line' ? 'each line, as you write it' : 'the whole solution, when you finish'],
              ['flame', tr('Your daily goal'), `${goalInfo.xp} XP, ${tr(goalInfo.sub)}`],
              ['bell', tr('Best time for you'), tr('{0}, around {1}', { 0: tr(whenInfo.title).toLowerCase(), 1: whenInfo.time })],
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
          {foot(tr('Continue'), { disabled: built < 5, sheen: true })}
          {built >= 5 && <Confetti fire={1} />}
        </div>
      )}

      {step === 'remind' && (
        <div className={cls} key="remind">
          <Show title={<Emph text={tr('A nudge at the *right moment*.')} />} text={tr('Around {0}. No spam, ever.', { 0: whenInfo.time })}>
            <SceneBell time={whenInfo.time} />
          </Show>
          {foot(tr('Allow notifications'), {
            sheen: true,
            onClick: async () => {
              const ok = await enableReminders(when ?? undefined, name.trim());
              actions.setProfile({ notifications: ok });
              next();
            },
            under: <button className="linkbtn" onClick={next}>{tr('Not now')}</button>,
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
        <Celebration
          scene={{
            kind: 'done',
            title: `You’re all set${name.trim() ? `, ${name.trim()}` : ''}!`,
            sub: tr('Solve one problem today and your streak begins.'),
            stats: [{ label: tr('XP a day'), value: goalInfo.xp, tone: 'xp' }, { label: tr('Minutes a day'), value: daily <= 15 ? 5 : daily <= 30 ? 10 : daily <= 50 ? 15 : 20, tone: 'time' }],
            cta: tr('Start learning'),
          }}
          onNext={finish}
        />
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
