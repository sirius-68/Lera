import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Lera, Mood } from '../mascot/Lera';
import { useStore } from '../store';
import { badges, levelOf, longestStreak, monthGrid, totalXp, weekStrip, xpByDay } from '../store/game';
import { dayOf, streak } from '../store/learner';
import { back, go } from '../store/nav';
import { canPinWidget, hasWidget, pinWidget } from '../store/widget';
import { Button3D, CountUp, Ring, haptic, toast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { msg, t } from '../i18n';

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
  const main = useRef<HTMLDivElement | null>(null);
  const [heroH, setHeroH] = useState(360);
  // how far the header can fold: the height of the flame and the two lines under it
  const fold = useRef(200);
  useLayoutEffect(() => {
    if (hero.current) setHeroH(hero.current.offsetHeight);
    if (main.current) fold.current = main.current.offsetHeight;
  }, [days, doneToday]);
  // The fold follows the finger: every scrolled pixel moves the header by the same amount, until only the week is left.
  // Only transforms and opacity change, so the page is never laid out again while scrolling.
  const frame = useRef(0);
  const onScroll = (e: { currentTarget: HTMLElement }) => {
    const top = e.currentTarget.scrollTop;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const p = Math.max(0, Math.min(1, top / fold.current));
      hero.current?.style.setProperty('--p', p.toFixed(4));
      hero.current?.style.setProperty('--fold', `${fold.current}px`);
    });
  };

  return (
    <div className="screen streak-screen" data-dir="1">
      <div className="streak-hero" ref={hero}>
        <div className="topbar" style={{ color: '#fff' }}>
          <button className="iconbtn onflame" onClick={back} aria-label={t('Back')}><Icon name="back" /></button>
          <h1 style={{ color: '#fff' }}>{t('Streak')}</h1>
        </div>
        <div className="streak-main" ref={main}>
          <div className={`flame-wrap ${doneToday ? 'lit' : ''}`}>
            <span className="flame-glow" />
            <Icon name="flame" size={92} fill />
            <b><CountUp to={days} /></b>
          </div>
          <p className="streak-line">{days === 0 ? t('Solve one problem to light it') : `day${days === 1 ? '' : 's'} in a row`}</p>
          <p className="streak-sub">
            {doneToday ? t('Today is done. Come back tomorrow to keep it alive.') : days > 0 ? t('Solve one problem today to keep your streak.') : t('A streak starts with a single problem.')}
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

      <div className="scroll streak-scroll" onScroll={onScroll}>
        <div className="stagger" style={{ padding: `${heroH + 18}px 20px 30px`, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!doneToday && (
            <div className="center">
              <Button3D sheen onClick={() => go({ name: 'practice' })}><Icon name="flame" size={18} fill /> {days > 0 ? t('Keep my streak') : t('Start my streak')}</Button3D>
            </div>
          )}

          <section className="card goal-card">
            <Ring value={Math.min(1, xpToday / goal)} size={74} stroke={8} color="var(--flame)">
              <b style={{ fontSize: 17 }}>{Math.min(999, xpToday)}</b>
            </Ring>
            <div className="grow">
              <span className="label">{t('Today’s goal')}</span>
              <b style={{ display: 'block', fontSize: 17, marginTop: 2 }}>{xpToday >= goal ? t('Goal reached') : `${goal - xpToday} XP to go`}</b>
              <p className="muted" style={{ fontSize: 13.5 }}>{t('{0} of {1} XP · a clean solve is worth 15+', { 0: xpToday, 1: goal })}</p>
            </div>
          </section>

          <WidgetCard days={days} />

          <section className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="label">{t('Level {0} · {1}', { 0: lv.level, 1: lv.title })}</span>
              <span className="xp-tag"><CountUp to={xp} /> XP</span>
            </div>
            <div className="xpbar" style={{ marginTop: 10 }}><i style={{ width: `${(lv.into / lv.need) * 100}%` }} /></div>
            <p className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>{t('{0} XP to level {1}', { 0: lv.need - lv.into, 1: lv.level + 1 })}</p>
          </section>

          <div className="row" style={{ gap: 10 }}>
            <div className="stat grow"><b><CountUp to={best} /></b><span>{t('longest streak')}</span></div>
            <div className="stat grow"><b><CountUp to={new Set(attempts.map((a) => a.day)).size} /></b><span>{t('days practised')}</span></div>
            <div className="stat grow"><b>{nextMilestone}</b><span>{t('next milestone')}</span></div>
          </div>

          <section className="card">
            <span className="label">{t('Last five weeks')}</span>
            <div className="month" role="img" aria-label={t('Days practised over the last five weeks')}>
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
              <span className="label">{t('Badges')}</span>
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
              <p className="muted" style={{ maxWidth: 270, lineHeight: 1.5 }}>{t('Nothing here yet, your first solved problem lights the flame and earns your first badge.')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


/* ───────────── the home-screen widget, shown as it changes the longer it is ignored ───────────── */

const WIDGETS: { mood: Mood; tone: string; line: string; when: string; fill?: boolean; flame?: 'alert' | 'out'; n?: number }[] = [
  { mood: 'strong', tone: 'green', line: msg('Streak safe!'), when: msg('Done today') },
  { mood: 'happy', tone: 'blue', line: msg('Get started early!'), when: msg('Morning') },
  { mood: 'pleading', tone: 'violet', line: msg('Got 3 minutes?'), when: msg('Afternoon'), fill: true },
  { mood: 'scared', tone: 'orange', line: msg('Save your streak!'), when: msg('Evening'), flame: 'alert' },
  { mood: 'menace', tone: 'maroon', line: msg('Now or never!'), when: msg('Before midnight'), fill: true, flame: 'alert' },
  { mood: 'cry', tone: 'ice', line: msg('It’s gone… start again?'), when: msg('Streak lost'), flame: 'out', n: 0 },
  { mood: 'bored', tone: 'violet', line: msg('I’m waiting…'), when: msg('Days later'), fill: true, flame: 'out', n: 0 },
  { mood: 'dusty', tone: 'dust', line: msg('A week. I have cobwebs.'), when: msg('A week'), flame: 'out', n: 0 },
  { mood: 'ghost', tone: 'mist', line: msg('Remember me?'), when: msg('A month'), flame: 'out', n: 0 },
  { mood: 'fossil', tone: 'stone', line: msg('Lera, fossil. Dig me up?'), when: msg('A year'), flame: 'out', n: 0 },
  { mood: 'sleepy', tone: 'night', line: msg('Dreaming of x²…'), when: msg('At night') },
  { mood: 'laugh', tone: 'purple', line: msg('Hey, that tickles!'), when: msg('When you tap her') },
];

export function WidgetTile({ w, days, live }: { w: (typeof WIDGETS)[number]; days: number; live?: boolean }) {
  return (
    <div className={`wg wg-${w.tone} ${w.fill ? 'fill' : ''} ${live ? 'live' : ''}`}>
      <b className={w.flame ?? ''}><Icon name="flame" size={19} fill /> {w.n ?? Math.max(1, days)}</b>
      <span>{t(w.line)}</span>
      <i><Lera size={w.fill ? 150 : 84} mood={w.mood} interactive={false} /></i>
    </div>
  );
}

function WidgetCard({ days }: { days: number }) {
  const inApp = hasWidget();
  const [at, setAt] = useState(0);
  // the big one fast-forwards through the ladder, so the whole story plays in half a minute
  useEffect(() => {
    const id = setInterval(() => setAt((n) => (n + 1) % 10), 2600);
    return () => clearInterval(id);
  }, []);
  const add = (wide: boolean) => {
    haptic(6);
    if (!(canPinWidget() && pinWidget(wide))) toast(t('Long-press your home screen, choose Widgets, then Lera.'), 4200);
  };
  return (
    <section className="card wg-card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="label">{t('Home-screen widget')}</span>
        <span className="chip plain">{t(WIDGETS[at].when)}</span>
      </div>
      <div className="wg-hero"><WidgetTile key={at} w={WIDGETS[at]} days={days} live /></div>
      <p className="muted" style={{ fontSize: 13.5, textAlign: 'center' }}>{t('My mood follows the day, then the days you’re away. Tap me on the widget and I react.')}</p>
      <div className="wg-row" data-noswipe>
        {WIDGETS.map((w) => (
          <figure key={w.when} className="wg-cell">
            <WidgetTile w={w} days={days} />
            <figcaption>{t(w.when)}</figcaption>
          </figure>
        ))}
      </div>
      {inApp ? (
        <>
          <div className="row" style={{ gap: 10 }}>
            <Button3D small variant="secondary" style={{ flex: 1 }} onClick={() => add(false)}><Icon name="plus" size={17} />{' '}{t('Small')}</Button3D>
            <Button3D small variant="secondary" style={{ flex: 1 }} onClick={() => add(true)}><Icon name="plus" size={17} />{' '}{t('Wide')}</Button3D>
          </div>
        </>
      ) : (
        <p className="faint" style={{ fontSize: 13 }}>{t('In the Android app: long-press your home screen, choose Widgets, then Lera.')}</p>
      )}
    </section>
  );
}
