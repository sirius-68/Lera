import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Lera, Mood } from '../mascot/Lera';
import { Button3D, Confetti, CountUp, haptic } from './kit';
import { Icon } from './icons';
import '../styles/celebrate.css';

/**
 * Celebration scenes.
 *
 * Each is a full-screen moment with one thing happening in it: Lera rising on
 * a light, a flame counting up, a ring closing, a badge bursting open. They
 * are shown one after another when more than one was earned at once.
 */
export type SceneKind = 'done' | 'streak' | 'goal' | 'level' | 'chapter' | 'first';

export interface Scene {
  kind: SceneKind;
  title: string;
  sub?: string;
  /** The number the scene is about: streak days, level, XP. */
  value?: number;
  /** Stat tiles under the title (the 'done' scene). */
  stats?: { label: string; value: number; of?: number; tone?: 'xp' | 'score' | 'time' }[];
  /** Days of this week already practised, Monday first (the 'streak' scene). */
  week?: boolean[];
  cta?: string;
}

const MOOD: Record<SceneKind, Mood> = { done: 'celebrate', streak: 'fired', goal: 'cool', level: 'party', chapter: 'graduate', first: 'eureka' };
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function Stage({ scene }: { scene: Scene }) {
  const { kind } = scene;
  if (kind === 'streak') {
    return (
      <div className="cb-stage cb-streak">
        <div className="cb-rays" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}</div>
        <div className="cb-flame" aria-hidden="true">
          <svg viewBox="0 0 120 150" width="150" height="188">
            <path className="f-out" d="M60 4c26 26 46 46 46 78a46 46 0 0 1-92 0c0-18 8-31 18-41 2 13 8 20 15 23-4-23 3-42 13-60z" />
            <path className="f-in" d="M61 62c13 13 22 22 22 36a22 22 0 0 1-44 0c0-9 4-15 9-20 1 6 4 9 7 11-1-10 2-19 6-27z" />
          </svg>
          <b><CountUp to={scene.value ?? 1} ms={900} /></b>
        </div>
        <div className="cb-lera side"><Lera size={84} mood="fired" interactive={false} /></div>
        {scene.week && (
          <div className="cb-week">
            {scene.week.map((on, i) => (
              <span key={i} className={on ? 'on' : ''} style={{ '--i': i } as CSSProperties}>
                <i>{on && <Icon name="check" size={13} stroke={3.4} />}</i>
                {DAYS[i]}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (kind === 'goal') {
    return (
      <div className="cb-stage cb-goal">
        <svg className="cb-ring" viewBox="0 0 200 200" width="210" height="210" aria-hidden="true">
          <circle cx="100" cy="100" r="84" className="track" />
          <circle cx="100" cy="100" r="84" className="fill" pathLength={100} />
          {Array.from({ length: 10 }, (_, i) => <path key={i} className="tick" d="M100 4v9" style={{ '--i': i } as CSSProperties} />)}
        </svg>
        <div className="cb-lera centre"><Lera size={112} mood="cool" interactive={false} /></div>
        <span className="cb-pill"><Icon name="check" size={14} stroke={3.4} /> {scene.value ?? 0} XP today</span>
      </div>
    );
  }
  if (kind === 'level') {
    return (
      <div className="cb-stage cb-level">
        <div className="cb-burst" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}</div>
        <div className="cb-badge">
          <svg viewBox="0 0 120 132" width="132" height="145" aria-hidden="true">
            <path className="shield" d="M60 4l48 18v40c0 30-20 52-48 66C32 114 12 92 12 62V22z" />
            <path className="shine" d="M26 30l28-10v96C38 104 26 86 26 62z" />
          </svg>
          <b>{scene.value ?? 2}</b>
          <span>LEVEL</span>
        </div>
        <div className="cb-lera side"><Lera size={88} mood="party" interactive={false} /></div>
      </div>
    );
  }
  // done · chapter · first: she rises on a column of light above a glowing plate
  return (
    <div className={`cb-stage cb-rise ${kind}`}>
      <div className="cb-beam" aria-hidden="true" />
      <div className="cb-motes" aria-hidden="true">
        {['x²', '+', 'π', '∫', '=', '√', '÷', '∞'].map((g, i) => <i key={i} style={{ '--i': i } as CSSProperties}>{g}</i>)}
      </div>
      <div className="cb-plate" aria-hidden="true"><i /><i /><i /><span><Icon name="check" size={30} stroke={3.4} /></span></div>
      <div className="cb-lera float"><Lera size={118} mood={MOOD[kind]} interactive={false} /></div>
    </div>
  );
}

export function Celebration({ scene, onNext, children }: { scene: Scene; onNext: () => void; children?: ReactNode }) {
  useEffect(() => {
    haptic(scene.kind === 'level' ? [12, 60, 12, 60, 30] : [10, 50, 24]);
  }, [scene]);
  return (
    <div className={`cb cb-${scene.kind}`} role="dialog" aria-label={scene.title}>
      <Stage scene={scene} />
      <div className="cb-text">
        <h2>{scene.title}</h2>
        {scene.sub && <p>{scene.sub}</p>}
        {scene.stats && (
          <div className="cb-stats">
            {scene.stats.map((s, i) => (
              <div key={s.label} className={`cb-stat ${s.tone ?? ''}`} style={{ '--i': i } as CSSProperties}>
                <b>
                  <CountUp to={s.value} ms={900} />
                  {s.of !== undefined && <em>/{s.of}</em>}
                  {s.tone === 'xp' && <Icon name="sparkle" size={18} />}
                </b>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        )}
        {children}
      </div>
      <div className="cb-foot">
        <Button3D sheen onClick={onNext}>{scene.cta ?? 'Continue'}</Button3D>
      </div>
      <Confetti fire={1} />
    </div>
  );
}

/** Plays scenes one after another, then hands back. */
export function CelebrationFlow({ scenes, onDone }: { scenes: Scene[]; onDone: () => void }) {
  const [at, setAt] = useState(0);
  const scene = scenes[at];
  useEffect(() => {
    if (!scene) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);
  if (!scene) return null;
  return <Celebration key={at} scene={scene} onNext={() => (at + 1 < scenes.length ? setAt(at + 1) : onDone())} />;
}
