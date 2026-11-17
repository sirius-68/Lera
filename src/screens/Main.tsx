import '../styles/onb.css';
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { conceptOf } from '../engine/concepts';
import { SUBJECT_LABEL, subjectOf } from '../engine/concepts-calc';
import { ALL_CONCEPTS, practiceFor, seedFrom } from '../engine/generate';
import { ConceptId, Subject } from '../engine/types';
import { LeraDoc, Topic } from '../ingest/types';
import { Lera, Mood } from '../mascot/Lera';
import { actions, persisted, useStore } from '../store';
import { levelOf, totalXp, weekStrip, xpByDay } from '../store/game';
import { dailyQuests, learnerModel } from '../store/insights';
import { byDay, confidence, dayOf, docMastery, dueNow, findTopic, insights, reviewQueue, statusOf, streak, topicMastery, topicProblems, topicStatus } from '../store/learner';
import { go, openOverlay, Route } from '../store/nav';
import { AttemptRecord } from '../store/types';
import { Weakness, weaknesses } from '../store/weakness';
import { Bar, Button3D, confirmDialog, CountUp, Ring, Seg, haptic, toast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { MathView, RichText } from '../ui/math';
import { msg, t as tr, tn } from '../i18n';

const TABS: { name: Route['name']; label: string; icon: string }[] = [
  { name: 'home', label: msg('Home'), icon: 'home' },
  { name: 'lessons', label: msg('Learn'), icon: 'book' },
  { name: 'practice', label: msg('Practice'), icon: 'pencil' },
  { name: 'progress', label: msg('Progress'), icon: 'chart' },
];

export function TabBar({ current }: { current: string }) {
  const concepts = useStore((s) => s.concepts);
  const due = dueNow(concepts).length;
  const at = Math.max(0, TABS.findIndex((t) => t.name === current));
  return (
    <nav className="tabbar v2" aria-label={tr('Main')} style={{ '--at': at } as CSSProperties}>
      <i className="tab-pill" aria-hidden="true" />
      {TABS.map((t) => (
        <button
          key={t.name}
          aria-current={current === t.name ? 'page' : undefined}
          onClick={() => {
            if (current !== t.name) haptic(4);
            go({ name: t.name } as Route);
          }}
        >
          <Icon name={t.icon} size={23} fill={current === t.name && t.icon === 'home'} />
          <span>{tr(t.label)}</span>
          {t.name === 'practice' && due > 0 && <span className="badge">{due}</span>}
        </button>
      ))}
    </nav>
  );
}

const hello = (): string => {
  const h = new Date().getHours();
  return h < 5 ? tr('Still up') : h < 12 ? tr('Good morning') : h < 18 ? tr('Good afternoon') : tr('Good evening');
};

/** What tapping a weak spot does. */
export function actOn(w: Weakness): void {
  const a = w.action;
  if (a.type === 'lesson' && a.topicId) go({ name: 'lesson', topicId: a.topicId });
  else if (a.type === 'review' && a.concept) openOverlay({ name: 'review', concept: a.concept });
  else if (a.concept) go({ name: 'session', problems: practiceFor(a.concept, 4, seedFrom(`${dayOf()}:${a.concept}:${Date.now() % 991}`)), title: conceptOf(a.concept).title });
  else go({ name: 'practice' });
}

export function WeakCard({ w, compact }: { w: Weakness; compact?: boolean }) {
  return (
    <div className={`weak ${w.tone}`}>
      <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
        <span className="weak-ic"><Icon name={w.tone === 'gap' ? 'target' : w.tone === 'slip' ? 'eye' : 'bulb'} size={18} /></span>
        <div className="grow">
          <b>{w.title}</b>
          {!compact && <p><RichText text={w.detail} /></p>}
          {w.topic && w.action.type !== 'lesson' && <span className="weak-topic"><Icon name="book" size={13} />{' '}{tr('Taught in:')}{' '}{w.topic.title}</span>}
        </div>
      </div>
      <button className="weak-act" onClick={() => actOn(w)}>
        <Icon name={w.action.type === 'lesson' ? 'book' : w.action.type === 'review' ? 'bulb' : 'pencil'} size={16} />
        <span className="grow" style={{ textAlign: 'left' }}>{w.action.label}</span>
        <Icon name="chevron" size={15} />
      </button>
    </div>
  );
}

/* ───────────── home ───────────── */

export function HomeScreen() {
  const profile = useStore((s) => s.profile);
  const docs = useStore((s) => s.docs);
  const concepts = useStore((s) => s.concepts);
  const solved = useStore((s) => s.solved);
  const attempts = useStore((s) => s.attempts);
  const read = useStore((s) => s.read);
  const understood = useStore((s) => s.understood);
  const kept = useStore((s) => s.saved.length + s.notes.length + s.highlights.length);
  const chatCount = useStore((s) => Object.values(s.chats).filter((t) => t.length).length);
  const lastTopicId = useStore((s) => s.lastTopicId);
  const state = { concepts, solved };
  const game = { attempts, read };
  const due = dueNow(concepts);
  const days = streak(attempts);
  const today = dayOf();
  const doneToday = attempts.some((a) => a.day === today);
  const xpToday = xpByDay(game).get(today) ?? 0;
  const goal = profile.dailyXp || 30;
  const lv = levelOf(totalXp(game));
  const week = weekStrip(game);
  const last = findTopic(docs, lastTopicId) ?? (docs[0]?.units[0]?.topics[0] ? findTopic(docs, docs[0].units[0].topics[0].id) : null);
  const weak = weaknesses({ attempts, concepts, docs, understood })[0];
  const events = useStore((s) => s.events);
  const quests = useMemo(() => dailyQuests({ attempts, concepts, profile, events, read }), [attempts, concepts, profile, events, read]);

  let mood: Mood = 'idle';
  let line: string;
  if (docs.length === 0) {
    line = tr('Give me your notes and I’ll turn them into lessons and practice.');
    mood = 'curious';
  } else if (xpToday >= goal) {
    line = tr('Goal reached. Anything more today is a bonus.');
    mood = 'cool';
  } else if (!doneToday && days > 0 && new Date().getHours() >= 19) {
    line = tr('Your **{0}-day streak** ends tonight. One problem saves it.', { 0: days });
    mood = 'sad';
  } else if (due.length > 0) {
    line = due.length > 1 ? tr('**{idea}** is ready to come back, and {n} more.', { idea: conceptOf(due[0].concept).title, n: due.length - 1 }) : tr('**{idea}** is ready to come back.', { idea: conceptOf(due[0].concept).title });
    mood = 'determined';
  } else if (doneToday) {
    line = `${goal - xpToday} XP to today’s goal. One or two more problems.`;
    mood = days >= 3 ? 'fired' : 'happy';
  } else if (attempts.length === 0) {
    line = tr('Your notes are ready. Read a lesson, then show me your working.');
  } else {
    line = days > 1 ? tr('Day {0}. Shall we keep it going?', { 0: days }) : tr('Ready when you are.');
    mood = days >= 3 ? 'fired' : 'idle';
  }

  const start = () => {
    if (due.length > 0) go({ name: 'session', title: tr('Review') });
    else if (last) go({ name: 'session', topicId: last.topic.id });
    else go({ name: 'upload' });
  };

  return (
    <div className="screen home2" data-dir="0">
      <div className="topbar" style={{ paddingBottom: 6 }}>
        <div className="grow">
          <p className="faint" style={{ fontSize: 13.5, fontWeight: 600 }}>{hello()}</p>
          <h1 style={{ fontSize: 22 }}>{profile.name || tr('Welcome')}</h1>
        </div>
        <button className={`streakpill tap ${doneToday ? 'lit' : ''}`} onClick={() => go({ name: 'streak' })} aria-label={tr('{0}-day streak', { 0: days })}>
          <Icon name="flame" size={17} fill /> {days}
        </button>
        <button className="iconbtn" onClick={() => go({ name: 'settings' })} aria-label={tr('Settings')}><Icon name="gear" /></button>
      </div>
      <div className="scroll">
        <div className="stagger" style={{ padding: '4px 18px 26px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <section className="today-card">
            <div className="today-top">
              <span className="halo"><Lera size={66} mood={mood} sleepAfter={30000} /></span>
              <div className="grow">
                <p className="today-say"><RichText text={line} /></p>
              </div>
            </div>
            <div className="today-goal">
              <Ring value={Math.min(1, xpToday / goal)} size={62} stroke={7} color="#fff">
                <b style={{ fontSize: 15, color: '#fff' }}>{xpToday}</b>
              </Ring>
              <div className="grow">
                <b>{xpToday >= goal ? tr('Daily goal done') : tr('Today’s goal')}</b>
                <span>{tr('{0} / {1} XP · Level {2} {3}', { 0: xpToday, 1: goal, 2: lv.level, 3: lv.title })}</span>
                <div className="week mini">
                  {week.map((d) => (
                    <div key={d.day} className={`week-day ${d.active ? 'on' : ''} ${d.today ? 'today' : ''}`}>
                      <i>{d.active ? <Icon name="check" size={10} stroke={4} /> : null}</i>
                      <span>{d.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <button className="today-cta" onClick={start}>
              <Icon name={docs.length === 0 ? 'upload' : 'play'} size={17} fill={docs.length > 0} />
              {docs.length === 0 ? tr('Upload your notes') : due.length > 0 ? tn(due.length, 'Review {n} due idea', 'Review {n} due ideas') : attempts.length ? tr('Continue practising') : tr('Start practising')}
            </button>
          </section>

          {!persisted && <p className="warn"><Icon name="alert" size={17} /> <span>{tr('This browser isn’t letting Lera save. Your progress will last until you close the app.')}</span></p>}

          {docs.length > 0 && (
            <section className="card quests">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="label">{tr('Today’s quests')}</span>
                <span className="chip plain">{quests.filter((q) => q.done >= q.of).length}/{quests.length}</span>
              </div>
              {quests.map((q) => (
                <div key={q.id} className={`quest ${q.done >= q.of ? 'done' : ''}`}>
                  <span className="quest-ic"><Icon name={q.done >= q.of ? 'check' : q.icon} size={17} stroke={q.done >= q.of ? 3.2 : 2} /></span>
                  <div className="grow">
                    <b>{q.title}</b>
                    <i><em style={{ width: `${(q.done / q.of) * 100}%` }} /></i>
                  </div>
                  <span className="quest-n">{q.done}/{q.of}</span>
                </div>
              ))}
            </section>
          )}

          {weak && (
            <section className="col" style={{ gap: 8 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="label">{tr('Fix this first')}</span>
                <button className="linkbtn" style={{ padding: '2px 4px', fontSize: 13.5 }} onClick={() => go({ name: 'progress' })}>{tr('All weak spots')}</button>
              </div>
              <WeakCard w={weak} />
            </section>
          )}

          {last && (
            <section className="card continue">
              <span className="label">{attempts.length || Object.keys(solved).length ? tr('Continue') : tr('Start here')}</span>
              <div className="row" style={{ marginTop: 8, gap: 14 }}>
                <Ring value={topicMastery(last.topic, state)} size={58}>{Math.round(topicMastery(last.topic, state) * 100)}%</Ring>
                <div className="grow">
                  <b style={{ fontSize: 17, lineHeight: 1.25, display: 'block' }}>{last.topic.title}</b>
                  <p className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>{last.unit.title} · {last.topic.exercises.length ? tn(last.topic.exercises.length, '{n} exercise', '{n} exercises') : tr('Reading')}</p>
                </div>
              </div>
              <div className="row" style={{ gap: 10, marginTop: 14 }}>
                <Button3D small variant={last.topic.exercises.length ? 'secondary' : 'primary'} style={{ flex: 1 }} onClick={() => go({ name: 'lesson', topicId: last.topic.id })}><Icon name="book" size={17} />{' '}{tr('Read')}</Button3D>
                {last.topic.exercises.length > 0 && <Button3D small style={{ flex: 1 }} onClick={() => go({ name: 'session', topicId: last.topic.id })}><Icon name="pencil" size={17} />{' '}{tr('Practise')}</Button3D>}
              </div>
            </section>
          )}

          <div className="tiles">
            <button className="tile flame" onClick={() => go({ name: 'streak' })}>
              <span className="tile-ic"><Icon name="flame" size={22} fill /></span>
              <b>{days} day{days === 1 ? '' : 's'}</b>
              <span>{tr('Streak & badges')}</span>
            </button>
            <button className="tile gold" onClick={() => go({ name: 'saved' })}>
              <span className="tile-ic"><Icon name="bookmark" size={22} fill /></span>
              <b>{kept}</b>
              <span>{tr('Notebook')}</span>
            </button>
            <button className="tile sky" onClick={() => openOverlay({ name: 'ask' })}>
              <span className="tile-ic"><Icon name="chat" size={22} /></span>
              <b>{tr('Ask Lera')}</b>
              <span>{chatCount ? `${chatCount} saved ${chatCount === 1 ? 'chat' : 'chats'}` : tr('Any question')}</span>
            </button>
            <button className="tile brand" onClick={() => go({ name: 'upload' })}>
              <span className="tile-ic"><Icon name="plus" size={22} /></span>
              <b>{tr('Add')}</b>
              <span>{tr('New notes')}</span>
            </button>
          </div>

          {docs.length > 0 && (
            <section>
              <span className="label">{tr('Your notes')}</span>
              <div className="col" style={{ gap: 10, marginTop: 8 }}>
                {docs.map((d) => (
                  <button key={d.id} className="card tap" onClick={() => { actions.setActiveDoc(d.id); go({ name: 'lessons' }); }}>
                    <div className="row">
                      <span className="doc-ic"><Icon name="file" size={20} /></span>
                      <div className="grow">
                        <b style={{ display: 'block', fontSize: 15.5 }}>{d.title}</b>
                        <span className="muted" style={{ fontSize: 13 }}>{tn(d.units.reduce((n, u) => n + u.topics.length, 0), '{n} lesson · {p}% mastered', '{n} lessons · {p}% mastered', { p: Math.round(docMastery(d, state) * 100) })}</span>
                      </div>
                      <Icon name="chevron" size={18} />
                    </div>
                    <div style={{ marginTop: 10 }}><Bar value={docMastery(d, state)} tone="thin" label={tr('Mastered')} /></div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
      <TabBar current="home" />
    </div>
  );
}

/* ───────────── learn: the notes as a path ───────────── */

const DAY_PART = { morning: msg('in the morning'), afternoon: msg('in the afternoon'), evening: msg('in the evening'), night: msg('at night') } as const;
/** "3/8 from your notes solved", or that the lesson's part of the file has nothing to practise yet. */
function practiceLine(topic: Topic, solved: Record<string, unknown>, aiOn: boolean): string {
  const own = topicProblems(topic, aiOn);
  return own.length ? tr('{a}/{b} from your notes solved', { a: own.filter((e) => solved[e.id]).length, b: own.length }) : aiOn ? tr('Lera writes the practice from this section') : tr('No exercises in this section yet');
}

const STATUS_LABEL = { new: msg('Not started'), gap: msg('Has a gap'), shaky: msg('In progress'), solid: msg('Mastered') } as const;
/** How far each stop sits from the centre line, so the path winds. */
const SWAY = [0, 46, 74, 46, 0, -46, -74, -46];

export function LessonsScreen() {
  const docs = useStore((s) => s.docs);
  const activeDocId = useStore((s) => s.activeDocId);
  const concepts = useStore((s) => s.concepts);
  const solved = useStore((s) => s.solved);
  const read = useStore((s) => s.read);
  const kept = useStore((s) => s.saved.length + s.notes.length + s.highlights.length);
  const lastTopicId = useStore((s) => s.lastTopicId);
  const doc: LeraDoc | undefined = docs.find((d) => d.id === activeDocId) ?? docs[0];
  const state = { concepts, solved };
  // a long book shows one chapter at a time; the others fold down to their banner
  const [openUnits, setOpenUnits] = useState<Record<string, boolean>>({});

  if (!doc) {
    return (
      <div className="screen" data-dir="0">
        <div className="scroll center" style={{ justifyContent: 'center', gap: 14, padding: '0 30px' }}>
          <Lera size={104} mood="curious" />
          <h2 style={{ fontSize: 22 }}>{tr('No notes yet')}</h2>
          <p className="muted" style={{ lineHeight: 1.5 }}>{tr('Upload a PDF or Word file and its headings become your learning path.')}</p>
          <Button3D onClick={() => go({ name: 'upload' })}><Icon name="upload" size={18} />{' '}{tr('Upload notes')}</Button3D>
        </div>
        <TabBar current="lessons" />
      </div>
    );
  }

  const mastery = docMastery(doc, state);
  const allTopics = doc.units.flatMap((u) => u.topics);
  const hereId = allTopics.some((t) => t.id === lastTopicId) ? lastTopicId : allTopics.find((t) => topicStatus(t, state) !== 'solid')?.id ?? allTopics[0]?.id;
  let n = 0;
  const big = doc.units.length > 3 || allTopics.length > 14;
  const hereUnit = doc.units.find((u) => u.topics.some((t) => t.id === hereId))?.id;
  const isOpen = (id: string): boolean => openUnits[`${doc.id}:${id}`] ?? (!big || id === hereUnit);

  return (
    <div className="screen" data-dir="0">
      <header className="contents-head">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="label" style={{ color: 'rgba(255,255,255,.75)' }}>{tr('Your path')}</span>
          <span className="row" style={{ gap: 8 }}>
            <button className="head-add" onClick={() => go({ name: 'saved' })} aria-label={tr('Notebook, {0} kept', { 0: kept })}><Icon name="bookmark" size={17} /></button>
            <button className="head-add" onClick={() => go({ name: 'upload' })} aria-label={tr('Add notes')}><Icon name="plus" size={18} /></button>
          </span>
        </div>
        <h1>{doc.title}</h1>
        <div className="row" style={{ gap: 12, marginTop: 10 }}>
          <div className="grow"><Bar value={mastery} tone="onbrand" label={tr('Mastered')} /></div>
          <b style={{ fontSize: 14 }}><CountUp to={Math.round(mastery * 100)} suffix="%" />{' '}{tr('mastered')}</b>
        </div>
        {docs.length > 1 && (
          <div className="docswitch">
            {docs.map((d) => (
              <button key={d.id} data-on={d.id === doc.id ? '' : undefined} onClick={() => actions.setActiveDoc(d.id)}>{d.title}</button>
            ))}
          </div>
        )}
      </header>
      <div className="scroll">
        <div className="path">
          {doc.warnings.map((w) => (
            <p key={w} className="warn"><Icon name="alert" size={17} /> <span>{w}</span></p>
          ))}
          {doc.units.map((u, ui) => {
            const um = u.topics.reduce((s, t) => s + topicMastery(t, state), 0) / Math.max(1, u.topics.length);
            return (
              <section key={u.id} className={`path-unit ${isOpen(u.id) ? 'open' : 'shut'}`}>
                <button className={`unit-banner tone-${ui % 4}`} aria-expanded={isOpen(u.id)} onClick={() => { haptic(5); setOpenUnits({ ...openUnits, [`${doc.id}:${u.id}`]: !isOpen(u.id) }); }}>
                  <div className="grow" style={{ textAlign: 'left' }}>
                    <span>{tr(big ? 'Chapter {0}' : 'Unit {0}', { 0: ui + 1 })} · {tn(u.topics.length, '{n} lesson', '{n} lessons')}</span>
                    <b>{u.title}</b>
                  </div>
                  <Ring value={um} size={44} stroke={5} color="#fff"><span style={{ fontSize: 11.5, fontWeight: 700, color: '#fff' }}>{Math.round(um * 100)}%</span></Ring>
                  <span className="unit-chev"><Icon name="down" size={18} /></span>
                </button>
                {isOpen(u.id) && (
                <div className="path-stops">
                  {u.topics.map((t) => {
                    const st = topicStatus(t, state);
                    const seen = !!read[t.id];
                    const here = t.id === hereId;
                    const m = topicMastery(t, state);
                    const sway = SWAY[n++ % SWAY.length];
                    return (
                      <button key={t.id} className={`stop ${st} ${here ? 'here' : ''} ${seen ? 'seen' : ''}`} style={{ '--sway': `${sway}px` } as CSSProperties} onClick={() => go({ name: 'lesson', topicId: t.id })} aria-label={`${t.title}: ${tr(STATUS_LABEL[st])}`}>
                        {here && <span className="stop-flag">{st === 'new' && !seen ? tr('Start') : tr('Continue')}</span>}
                        <span className="stop-node">
                          <svg viewBox="0 0 80 80" className="stop-ring" aria-hidden="true">
                            <circle cx="40" cy="40" r="36" />
                            <circle cx="40" cy="40" r="36" className="fill" style={{ strokeDasharray: `${226 * m} 226` }} />
                          </svg>
                          <span className="stop-face">
                            <Icon name={st === 'solid' ? 'check' : st === 'gap' ? 'target' : t.exercises.length ? 'pencil' : 'book'} size={st === 'solid' ? 28 : 25} stroke={st === 'solid' ? 3.2 : 2} />
                          </span>
                        </span>
                        <span className="stop-label">
                          <b>{t.title}</b>
                          <span>{t.exercises.length ? tr('{0}/{1} solved', { 0: t.exercises.filter((e) => solved[e.id]).length, 1: t.exercises.length }) : tr('Reading')}{st === 'gap' ? ` ${tr('· gap')}` : ''}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                )}
              </section>
            );
          })}
          <p className="faint" style={{ fontSize: 12.5, textAlign: 'center', marginTop: 6 }}>
            {doc.fileName}
            {doc.tocVia === 'outline' || doc.tocVia === 'contents' ? ' · chapters from the book’s own contents' : ''}
          </p>
          <button className="linkbtn" style={{ color: 'var(--ink-3)', fontSize: 13.5, alignSelf: 'center' }} onClick={async () => { if (await confirmDialog(tr('Remove “{0}”?', { 0: doc.title }), { body: tr('Its highlights and notes go too. Your practice history stays.'), yes: tr('Remove'), danger: true })) { actions.removeDoc(doc.id); toast(tr('Notes removed')); } }}>
            <Icon name="trash" size={15} />{' '}{tr('Remove these notes')}
          </button>
        </div>
      </div>
      <TabBar current="lessons" />
    </div>
  );
}

/* ───────────── practice hub: what's due, and what's weak ───────────── */

const dueLabel = (inDays: number): string => (inDays <= 0 ? tr('Due now') : inDays === 1 ? tr('Tomorrow') : tr('In {0} days', { 0: inDays }));

export function PracticeScreen() {
  const docs = useStore((s) => s.docs);
  const concepts = useStore((s) => s.concepts);
  const aiOn = useStore((s) => s.ai.provider !== 'none');
  const found = useMemo(() => docs.flatMap((d) => d.units.flatMap((u) => u.topics.flatMap((tp) => tp.exercises))).filter((e) => !e.made && (aiOn || e.kind !== 'open')), [docs, aiOn]);
  const solved = useStore((s) => s.solved);
  const profile = useStore((s) => s.profile);
  const mine: Subject[] = profile.subjects?.length ? profile.subjects : ['algebra'];
  const [subject, setSubject] = useState<Subject>(mine[0]);
  const queue = reviewQueue(concepts);
  const due = queue.filter((q) => q.inDays <= 0);
  const later = queue.filter((q) => q.inDays > 0);
  const state = { concepts, solved };
  const topics = docs.flatMap((d) => d.units.flatMap((u) => u.topics));
  const quick = (id: ConceptId) => go({ name: 'session', problems: practiceFor(id, 4, seedFrom(`${dayOf()}:${id}:${Date.now() % 991}`)), title: conceptOf(id).title });
  const shownSubject = mine.includes(subject) ? subject : mine[0];
  const [tab, setTab] = useState<'review' | 'lessons' | 'ideas'>(queue.length ? 'review' : topics.length ? 'lessons' : 'ideas');
  const ideas = ALL_CONCEPTS.filter((id) => subjectOf(id) === shownSubject);

  return (
    <div className="screen" data-dir="0">
      <div className="topbar">
        <h1 style={{ fontSize: 24 }} className="grow">{tr('Practice')}</h1>
        <button className="modepill" onClick={() => { haptic(5); actions.setProfile({ checkMode: profile.checkMode === 'end' ? 'line' : 'end' }); toast(profile.checkMode === 'end' ? tr('Checking each line as you go') : tr('Checking when you finish')); }} aria-label={tr('Change when your working is checked')}>
          <Icon name={profile.checkMode === 'end' ? 'clock' : 'check'} size={15} stroke={2.6} /> {profile.checkMode === 'end' ? tr('Check at the end') : tr('Check as I go')}
        </button>
      </div>
      <div className="scroll">
        <div className="stagger" style={{ padding: '2px 20px 26px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="ob-ask" style={{ margin: 0 }}>
            <Lera size={58} mood={due.length ? 'determined' : queue.length ? 'cool' : 'happy'} sleepAfter={30000} />
            <div className="ob-bubble"><p style={{ margin: 0, fontSize: 15, color: 'var(--ink)' }}><RichText text={due.length ? tn(due.length, '**{n}** idea is ready to come back. A gap clears after two clean solves on different days.', '**{n}** ideas are ready to come back. A gap clears after two clean solves on different days.') : queue.length ? tr('Nothing is due today. What you fixed is resting, it comes back when it’s about to fade.') : tr('When I mark a gap in your working, it lands here and keeps coming back until it holds.')} /></p></div>
          </div>

          <Seg options={[{ id: 'review', label: due.length ? tr('Review · {0}', { 0: due.length }) : tr('Review') }, { id: 'lessons', label: tr('My lessons') }, { id: 'ideas', label: tr('Any topic') }]} value={tab} onChange={setTab} />

          {tab === 'review' && queue.length === 0 && (
            <div className="center" style={{ gap: 10, padding: '26px 10px' }}>
              <Lera size={84} mood="thumbsup" interactive={false} />
              <b style={{ fontSize: 17 }}>{tr('Nothing to review')}</b>
              <p className="muted" style={{ fontSize: 14, textAlign: 'center' }}>{tr('When I find a gap in your working, it shows up here until it holds.')}</p>
              <Button3D small variant="secondary" onClick={() => setTab(topics.length ? 'lessons' : 'ideas')}>{tr('Practise something')}</Button3D>
            </div>
          )}
          {tab === 'lessons' && topics.length === 0 && (
            <div className="center" style={{ gap: 10, padding: '26px 10px' }}>
              <Lera size={84} mood="reading" interactive={false} />
              <b style={{ fontSize: 17 }}>{tr('No notes yet')}</b>
              <p className="muted" style={{ fontSize: 14, textAlign: 'center' }}>{tr('Upload your notes and each lesson gets its own practice.')}</p>
              <Button3D small onClick={() => go({ name: 'upload' })}><Icon name="upload" size={16} />{' '}{tr('Upload notes')}</Button3D>
            </div>
          )}


          {tab === 'review' && due.length > 0 && (
            <section className="col" style={{ gap: 10 }}>
              <span className="label">{tr('Due now')}</span>
              {due.map((q) => (
                <button key={q.concept} className="card tap" onClick={() => openOverlay({ name: 'review', concept: q.concept })}>
                  <div className="row">
                    <span className={`chip ${q.kind === 'gap' ? 'gap' : q.kind === 'pattern' ? 'slip' : 'info'}`}>{q.kind === 'gap' ? tr('Gap') : q.kind === 'pattern' ? tr('Pattern') : tr('Check-in')}</span>
                    <b className="grow" style={{ fontSize: 15 }}>{conceptOf(q.concept).title}</b>
                    <Icon name="chevron" size={17} />
                  </div>
                  {q.state.lastTitle && <p className="muted" style={{ fontSize: 13.5, marginTop: 6 }}><RichText text={q.state.lastTitle} /></p>}
                  <div className="row" style={{ gap: 6, marginTop: 8 }}>
                    {[0, 1].map((i) => <i key={i} className={`pip ${q.state.cleanDays.length > i ? 'on' : ''}`} />)}
                    <span className="faint" style={{ fontSize: 12.5 }}>{q.kind === 'check' ? tr('One clean solve keeps it solid') : tr('{n}/2 clean days', { n: q.state.cleanDays.length })}</span>
                  </div>
                </button>
              ))}
              <div className="center"><Button3D sheen onClick={() => go({ name: 'session', title: tr('Review') })}><Icon name="refresh" size={18} />{' '}{tr('Start review')}</Button3D></div>
            </section>
          )}

          {tab === 'review' && later.length > 0 && (
            <section className="col" style={{ gap: 8 }}>
              <span className="label">{tr('Coming back later')}</span>
              {later.map((q) => (
                <button key={q.concept} className="noticed" style={{ borderTop: 0 }} onClick={() => openOverlay({ name: 'review', concept: q.concept })}>
                  <span className={`dot ${q.status}`} />
                  <span className="grow"><b style={{ fontSize: 14.5 }}>{conceptOf(q.concept).title}</b></span>
                  <span className="chip plain">{dueLabel(q.inDays)}</span>
                </button>
              ))}
            </section>
          )}

          {tab === 'lessons' && found.length > 0 && (
            // every exercise the file has, in one place: what the upload screen counted is what is here
            <button className="noticed" style={{ borderTop: 0 }} onClick={() => go({ name: 'session', problems: [...found.filter((e) => !solved[e.id]), ...found.filter((e) => solved[e.id])].slice(0, 8), title: tr('From your notes') })}>
              <Icon name="pencil" size={18} />
              <span className="grow">
                <b style={{ fontSize: 14.5 }}>{tr('Exercises from your notes')}</b>
                <span className="muted" style={{ fontSize: 13, display: 'block' }}>{tr('{0}/{1} solved', { 0: found.filter((e) => solved[e.id]).length, 1: found.length })}</span>
              </span>
              <Icon name="play" size={15} fill />
            </button>
          )}
          {tab === 'lessons' && topics.length > 0 && (
            <section className="col" style={{ gap: 8 }}>
              {topics.map((t) => (
                <button key={t.id} className="noticed" style={{ borderTop: 0 }} onClick={() => go({ name: 'session', topicId: t.id })}>
                  <span className={`dot ${topicStatus(t, state)}`} />
                  <span className="grow">
                    <b style={{ fontSize: 14.5, display: 'block' }}>{t.title}</b>
                    <span className="muted" style={{ fontSize: 13 }}>{practiceLine(t, solved, aiOn)}</span>
                  </span>
                  <Icon name="play" size={15} fill />
                </button>
              ))}
            </section>
          )}

          {tab === 'ideas' && <section className="col" style={{ gap: 10 }}>
            {mine.length > 1 && <Seg options={mine.map((s) => ({ id: s, label: tr(SUBJECT_LABEL[s]) }))} value={shownSubject} onChange={setSubject} />}
            <div className="idea-grid">
              {ideas.map((id) => (
                <button key={id} className={`idea ${statusOf(concepts[id])}`} onClick={() => quick(id)}>
                  {conceptOf(id).title}
                </button>
              ))}
            </div>
          </section>}
        </div>
      </div>
      <TabBar current="practice" />
    </div>
  );
}

/* ───────────── progress ───────────── */

function Signature({ attempts }: { attempts: AttemptRecord[] }) {
  const days = byDay(attempts).slice(-10);
  const max = Math.max(1, ...days.map((d) => d.gaps + d.slips));
  if (days.length === 0) return null;
  return (
    <div className="sig" role="img" aria-label={tr('Marks per day over the last {0} days of practice', { 0: days.length })}>
      {days.map((d, i) => (
        <div key={d.day} className="sig-col" title={tr('{0}: {1} gaps, {2} slips, {3}/{4} solved', { 0: d.day, 1: d.gaps, 2: d.slips, 3: d.solved, 4: d.problems })}>
          <div className="sig-bars">
            <i className="gapbar" style={{ height: `${(d.gaps / max) * 100}%`, animationDelay: `${i * 50}ms` }} />
            <i className="slipbar" style={{ height: `${(d.slips / max) * 100}%`, animationDelay: `${i * 50 + 25}ms` }} />
          </div>
          <span>{d.day.slice(8)}</span>
        </div>
      ))}
    </div>
  );
}

export function ProgressScreen() {
  const attempts = useStore((s) => s.attempts);
  const concepts = useStore((s) => s.concepts);
  const docs = useStore((s) => s.docs);
  const read = useStore((s) => s.read);
  const understood = useStore((s) => s.understood);
  const [openId, setOpenId] = useState<string | null>(null);
  const [allWeak, setAllWeak] = useState(false);
  const days = streak(attempts);
  const solved = attempts.filter((a) => a.verdict === 'solved').length;
  const clean = attempts.filter((a) => a.verdict === 'solved' && a.marks.length === 0 && a.hintRung < 3).length;
  const notes = insights({ attempts, concepts });
  const weak = weaknesses({ attempts, concepts, docs, understood });
  const known = Object.values(concepts).filter((c) => !!c);
  const order = { gap: 0, shaky: 1, solid: 2, new: 3 } as const;
  const sorted = [...known].sort((a, b) => order[statusOf(a)] - order[statusOf(b)]);
  const approaches = new Map<string, number>();
  attempts.forEach((a) => a.approach && approaches.set(a.approach, (approaches.get(a.approach) ?? 0) + 1));
  const topApproaches = [...approaches.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const totalApproach = topApproaches.reduce((s, [, n]) => s + n, 0);
  const gaps = attempts.reduce((s, a) => s + a.marks.filter((m) => m.severity === 'gap').length, 0);
  const slips = attempts.reduce((s, a) => s + a.marks.filter((m) => m.severity === 'slip').length, 0);
  const xp = totalXp({ attempts, read });
  const lv = levelOf(xp);
  const profile = useStore((s) => s.profile);
  const events = useStore((s) => s.events);
  const model = useMemo(() => learnerModel({ attempts, concepts, profile, events, read }), [attempts, concepts, profile, events, read]);

  return (
    <div className="screen" data-dir="0">
      <div className="topbar">
        <h1 style={{ fontSize: 24 }} className="grow">{tr('Progress')}</h1>
        <button className="iconbtn" onClick={() => go({ name: 'settings' })} aria-label={tr('Settings')}><Icon name="gear" /></button>
      </div>
      <div className="scroll">
        {attempts.length === 0 ? (
          <div className="center" style={{ gap: 14, padding: '60px 30px' }}>
            <Lera size={104} mood="curious" />
            <h2 style={{ fontSize: 21 }}>{tr('Nothing to analyse yet')}</h2>
            <p className="muted" style={{ lineHeight: 1.5 }}>{tr('Solve a few problems and this page fills in: where your working breaks, which ideas are shaky, and what to review.')}</p>
            <Button3D onClick={() => go({ name: 'practice' })}>{tr('Go to Practice')}</Button3D>
          </div>
        ) : (
          <div className="stagger" style={{ padding: '2px 20px 26px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {model.evidence !== 'none' && (
            <section className="card learn-card">
              <span className="label">{tr('How you learn')}</span>
              <ul>
                {model.habits.usualTime && <li><Icon name="clock" size={16} /> <span><RichText text={model.habits.usualHour !== null ? tr('You mostly practise **{when}**, around {h}:00.', { when: tr(DAY_PART[model.habits.usualTime]), h: model.habits.usualHour }) : tr('You mostly practise **{when}**.', { when: tr(DAY_PART[model.habits.usualTime]) })} /></span></li>}
                {model.skill.pace !== null && <li><Icon name="bolt" size={16} /> <span><RichText text={tr(model.skill.trend > 0.05 ? 'About **{pace}** a problem, **{pct}%** clean lately, and improving.' : model.skill.trend < -0.05 ? 'About **{pace}** a problem, **{pct}%** clean lately, a little down.' : 'About **{pace}** a problem, **{pct}%** clean lately.', { pace: model.skill.pace < 90 ? tn(Math.round(model.skill.pace), '{n} second', '{n} seconds') : tn(Math.round(model.skill.pace / 60), '{n} minute', '{n} minutes'), pct: Math.round(model.skill.cleanRate * 100) })} /></span></li>}
                {model.style.mistakes !== 'few' && <li><Icon name="target" size={16} /> <span><RichText text={tr(model.style.mistakes === 'careless' ? 'Your mistakes are mostly **slips**: you know the rule and lose a sign or a number. One more check per line fixes most of them.' : model.style.mistakes === 'conceptual' ? 'Your mistakes are mostly **gaps**: a rule that isn’t there yet. Reviews matter more than extra problems.' : 'A mix of **slips and gaps**. I’ll keep bringing the gaps back.')} /></span></li>}
                {model.topErrors[0] && <li><Icon name="refresh" size={16} /> <span>{tr('Most repeated:')}{' '}<b>{model.topErrors[0].title}</b> ({model.topErrors[0].count}{' '}{tr('times).')}</span></li>}
                {model.style.hintReliance > 0.4 && <li><Icon name="bulb" size={16} /> <span>{tr('You take a hint on')}{' '}<b>{Math.round(model.style.hintReliance * 100)}%</b>{' '}{tr('of problems. Try the first line alone before asking.')}</span></li>}
              </ul>
              <p className="faint" style={{ fontSize: 12.5 }}>{tr('Worked out on this phone from your own working.')}</p>
            </section>
          )}
            <button className="level-card" onClick={() => go({ name: 'streak' })}>
              <span className="level-n">{lv.level}</span>
              <div className="grow" style={{ textAlign: 'left' }}>
                <b>{lv.title}</b>
                <div className="xpbar light"><i style={{ width: `${(lv.into / lv.need) * 100}%` }} /></div>
                <span><CountUp to={xp} /> XP · {lv.need - lv.into}{' '}{tr('to level')}{' '}{lv.level + 1}</span>
              </div>
              <Icon name="chevron" size={18} />
            </button>

            <div className="row" style={{ gap: 10 }}>
              <div className="stat grow"><b><CountUp to={days} /></b><span>{tr('day streak')}</span></div>
              <div className="stat grow"><b><CountUp to={solved} /></b><span>{tr('solved')}</span></div>
              <div className="stat grow"><b><CountUp to={solved ? Math.round((clean / solved) * 100) : 0} suffix="%" /></b><span>{tr('clean')}</span></div>
            </div>

            {weak.length > 0 && (
              <section className="col" style={{ gap: 10 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="label">{tr('Weak spots · {0}', { 0: weak.length })}</span>
                  <span className="faint" style={{ fontSize: 12.5 }}>{tr('most useful first')}</span>
                </div>
                {(allWeak ? weak : weak.slice(0, 3)).map((w) => <WeakCard key={w.id} w={w} />)}
                {weak.length > 3 && (
                  <button className="linkbtn" style={{ alignSelf: 'center' }} onClick={() => setAllWeak(!allWeak)}>
                    {allWeak ? tr('Show fewer') : tr('Show all {0}', { 0: weak.length })}
                  </button>
                )}
              </section>
            )}

            <section className="card">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="label">{tr('Your error signature')}</span>
                <span className="row" style={{ gap: 10, fontSize: 12.5 }}>
                  <span className="row" style={{ gap: 4 }}><i className="lg gapbar" />{' '}{tr('Gaps')}{' '}{gaps}</span>
                  <span className="row" style={{ gap: 4 }}><i className="lg slipbar" />{' '}{tr('Slips')}{' '}{slips}</span>
                </span>
              </div>
              <Signature attempts={attempts} />
              <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.45 }}>A <b>{tr('gap')}</b>{' '}{tr('is a rule you don’t have yet, it gets a review. A')}{' '}<b>{tr('slip')}</b>{' '}{tr('is a rule you have but fumbled, it just gets noticed.')}</p>
            </section>

            {notes.length > 0 && (
              <section className="col" style={{ gap: 8 }}>
                <span className="label">{tr('How you work')}</span>
                {notes.map((n, i) => (
                  <div key={i} className={`insight ${n.tone}`}>
                    <Icon name={n.tone === 'gap' ? 'target' : n.tone === 'slip' ? 'eye' : n.tone === 'strategy' ? 'swap' : 'sparkle'} size={18} />
                    <p><RichText text={n.text} /></p>
                  </div>
                ))}
              </section>
            )}

            {sorted.length > 0 && (
              <section className="col" style={{ gap: 8 }}>
                <span className="label">{tr('Knowledge map')}</span>
                {sorted.map((c) => {
                  const st = statusOf(c);
                  return (
                    <button key={c.id} className="kmap" onClick={() => openOverlay({ name: 'review', concept: c.id })}>
                      <span className={`dot ${st}`} />
                      <span className="grow">
                        <b>{conceptOf(c.id).title}</b>
                        <Bar value={confidence(c)} tone={`thin ${st === 'solid' ? 'ok' : ''}`} label={tr('Confidence')} />
                      </span>
                      <span className="faint" style={{ fontSize: 12.5, minWidth: 64, textAlign: 'right' }}>
                        {c.gaps ? tn(c.gaps, '{n} gap', '{n} gaps') : c.slips ? tn(c.slips, '{n} slip', '{n} slips') : tr('{0} clean', { 0: c.clean })}
                      </span>
                    </button>
                  );
                })}
              </section>
            )}

            {topApproaches.length > 0 && (
              <section className="card">
                <span className="label">{tr('How you approach problems')}</span>
                <div className="col" style={{ gap: 10, marginTop: 10 }}>
                  {topApproaches.map(([name, n]) => (
                    <div key={name}>
                      <div className="row" style={{ justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
                        <span style={{ textTransform: 'capitalize' }}>{name}</span>
                        <span className="faint">{n}</span>
                      </div>
                      <Bar value={n / totalApproach} tone="thin" label={name} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="col" style={{ gap: 8 }}>
              <span className="label">{tr('Recent working')}</span>
              {[...attempts].reverse().slice(0, 12).map((a) => (
                <div key={a.id} className="card recent">
                  <button className="row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setOpenId(openId === a.id ? null : a.id)} aria-expanded={openId === a.id}>
                    <span className={`dot ${a.verdict === 'solved' ? (a.marks.length ? 'shaky' : 'solid') : 'gap'}`} />
                    <span className="grow"><MathView text={a.given || a.prompt} /></span>
                    <span className="faint" style={{ fontSize: 12.5 }}>{a.day.slice(5)}</span>
                    <Icon name={openId === a.id ? 'down' : 'chevron'} size={16} />
                  </button>
                  {openId === a.id && (
                    <ol className="lines mini">
                      {a.lines.map((l, i) => (
                        <li key={i} className={`line ${l.status}`}>
                          <div className="line-row">
                            <span className="n">{i + 1}</span>
                            <span className="grow"><MathView text={l.text} block /></span>
                            <span className={`mark ${l.status === 'ok' || l.status === 'recovered' ? 'ok static' : l.status === 'wrong' ? (l.severity === 'slip' ? 'slip' : 'gap') : l.status === 'carried' ? 'carried' : l.status === 'step' ? 'step' : 'none'}`}>
                              {(l.status === 'ok' || l.status === 'recovered') && <Icon name="check" size={13} stroke={3.4} />}
                            </span>
                          </div>
                        </li>
                      ))}
                      {a.marks.map((m, i) => (
                        <p key={i} className="muted" style={{ fontSize: 13.5, padding: '4px 0 0 34px' }}>
                          <span className={`chip ${m.severity === 'gap' ? 'gap' : 'slip'}`} style={{ marginRight: 6 }}>{tr('Line {0}', { 0: m.line + 1 })}</span>
                          <RichText text={m.title} />
                        </p>
                      ))}
                    </ol>
                  )}
                </div>
              ))}
            </section>
          </div>
        )}
      </div>
      <TabBar current="progress" />
    </div>
  );
}
