import { useEffect, useState } from 'react';
import authImg from '../assets/illustrations/auth.jpg';
import docsImg from '../assets/illustrations/docs.png';
import insightsImg from '../assets/illustrations/insights.png';
import learningImg from '../assets/illustrations/learning.png';
import mathImg from '../assets/illustrations/math.png';
import bellImg from '../assets/illustrations/notifications.jpg';
import { Lera } from '../mascot/Lera';
import { actions, useStore } from '../store';
import { resetNav } from '../store/nav';
import { Bar, Button3D, Dots, LeraSays, haptic } from '../ui/kit';
import { Icon } from '../ui/icons';
import { Processing, Source, UploadPicker } from './Upload';

const SLIDES = [
  { image: mathImg, title: 'Learn through\nreasoning.', sub: 'An adaptive tutor that refines your\nthinking step by step.' },
  { image: docsImg, title: 'Learn from your\nown material.', sub: 'Upload your notes or PDF and Lera turns them\ninto interactive practice tailored to you.' },
  { image: insightsImg, title: 'Understand your\nmistakes.', sub: 'Lera analyses your reasoning, finds the patterns\nand shows exactly where your logic breaks down.' },
  { image: learningImg, title: 'Your learning\nevolves.', sub: 'Practice adapts to your goals, performance and\nprogress so you master concepts,\nnot just questions.' },
];

const QUIZ: { key: 'goal' | 'struggle' | 'explainStyle' | 'frequency' | 'focus'; q: string; options: string[] }[] = [
  { key: 'goal', q: 'What’s your main goal?', options: ['Improve my grades', 'Prepare for an exam', 'Understand maths better', 'Build lasting mastery', 'Practice more'] },
  {
    key: 'struggle',
    q: 'What usually goes wrong?',
    options: ['I use the wrong method', 'I make calculation errors', 'I rush or skip steps', 'I struggle with word problems', 'I lose confidence when it gets harder', 'I don’t see my mistake'],
  },
  { key: 'explainStyle', q: 'How do you prefer Lera to explain solutions?', options: ['Step-by-step breakdowns', 'Short summaries', 'Challenge me before explaining', 'Mix of all'] },
  { key: 'frequency', q: 'How often do you practise maths?', options: ['Rarely', 'Once a week', '2 – 3 times a week', 'Almost daily', 'Daily', 'Never studied'] },
  { key: 'focus', q: 'How long can you focus per session?', options: ['5 minutes', '10 minutes', '20 minutes', '30 minutes', '40 minutes', '60+ minutes'] },
];

const REPLY: Record<string, string> = {
  'I use the wrong method': 'Then I’ll watch which method you reach for, not just the answer.',
  'I make calculation errors': 'Good to know — I’ll tell slips apart from real gaps.',
  'I rush or skip steps': 'I’ll notice where your slips cluster. It’s usually one line.',
  'I struggle with word problems': 'We’ll build up from the algebra underneath them.',
  'I lose confidence when it gets harder': 'We’ll climb in small steps. No red crosses here.',
  'I don’t see my mistake': 'That’s exactly what I’m for. I’ll point at the line.',
};

type Step = 'splash' | 'language' | 'slides' | 'welcome' | 'quiz' | 'notifications' | 'account' | 'upload' | 'paywall';

const LANGS = [
  { id: 'en', label: 'English', flag: '🇬🇧' },
  { id: 'ru', label: 'Русский', flag: '🇷🇺' },
  { id: 'fr', label: 'Français', flag: '🇫🇷' },
];

export function Onboarding() {
  const profile = useStore((s) => s.profile);
  const [step, setStep] = useState<Step>('splash');
  const [slide, setSlide] = useState(0);
  const [welcome, setWelcome] = useState(0);
  const [q, setQ] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [plan, setPlan] = useState<'year' | 'month'>('year');
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [age, setAge] = useState(profile.age ? String(profile.age) : '');

  useEffect(() => {
    if (step !== 'splash') return;
    const id = setTimeout(() => setStep('language'), 2100);
    return () => clearTimeout(id);
  }, [step]);

  const finish = () => {
    actions.finishOnboarding();
    resetNav();
  };

  const answer = (opt: string) => {
    if (picked) return;
    haptic(8);
    setPicked(opt);
    const key = QUIZ[q].key;
    if (key === 'focus') actions.setProfile({ focusMinutes: parseInt(opt, 10) || 10 });
    else actions.setProfile({ [key]: opt });
    setTimeout(
      () => {
        setPicked(null);
        if (q < QUIZ.length - 1) setQ(q + 1);
        else setStep('notifications');
      },
      key === 'struggle' ? 1500 : 480,
    );
  };

  const backStep = () => {
    if (step === 'quiz' && q > 0) return setQ(q - 1);
    const order: Step[] = ['language', 'slides', 'welcome', 'quiz', 'notifications', 'account', 'upload', 'paywall'];
    const i = order.indexOf(step);
    if (step === 'slides' && slide > 0) return setSlide(slide - 1);
    if (step === 'upload' && source) return setSource(null);
    if (i > 0) setStep(order[i - 1]);
  };

  const showBack = !['splash', 'language'].includes(step);

  return (
    <div className="screen onb" data-dir="0">
      {showBack && (
        <div className="topbar" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 }}>
          <button className="iconbtn" onClick={backStep} aria-label="Back">
            <Icon name="back" />
          </button>
          {step === 'quiz' && (
            <div className="grow" style={{ paddingRight: 50 }}>
              <Bar value={(q + (picked ? 1 : 0.15)) / QUIZ.length} label="Questions answered" />
            </div>
          )}
        </div>
      )}

      {step === 'splash' && (
        <div className="onb-body center" style={{ justifyContent: 'center', background: 'var(--brand)', color: '#fff' }} onClick={() => setStep('language')}>
          <div className="splash-mark">
            <Lera size={120} mood="wave" interactive={false} />
          </div>
          <h1 className="wordmark">Lera</h1>
          <p className="splash-tag">Learning Enhanced by Recursive Analysis</p>
        </div>
      )}

      {step === 'language' && (
        <div className="onb-body center stagger" key="lang" style={{ justifyContent: 'center', gap: 14 }}>
          <Lera size={88} mood="curious" />
          <h2 className="onb-h">Choose your language</h2>
          <p className="muted">You can change this later in Settings.</p>
          <div className="col" style={{ gap: 10, alignSelf: 'stretch', padding: '8px 28px' }}>
            {LANGS.map((l) => (
              <button key={l.id} className={`option ${profile.language === l.id ? 'on' : ''}`} onClick={() => actions.setProfile({ language: l.id })}>
                <span style={{ fontSize: 22 }}>{l.flag}</span>
                <span className="grow" style={{ textAlign: 'left' }}>{l.label}</span>
                <span className="radio" />
              </button>
            ))}
          </div>
          {profile.language !== 'en' && <p className="faint" style={{ fontSize: 13, maxWidth: 290 }}>The interface is English-only in this version; your choice is saved for when translations arrive.</p>}
          <Button3D onClick={() => setStep('slides')}>Continue</Button3D>
        </div>
      )}

      {step === 'slides' && (
        <div className="onb-body center" style={{ justifyContent: 'space-between', paddingTop: 70 }}>
          <div key={slide} className="center stagger" style={{ flex: 1, justifyContent: 'center', gap: 6 }}>
            <img src={SLIDES[slide].image} alt="" className="slide-img" />
            <h2 className="onb-h" style={{ whiteSpace: 'pre-line', marginTop: 18 }}>{SLIDES[slide].title}</h2>
            <p className="muted" style={{ whiteSpace: 'pre-line', fontSize: 15, lineHeight: 1.5, marginTop: 6 }}>{SLIDES[slide].sub}</p>
          </div>
          <div className="center" style={{ gap: 6, alignSelf: 'stretch', paddingBottom: 26 }}>
            <Dots count={SLIDES.length} active={slide} />
            <Button3D onClick={() => (slide < SLIDES.length - 1 ? setSlide(slide + 1) : setStep('welcome'))}>{slide < SLIDES.length - 1 ? 'Next' : 'Get started'}</Button3D>
            <button className="linkbtn" style={{ visibility: slide < SLIDES.length - 1 ? 'visible' : 'hidden' }} onClick={() => setStep('welcome')}>
              Skip
            </button>
          </div>
        </div>
      )}

      {step === 'welcome' && (
        <div className="onb-body center" style={{ justifyContent: 'space-between', paddingTop: 90 }}>
          <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
            <LeraSays
              stack
              size={132}
              mood={welcome === 0 ? 'wave' : 'happy'}
              text={welcome === 0 ? 'Hi, my name is **Lera**! Tap me — I don’t bite.' : 'Let’s build your personalised learning path. Five quick questions.'}
            />
          </div>
          <div className="center" style={{ alignSelf: 'stretch', paddingBottom: 34 }}>
            <Button3D sheen onClick={() => (welcome === 0 ? setWelcome(1) : setStep('quiz'))}>Continue</Button3D>
          </div>
        </div>
      )}

      {step === 'quiz' && (
        <div className="onb-body" style={{ paddingTop: 76 }}>
          <div style={{ padding: '0 22px 14px' }}>
            <LeraSays key={q + (picked && REPLY[picked] ? picked : '')} size={46} mood={picked ? 'happy' : 'idle'} text={picked && REPLY[picked] ? REPLY[picked] : QUIZ[q].q} />
          </div>
          <div key={q} className="col stagger" style={{ gap: 10, padding: '4px 22px 24px' }}>
            {QUIZ[q].options.map((o) => (
              <button key={o} className={`option ${picked === o ? 'on picked' : ''}`} onClick={() => answer(o)}>
                <span className="grow" style={{ textAlign: 'left' }}>{o}</span>
                <span className="radio" />
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'notifications' && (
        <div className="onb-body center stagger" style={{ justifyContent: 'center', gap: 12, padding: '0 28px' }}>
          <img src={bellImg} alt="" style={{ width: 200, height: 200, objectFit: 'contain', mixBlendMode: 'multiply' }} />
          <h2 className="onb-h">Stay on your streak</h2>
          <p className="muted" style={{ lineHeight: 1.5, maxWidth: 300 }}>Lera can remind you when a topic is due to come back — that’s when reviewing it does the most good.</p>
          <Button3D
            onClick={async () => {
              let ok = false;
              try {
                ok = typeof Notification !== 'undefined' && (await Notification.requestPermission()) === 'granted';
              } catch {
                ok = false;
              }
              actions.setProfile({ notifications: ok });
              setStep('account');
            }}
          >
            <Icon name="bell" size={19} /> Allow reminders
          </Button3D>
          <button className="linkbtn" onClick={() => setStep('account')}>
            Not now
          </button>
        </div>
      )}

      {step === 'account' && (
        <form
          className="onb-body center stagger"
          style={{ justifyContent: 'center', gap: 12, padding: '0 28px' }}
          onSubmit={(e: { preventDefault(): void }) => {
            e.preventDefault();
            const n = Number(age);
            actions.setProfile({ name: name.trim(), email: email.trim(), age: n >= 5 && n <= 120 ? n : undefined });
            setStep('upload');
          }}
        >
          <img src={authImg} alt="" style={{ width: 150, height: 150, objectFit: 'contain', mixBlendMode: 'multiply' }} />
          <h2 className="onb-h">Create your profile</h2>
          <p className="muted" style={{ fontSize: 14.5, maxWidth: 300 }}>Kept on this device only — this build has no server and no sign-in.</p>
          <input className="field" placeholder="First name" value={name} onChange={(e: { target: { value: string } }) => setName(e.target.value)} autoComplete="given-name" aria-label="First name" />
          <input className="field" placeholder="Email (optional)" type="email" value={email} onChange={(e: { target: { value: string } }) => setEmail(e.target.value)} autoComplete="email" aria-label="Email, optional" />
          <input className="field" placeholder="Age (optional)" inputMode="numeric" value={age} onChange={(e: { target: { value: string } }) => setAge(e.target.value.replace(/\D/g, '').slice(0, 3))} aria-label="Age, optional" />
          <Button3D type="submit" disabled={!name.trim()}>
            Continue
          </Button3D>
        </form>
      )}

      {step === 'upload' && (
        <div className="onb-body" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: 60, paddingBottom: 20 }}>
          {source ? (
            <Processing
              source={source}
              onCancel={() => setSource(null)}
              onDone={(doc) => {
                actions.addDoc(doc);
                setStep('paywall');
              }}
            />
          ) : (
            <UploadPicker onPick={setSource} onSkip={() => setStep('paywall')} />
          )}
        </div>
      )}

      {step === 'paywall' && (
        <div className="onb-body" style={{ paddingTop: 64, display: 'flex', flexDirection: 'column' }}>
          <div className="stagger" style={{ padding: '0 22px', flex: 1 }}>
            <h2 className="onb-h" style={{ textAlign: 'left' }}>Try Lera free for 7 days</h2>
            <ul className="perks">
              {[
                ['Unlimited uploads', 'Learn without limits'],
                ['Adaptive learning', 'Your practice evolves with your performance'],
                ['Full analysis', 'Error diagnostics and reasoning insights'],
                ['Recursive reinforcement', 'Weak areas come back until they hold'],
              ].map(([t, d]) => (
                <li key={t}>
                  <span className="tick on"><Icon name="check" size={14} stroke={3} /></span>
                  <div>
                    <b>{t}</b>
                    <p className="muted">{d}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="col" style={{ gap: 10, marginTop: 6 }}>
              <button className={`option plan ${plan === 'year' ? 'on' : ''}`} onClick={() => setPlan('year')}>
                <div className="grow" style={{ textAlign: 'left' }}>
                  <b>Yearly</b>
                  <p className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>4,200₽ · 350₽ per month, billed yearly</p>
                </div>
                <span className="radio" />
              </button>
              <button className={`option plan ${plan === 'month' ? 'on' : ''}`} onClick={() => setPlan('month')}>
                <div className="grow" style={{ textAlign: 'left' }}>
                  <b>Monthly</b>
                  <p className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>9,99₽ per month, billed monthly</p>
                </div>
                <span className="radio" />
              </button>
            </div>
            <p className="faint" style={{ fontSize: 12.5, marginTop: 12, lineHeight: 1.45 }}>
              Demo build: no payment is taken and nothing is charged. This screen shows how the trial offer will look.
            </p>
          </div>
          <div className="center" style={{ padding: '12px 22px 22px', gap: 2 }}>
            <Button3D
              sheen
              onClick={() => {
                actions.setProfile({ plan: 'trial', trialStarted: new Date().toISOString() });
                finish();
              }}
            >
              Start my free trial
            </Button3D>
            <button className="linkbtn" onClick={finish}>
              Maybe later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
