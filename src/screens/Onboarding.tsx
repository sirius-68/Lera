import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Subject } from '../engine/types';
import { Lera, Mood } from '../mascot/Lera';
import { actions, useStore } from '../store';
import { GOALS } from '../store/game';
import { resetNav } from '../store/nav';
import { Button3D, Confetti, LeraSays, haptic } from '../ui/kit';
import { Icon } from '../ui/icons';
import { MathView } from '../ui/math';
import { Processing, Source, UploadPicker } from './Upload';

/**
 * First run. Short, and every screen either asks something that changes how
 * the app behaves or lets the learner try the thing the app does.
 */

type Step = 'splash' | 'hello' | 'subjects' | 'goal' | 'spot' | 'feel' | 'struggle' | 'check' | 'daily' | 'name' | 'plan' | 'upload' | 'remind';

const ORDER: Step[] = ['hello', 'subjects', 'goal', 'spot', 'feel', 'struggle', 'check', 'daily', 'name', 'plan', 'upload', 'remind'];
/** Steps that count towards the progress bar. */
const COUNTED: Step[] = ['subjects', 'goal', 'spot', 'feel', 'struggle', 'check', 'daily', 'name'];

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

const WHY: { id: string; emoji: string; title: string; reply: string }[] = [
  { id: 'exam', emoji: '🎯', title: 'I have an exam coming', reply: 'Then we’ll hunt down the marks you’re losing, one rule at a time.' },
  { id: 'grades', emoji: '📈', title: 'I want better grades', reply: 'Grades follow from fewer repeated mistakes. That’s my whole job.' },
  { id: 'understand', emoji: '💡', title: 'I want it to finally make sense', reply: 'Good. I explain the *why*, in plain words, every time.' },
  { id: 'ahead', emoji: '🚀', title: 'I want to get ahead', reply: 'Then I’ll keep raising the level as soon as something holds.' },
  { id: 'sharp', emoji: '🧩', title: 'I just want to stay sharp', reply: 'A few minutes a day is plenty. I’ll bring back what’s fading.' },
];

const TRIPS: { id: string; emoji: string; title: string; focus: string }[] = [
  { id: 'signs', emoji: '➖', title: 'Minus signs and small slips', focus: 'catching sign slips' },
  { id: 'method', emoji: '🧭', title: 'I don’t know which method to use', focus: 'choosing the right method' },
  { id: 'steps', emoji: '⏩', title: 'I skip steps and rush', focus: 'slowing down the last line' },
  { id: 'blank', emoji: '😶', title: 'I go blank when it gets hard', focus: 'small steps and gentle hints' },
  { id: 'find', emoji: '🔍', title: 'I can’t find where I went wrong', focus: 'pointing at the exact line' },
  { id: 'forget', emoji: '🫧', title: 'I understand it, then forget it', focus: 'bringing ideas back before they fade' },
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

function Floaters() {
  return (
    <div className="floaters" aria-hidden="true">
      {['x²', '∫', '√', 'π', 'dy/dx', '=', '∑', 'lim', '±', 'f(x)'].map((g, i) => (
        <span key={g} style={{ '--i': i } as CSSProperties}>
          {g}
        </span>
      ))}
    </div>
  );
}

export function Onboarding() {
  const profile = useStore((s) => s.profile);
  const [step, setStep] = useState<Step>('splash');
  const [subjects, setSubjects] = useState<Subject[]>(profile.subjects?.length ? profile.subjects : ['algebra']);
  const [why, setWhy] = useState<string | null>(null);
  const [feel, setFeel] = useState<number | null>(null);
  const [trips, setTrips] = useState<string[]>([]);
  const [mode, setMode] = useState<'line' | 'end'>(profile.checkMode ?? 'line');
  const [daily, setDaily] = useState(profile.dailyXp || 30);
  const [name, setName] = useState(profile.name);
  const [tapped, setTapped] = useState<number | null>(null);
  const [found, setFound] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [built, setBuilt] = useState(0);

  useEffect(() => {
    if (step !== 'splash') return;
    const id = setTimeout(() => setStep('hello'), 1900);
    return () => clearTimeout(id);
  }, [step]);

  useEffect(() => {
    if (step !== 'plan') return;
    setBuilt(0);
    const ids = [1, 2, 3, 4].map((n) => setTimeout(() => setBuilt(n), 500 * n));
    return () => ids.forEach(clearTimeout);
  }, [step]);

  const go = (s: Step) => {
    haptic(6);
    setStep(s);
  };
  const next = () => go(ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(step) + 1)]);
  const backStep = () => {
    if (step === 'upload' && source) return setSource(null);
    const i = ORDER.indexOf(step);
    if (i > 0) setStep(ORDER[i - 1]);
  };

  const finish = () => {
    actions.finishOnboarding();
    resetNav();
  };

  const spot = subjects.includes('algebra') ? SPOT_ALGEBRA : SPOT_CALC;
  const counted = COUNTED.indexOf(step);
  const focus = TRIPS.filter((t) => trips.includes(t.id)).map((t) => t.focus);
  const goalInfo = GOALS.find((g) => g.xp === daily) ?? GOALS[1];

  const savePlan = () => {
    actions.setProfile({
      name: name.trim(),
      subjects,
      goal: WHY.find((w) => w.id === why)?.title,
      struggle: TRIPS.filter((t) => trips.includes(t.id)).map((t) => t.title).join('; ') || undefined,
      feel: feel ?? undefined,
      checkMode: mode,
      dailyXp: daily,
      focusMinutes: daily <= 15 ? 5 : daily <= 30 ? 10 : daily <= 50 ? 15 : 20,
    });
  };

  return (
    <div className="screen onb2" data-dir="0">
      {step !== 'splash' && step !== 'hello' && (
        <div className="onb2-top">
          <button className="iconbtn" onClick={backStep} aria-label="Back">
            <Icon name="back" />
          </button>
          {counted >= 0 && (
            <div className="onb2-progress" role="progressbar" aria-valuemin={0} aria-valuemax={COUNTED.length} aria-valuenow={counted + 1} aria-label="Set-up progress">
              <i style={{ width: `${((counted + 1) / COUNTED.length) * 100}%` }} />
            </div>
          )}
          <span style={{ width: 42 }} />
        </div>
      )}

      {step === 'splash' && (
        <div className="onb2-hero full" onClick={() => setStep('hello')}>
          <Floaters />
          <div className="splash-mark">
            <span className="halo"><Lera size={116} mood="wave" interactive={false} /></span>
          </div>
          <h1 className="wordmark">Lera</h1>
          <p className="splash-tag">Your maths, line by line.</p>
        </div>
      )}

      {step === 'hello' && (
        <div className="onb2-body" key="hello">
          <div className="onb2-hero">
            <Floaters />
            <span className="halo big"><Lera size={132} mood="wave" /></span>
          </div>
          <div className="onb2-sheet stagger">
            <h2 className="onb2-h">Hi, I’m Lera.</h2>
            <p className="onb2-p">I read your working <b>line by line</b>, find the exact place it goes wrong, and bring that idea back until it sticks.</p>
            <div className="lang-row" role="radiogroup" aria-label="Language">
              {LANGS.map((l) => (
                <button key={l.id} role="radio" aria-checked={profile.language === l.id} className={profile.language === l.id ? 'on' : ''} onClick={() => actions.setProfile({ language: l.id })}>
                  {l.label}
                </button>
              ))}
            </div>
            {profile.language !== 'en' && <p className="faint" style={{ fontSize: 12.5, textAlign: 'center' }}>The app is in English for now; your choice is saved for when translations arrive.</p>}
            <div className="center" style={{ marginTop: 6 }}>
              <Button3D sheen onClick={next}>Let’s go</Button3D>
            </div>
          </div>
        </div>
      )}

      {step === 'subjects' && (
        <div className="onb2-q stagger" key="subjects">
          <LeraSays size={52} mood="curious" text="What are you working on? Pick everything that fits." />
          <div className="col" style={{ gap: 12 }}>
            {SUBJECTS.map((s) => {
              const on = subjects.includes(s.id);
              return (
                <button
                  key={s.id}
                  className={`subject-card tone-${s.tone} ${on ? 'on' : ''}`}
                  aria-pressed={on}
                  onClick={() => {
                    haptic(6);
                    setSubjects(on ? subjects.filter((x) => x !== s.id) : [...subjects, s.id]);
                  }}
                >
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
          <div className="onb2-foot">
            <Button3D disabled={subjects.length === 0} onClick={next}>Continue</Button3D>
          </div>
        </div>
      )}

      {step === 'goal' && (
        <div className="onb2-q stagger" key="goal">
          <LeraSays key={why ?? 'q'} size={52} mood={why ? 'happy' : 'idle'} text={why ? WHY.find((w) => w.id === why)!.reply : 'What brings you here?'} />
          <div className="col" style={{ gap: 10 }}>
            {WHY.map((w) => (
              <button key={w.id} className={`pick ${why === w.id ? 'on' : ''}`} onClick={() => { haptic(6); setWhy(w.id); }}>
                <span className="pick-emoji">{w.emoji}</span>
                <span className="grow" style={{ textAlign: 'left' }}>{w.title}</span>
              </button>
            ))}
          </div>
          <div className="onb2-foot">
            <Button3D disabled={!why} onClick={next}>Continue</Button3D>
          </div>
        </div>
      )}

      {step === 'spot' && (
        <div className="onb2-q" key="spot">
          <LeraSays
            key={found ? 'f' : tapped !== null ? `t${tapped}` : 'q'}
            size={52}
            mood={found ? 'celebrate' : tapped !== null ? 'thinking' : 'curious'}
            text={found ? 'Exactly. That’s what I do for you — I find the **line**, not just the wrong answer.' : tapped !== null ? 'That line follows from the one above it. Look for where a rule *first* breaks.' : 'Quick game. One line here breaks a rule. **Tap it.**'}
          />
          <div className="spot">
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
                <p><RichLine text={spot.why} /></p>
                <div className="fixline" style={{ marginTop: 8 }}>
                  <span className="faint" style={{ fontSize: 12.5 }}>Line 1 should read</span>
                  <MathView text={spot.right} block />
                </div>
              </div>
            )}
          </div>
          <div className="onb2-foot">
            <Button3D variant={found ? 'ok' : 'primary'} sheen={found} onClick={next}>{found ? 'Continue' : 'Skip'}</Button3D>
          </div>
          {found && <Confetti fire={1} />}
        </div>
      )}

      {step === 'feel' && (
        <div className="onb2-q" key="feel">
          <div className="center" style={{ gap: 10, paddingTop: 6 }}>
            <Lera size={128} mood={feel === null ? 'curious' : FEEL[feel].mood} />
            <h2 className="onb2-h" style={{ fontSize: 24 }}>How does maths feel right now?</h2>
            <p className="onb2-p" style={{ minHeight: 44, textAlign: 'center' }}>{feel === null ? 'No wrong answers. This sets how gently I start.' : FEEL[feel].line}</p>
          </div>
          <div className="feel-row" role="radiogroup" aria-label="How maths feels">
            {FEEL.map((f, i) => (
              <button key={f.label} role="radio" aria-checked={feel === i} className={feel === i ? 'on' : ''} onClick={() => { haptic(6); setFeel(i); }}>
                <span className="feel-dot" data-i={i} />
                {f.label}
              </button>
            ))}
          </div>
          <div className="onb2-foot">
            <Button3D disabled={feel === null} onClick={next}>Continue</Button3D>
          </div>
        </div>
      )}

      {step === 'struggle' && (
        <div className="onb2-q stagger" key="struggle">
          <LeraSays size={52} mood="idle" text="What usually trips you up? Choose up to three — I’ll watch for them." />
          <div className="trip-grid">
            {TRIPS.map((t) => {
              const on = trips.includes(t.id);
              return (
                <button
                  key={t.id}
                  className={`trip ${on ? 'on' : ''}`}
                  aria-pressed={on}
                  onClick={() => {
                    haptic(6);
                    setTrips(on ? trips.filter((x) => x !== t.id) : trips.length >= 3 ? [...trips.slice(1), t.id] : [...trips, t.id]);
                  }}
                >
                  <span className="pick-emoji">{t.emoji}</span>
                  <span>{t.title}</span>
                </button>
              );
            })}
          </div>
          <div className="onb2-foot">
            <Button3D disabled={trips.length === 0} onClick={next}>Continue</Button3D>
          </div>
        </div>
      )}

      {step === 'check' && (
        <div className="onb2-q stagger" key="check">
          <LeraSays size={52} mood="curious" text="When should I check your working? You can change this any time in Settings." />
          <div className="col" style={{ gap: 12 }}>
            {(
              [
                ['line', 'As I go', 'Every line gets a tick or a flag the moment you write it. Best for learning a new method.', ['ok', 'ok', 'bad']],
                ['end', 'When I finish', 'Write the whole solution first. Then I mark every line at once — like handing in your work.', ['wait', 'wait', 'wait']],
              ] as [('line' | 'end'), string, string, string[]][]
            ).map(([id, title, sub, demo]) => (
              <button key={id} className={`mode-card ${mode === id ? 'on' : ''}`} aria-pressed={mode === id} onClick={() => { haptic(6); setMode(id); }}>
                <span className="mode-demo" data-mode={id}>
                  {demo.map((d, i) => (
                    <i key={i} className={d} style={{ animationDelay: `${i * 0.35}s` }} />
                  ))}
                </span>
                <span className="grow" style={{ textAlign: 'left' }}>
                  <b>{title}</b>
                  <span className="sub">{sub}</span>
                </span>
                <span className="radio" />
              </button>
            ))}
          </div>
          <div className="onb2-foot">
            <Button3D onClick={next}>Continue</Button3D>
          </div>
        </div>
      )}

      {step === 'daily' && (
        <div className="onb2-q stagger" key="daily">
          <LeraSays size={52} mood="happy" text="Pick a daily goal. Small and regular beats big and rare." />
          <div className="col" style={{ gap: 10 }}>
            {GOALS.map((g) => (
              <button key={g.xp} className={`pick goal ${daily === g.xp ? 'on' : ''}`} onClick={() => { haptic(6); setDaily(g.xp); }}>
                <span className="grow" style={{ textAlign: 'left' }}>
                  <b>{g.label}</b>
                  <span className="sub">{g.sub}</span>
                </span>
                <span className="xp-tag">{g.xp} XP</span>
              </button>
            ))}
          </div>
          <div className="onb2-foot">
            <Button3D onClick={next}>Continue</Button3D>
          </div>
        </div>
      )}

      {step === 'name' && (
        <form
          className="onb2-q"
          key="name"
          onSubmit={(e: { preventDefault(): void }) => {
            e.preventDefault();
            if (!name.trim()) return;
            savePlan();
            go('plan');
          }}
        >
          <div className="center" style={{ gap: 12, paddingTop: 10 }}>
            <Lera size={110} mood={name.trim() ? 'happy' : 'curious'} />
            <h2 className="onb2-h" style={{ fontSize: 24 }}>What should I call you?</h2>
            <p className="onb2-p" style={{ textAlign: 'center' }}>Everything stays on this device. No account, no sign-in.</p>
          </div>
          <input className="field big" placeholder="First name" value={name} maxLength={24} onChange={(e: { target: { value: string } }) => setName(e.target.value)} autoComplete="given-name" aria-label="First name" />
          <div className="onb2-foot">
            <Button3D type="submit" disabled={!name.trim()}>Build my plan</Button3D>
          </div>
        </form>
      )}

      {step === 'plan' && (
        <div className="onb2-q" key="plan">
          <div className="center" style={{ gap: 8, paddingTop: 4 }}>
            <Lera size={104} mood={built >= 4 ? 'celebrate' : 'thinking'} interactive={false} />
            <h2 className="onb2-h" style={{ fontSize: 24 }}>{built >= 4 ? `Your plan is ready, ${name.trim()}` : 'Building your plan…'}</h2>
          </div>
          <ul className="plan">
            {[
              ['target', 'What you’ll study', subjects.map((s) => SUBJECTS.find((x) => x.id === s)?.title).join(' · ')],
              ['eye', 'What I’ll watch for', focus.length ? focus.join(', ') : 'where your reasoning breaks'],
              ['check', 'How I’ll check', mode === 'line' ? 'each line, as you write it' : 'the whole solution, when you finish'],
              ['flame', 'Your daily goal', `${goalInfo.xp} XP — ${goalInfo.sub}`],
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
          <div className="onb2-foot">
            <Button3D sheen disabled={built < 4} onClick={next}>Continue</Button3D>
          </div>
          {built >= 4 && <Confetti fire={1} />}
        </div>
      )}

      {step === 'upload' && (
        <div className="onb2-q" key="upload" style={{ justifyContent: 'center' }}>
          {source ? (
            <Processing
              source={source}
              onCancel={() => setSource(null)}
              onDone={(doc) => {
                actions.addDoc(doc);
                go('remind');
              }}
            />
          ) : (
            <UploadPicker onPick={setSource} onSkip={() => go('remind')} />
          )}
        </div>
      )}

      {step === 'remind' && (
        <div className="onb2-q" key="remind" style={{ justifyContent: 'center' }}>
          <div className="center stagger" style={{ gap: 14 }}>
            <div className="streak-preview">
              <span className="flame-big"><Icon name="flame" size={56} fill /></span>
              <b>1</b>
            </div>
            <h2 className="onb2-h" style={{ fontSize: 25 }}>Start your streak today</h2>
            <p className="onb2-p" style={{ textAlign: 'center', maxWidth: 300 }}>A streak is days in a row with at least one problem solved. I can remind you when an idea is due to come back — that’s when reviewing it does the most good.</p>
            <Button3D
              sheen
              onClick={async () => {
                let ok = false;
                try {
                  ok = typeof Notification !== 'undefined' && (await Notification.requestPermission()) === 'granted';
                } catch {
                  ok = false;
                }
                actions.setProfile({ notifications: ok });
                finish();
              }}
            >
              <Icon name="bell" size={19} /> Remind me
            </Button3D>
            <button className="linkbtn" onClick={finish}>
              Not now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** **bold** only — enough for the short lines on these screens. */
function RichLine({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : <span key={i}>{part}</span>))}
    </>
  );
}
