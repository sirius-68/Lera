import { useLayoutEffect, useRef, useState } from 'react';
import { Lera, Mood } from '../mascot/Lera';
import { useStore } from '../store';
import { badges, levelOf, longestStreak, monthGrid, totalXp, weekStrip, xpByDay } from '../store/game';
import { dayOf, streak } from '../store/learner';
import { back, go } from '../store/nav';
import { canPinWidget, hasWidget, pinWidget } from '../store/widget';
import { Button3D, CountUp, Ring, haptic, toast } from '../ui/kit';
import { Icon } from '../ui/icons';

const MILESTONES = [3, 7, 14, 30, 50, 100];

/** Streak, daily goal, level and badges — everything that rewards showing up. */
export function StreakScreen() {
  const attempts = useStore((s) => s.attempts);
  const read = useStore((s) => s.read);
  const concepts = useStore((s) => s.concepts);
  const saved = useStore((s) => s.saved);
  const notes = useStore((s) => s.notes);
  const highlights = useStore((s) => s.highlights);
  const profile = useStore((s) => s.profile);
  const game = { attempts, read };
  const today = dayOf();
  const days = streak(attempts);
  const best = Math.max(days, longestStreak(attempts));
  const xpToday = xpByDay(game).get(today) ?? 0;
  const goal = profile.dailyXp || 30;
  const doneToday = attempts.some((a) => a.day === today);
  const xp = totalXp(game);
  const lv = levelOf(xp);
  const week = weekStrip(game);
  const month = monthGrid(game);
  const all = badges({ attempts, read, concepts, saved, notes, highlights });
  const earned = all.filter((b) => b.earned).length;
  const nextMilestone = MILESTONES.find((m) => m > days) ?? days + 50;
  const peak = Math.max(1, ...month.map((d) => d.xp));
  // the header floats above the page: content scrolls underneath it, and it folds down to the week strip
  const hero = useRef<HTMLDivElement | null>(null);
  const [heroH, setHeroH] = useState(360);
  const [compact, setCompact] = useState(false);
  useLayoutEffect(() => {
    if (hero.current && !compact) setHeroH(hero.current.offsetHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, doneToday]);

  return (
    <div className="screen streak-screen" data-dir="1">
      <div className={`streak-hero ${compact ? 'compact' : ''}`} ref={hero}>
        <div className="topbar" style={{ color: '#fff' }}>
          <button className="iconbtn onflame" onClick={back} aria-label="Back"><Icon name="back" /></button>
          <h1 style={{ color: '#fff' }}>Streak</h1>
        </div>
        <div className="streak-main">
          <div className={`flame-wrap ${doneToday ? 'lit' : ''}`}>
            <span className="flame-glow" />
            <Icon name="flame" size={92} fill />
            <b><CountUp to={days} /></b>
          </div>
          <p className="streak-line">{days === 0 ? 'Solve one problem to light it' : `day${days === 1 ? '' : 's'} in a row`}</p>
          <p className="streak-sub">
            {doneToday ? 'Today is done. Come back tomorrow to keep it alive.' : days > 0 ? 'Solve one problem today to keep your streak.' : 'A streak starts with a single problem.'}
          </p>
        </div>
        <div className="week">
          {week.map((d) => (
            <div key={d.day} className={`week-day ${d.active ? 'on' : ''} ${d.today ? 'today' : ''} ${d.future ? 'future' : ''}`}>
              <span>{d.label}</span>
              <i>{d.active ? <Icon name="check" size={14} stroke={3.4} /> : null}</i>
            </div>
          ))}
        </div>
      </div>

      <div className="scroll streak-scroll" onScroll={(e: { currentTarget: HTMLElement }) => setCompact(e.currentTarget.scrollTop > 28)}>
        <div className="stagger" style={{ padding: `${heroH + 18}px 20px 30px`, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!doneToday && (
            <div className="center">
              <Button3D sheen onClick={() => go({ name: 'practice' })}><Icon name="flame" size={18} fill /> {days > 0 ? 'Keep my streak' : 'Start my streak'}</Button3D>
            </div>
          )}

          <section className="card goal-card">
            <Ring value={Math.min(1, xpToday / goal)} size={74} stroke={8} color="var(--flame)">
              <b style={{ fontSize: 17 }}>{Math.min(999, xpToday)}</b>
            </Ring>
            <div className="grow">
              <span className="label">Today’s goal</span>
              <b style={{ display: 'block', fontSize: 17, marginTop: 2 }}>{xpToday >= goal ? 'Goal reached' : `${goal - xpToday} XP to go`}</b>
              <p className="muted" style={{ fontSize: 13.5 }}>{xpToday} of {goal} XP · a clean solve is worth 15+</p>
            </div>
          </section>

          <WidgetCard days={days} />

          <section className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="label">Level {lv.level} · {lv.title}</span>
              <span className="xp-tag"><CountUp to={xp} /> XP</span>
            </div>
            <div className="xpbar" style={{ marginTop: 10 }}><i style={{ width: `${(lv.into / lv.need) * 100}%` }} /></div>
            <p className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>{lv.need - lv.into} XP to level {lv.level + 1}</p>
          </section>

          <div className="row" style={{ gap: 10 }}>
            <div className="stat grow"><b><CountUp to={best} /></b><span>longest streak</span></div>
            <div className="stat grow"><b><CountUp to={new Set(attempts.map((a) => a.day)).size} /></b><span>days practised</span></div>
            <div className="stat grow"><b>{nextMilestone}</b><span>next milestone</span></div>
          </div>

          <section className="card">
            <span className="label">Last five weeks</span>
            <div className="month" role="img" aria-label="Days practised over the last five weeks">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="month-h">{d}</span>)}
              {month.map((d) => (
                <i key={d.day} className={`${d.today ? 'today' : ''} ${d.future ? 'future' : ''}`} data-on={d.active ? '' : undefined} style={d.active ? { opacity: 0.45 + 0.55 * (d.xp / peak) } : undefined} title={`${d.day}: ${d.xp} XP`}>
                  {d.label}
                </i>
              ))}
            </div>
          </section>

          <section>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="label">Badges</span>
              <span className="faint" style={{ fontSize: 13 }}>{earned} of {all.length}</span>
            </div>
            <div className="badges">
              {all.map((b) => (
                <div key={b.id} className={`badge-tile ${b.earned ? `on ${b.tone}` : ''}`}>
                  <span className="badge-ic"><Icon name={b.earned ? b.icon : 'lock'} size={24} fill={b.earned && b.icon === 'flame'} /></span>
                  <b>{b.title}</b>
                  <span>{b.desc}</span>
                  {!b.earned && <div className="bar thin"><i style={{ width: `${(b.have / b.need) * 100}%` }} /></div>}
                </div>
              ))}
            </div>
          </section>

          {attempts.length === 0 && (
            <div className="center" style={{ gap: 8, paddingTop: 4 }}>
              <Lera size={72} mood="curious" />
              <p className="muted" style={{ maxWidth: 270, lineHeight: 1.5 }}>Nothing here yet — your first solved problem lights the flame and earns your first badge.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


/* ───────────── the home-screen widget, shown as it will look through the day ───────────── */

const WIDGETS: { mood: Mood; tone: string; line: string; when: string }[] = [
  { mood: 'happy', tone: 'purple', line: 'Time to practise!', when: 'Morning' },
  { mood: 'determined', tone: 'violet', line: 'Got 3 minutes?', when: 'Afternoon' },
  { mood: 'shocked', tone: 'orange', line: 'Save your streak!', when: 'Evening' },
  { mood: 'sad', tone: 'red', line: 'Last chance tonight!', when: 'Before midnight' },
  { mood: 'fired', tone: 'orange', line: 'Streak safe. 12 XP to goal', when: 'After practice' },
  { mood: 'cool', tone: 'green', line: 'Goal done. See you tomorrow!', when: 'Goal reached' },
  { mood: 'sleepy', tone: 'night', line: 'Dreaming of x²…', when: 'At night' },
];

function WidgetCard({ days }: { days: number }) {
  const inApp = hasWidget();
  const add = () => {
    haptic(6);
    if (!(canPinWidget() && pinWidget())) toast('Long-press your home screen, choose Widgets, then Lera.', 4200);
  };
  return (
    <section className="card wg-card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="label">Home-screen widget</span>
        <span className="chip plain">changes through the day</span>
      </div>
      <div className="wg-row" data-noswipe>
        {WIDGETS.map((w) => (
          <figure key={w.when} className="wg-cell">
            <div className={`wg wg-${w.tone}`}>
              <b><Icon name="flame" size={19} fill /> {Math.max(1, days)}</b>
              <span>{w.line}</span>
              <i><Lera size={64} mood={w.mood} interactive={false} /></i>
            </div>
            <figcaption>{w.when}</figcaption>
          </figure>
        ))}
      </div>
      {inApp ? (
        <Button3D small variant="secondary" onClick={add}><Icon name="plus" size={17} /> Add to home screen</Button3D>
      ) : (
        <p className="faint" style={{ fontSize: 13 }}>In the Android app: long-press your home screen, choose Widgets, then Lera.</p>
      )}
    </section>
  );
}
