import { useState } from 'react';
import { CONCEPTS } from '../engine/concepts';
import { ALL_CONCEPTS, practiceFor, seedFrom } from '../engine/generate';
import { ConceptId } from '../engine/types';
import { LeraDoc } from '../ingest/types';
import { Lera, Mood } from '../mascot/Lera';
import { actions, persisted, useStore } from '../store';
import { byDay, confidence, dayOf, docMastery, dueNow, findTopic, insights, reviewQueue, statusOf, streak, topicMastery, topicStatus } from '../store/learner';
import { go, openOverlay, Route } from '../store/nav';
import { AttemptRecord } from '../store/types';
import { Bar, Button3D, confirmDialog, CountUp, LeraSays, Ring, Seg, toast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { MathView, RichText } from '../ui/math';

const TABS: { name: Route['name']; label: string; icon: string }[] = [
  { name: 'home', label: 'Home', icon: 'home' },
  { name: 'lessons', label: 'Lessons', icon: 'book' },
  { name: 'practice', label: 'Practice', icon: 'pencil' },
  { name: 'progress', label: 'Progress', icon: 'chart' },
];

export function TabBar({ current }: { current: string }) {
  const concepts = useStore((s) => s.concepts);
  const due = dueNow(concepts).length;
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => (
        <button key={t.name} aria-current={current === t.name ? 'page' : undefined} onClick={() => go({ name: t.name } as Route)}>
          <Icon name={t.icon} size={23} />
          {t.label}
          {t.name === 'practice' && due > 0 && <span className="badge">{due}</span>}
        </button>
      ))}
    </nav>
  );
}

const hello = (): string => {
  const h = new Date().getHours();
  return h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

/* ───────────── home ───────────── */

export function HomeScreen() {
  const profile = useStore((s) => s.profile);
  const docs = useStore((s) => s.docs);
  const concepts = useStore((s) => s.concepts);
  const solved = useStore((s) => s.solved);
  const attempts = useStore((s) => s.attempts);
  const lastTopicId = useStore((s) => s.lastTopicId);
  const state = { concepts, solved };
  const due = dueNow(concepts);
  const days = streak(attempts);
  const today = dayOf();
  const doneToday = attempts.filter((a) => a.day === today).length;
  const last = findTopic(docs, lastTopicId) ?? (docs[0]?.units[0]?.topics[0] ? findTopic(docs, docs[0].units[0].topics[0].id) : null);

  let mood: Mood = 'idle';
  let line: string;
  if (docs.length === 0) {
    line = 'Give me your algebra notes and I’ll turn them into lessons and practice.';
    mood = 'curious';
  } else if (due.length > 0) {
    line = `**${CONCEPTS[due[0].concept].title}** is due to come back${due.length > 1 ? `, and ${due.length - 1} more` : ''}. Two minutes now saves you later.`;
  } else if (doneToday > 0) {
    line = `${doneToday} ${doneToday === 1 ? 'problem' : 'problems'} today. I’m keeping track of every line.`;
    mood = 'proud';
  } else if (attempts.length === 0) {
    line = 'Your notes are ready. Read a lesson, then show me your working.';
  } else {
    line = days > 1 ? `Day ${days}. Shall we keep it going?` : 'Ready when you are.';
  }

  return (
    <div className="screen" data-dir="0">
      <div className="topbar" style={{ paddingBottom: 4 }}>
        <div className="grow">
          <p className="faint" style={{ fontSize: 13.5, fontWeight: 600 }}>{hello()}</p>
          <h1 style={{ fontSize: 22 }}>{profile.name || 'Welcome'}</h1>
        </div>
        <span className="streakpill" title="Days in a row"><Icon name="flame" size={17} fill /> {days}</span>
        <button className="iconbtn" onClick={() => go({ name: 'settings' })} aria-label="Settings"><Icon name="gear" /></button>
      </div>
      <div className="scroll">
        <div className="stagger" style={{ padding: '4px 20px 26px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="hero">
            <LeraSays size={92} mood={mood} text={line} sleepAfter={45000} solid />
          </div>

          {!persisted && <p className="warn"><Icon name="alert" size={17} /> <span>This browser isn’t letting Lera save. Your progress will last until you close the tab.</span></p>}

          {due.length > 0 && (
            <button className="card tap due" onClick={() => go({ name: 'session', title: 'Review' })}>
              <div className="row">
                <span className="due-ic"><Icon name="refresh" size={20} /></span>
                <div className="grow">
                  <b style={{ fontSize: 16 }}>{due.length} {due.length === 1 ? 'topic is' : 'topics are'} due</b>
                  <p className="muted" style={{ fontSize: 13.5 }}>{due.slice(0, 2).map((d) => CONCEPTS[d.concept].title).join(' · ')}</p>
                </div>
                <Icon name="chevron" size={18} />
              </div>
            </button>
          )}

          {last ? (
            <div className="card continue">
              <span className="label">{attempts.length || Object.keys(solved).length ? 'Continue' : 'Start here'}</span>
              <div className="row" style={{ marginTop: 8, gap: 14 }}>
                <Ring value={topicMastery(last.topic, state)} size={58}>{Math.round(topicMastery(last.topic, state) * 100)}%</Ring>
                <div className="grow">
                  <b style={{ fontSize: 17, lineHeight: 1.25, display: 'block' }}>{last.topic.title}</b>
                  <p className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>{last.unit.title} · {last.topic.exercises.length} {last.topic.exercises.length === 1 ? 'exercise' : 'exercises'}</p>
                </div>
              </div>
              <div className="row" style={{ gap: 10, marginTop: 14 }}>
                <Button3D small variant="secondary" style={{ flex: 1 }} onClick={() => go({ name: 'lesson', topicId: last.topic.id })}><Icon name="book" size={17} /> Read</Button3D>
                <Button3D small style={{ flex: 1 }} onClick={() => go({ name: 'session', topicId: last.topic.id })}><Icon name="pencil" size={17} /> Practise</Button3D>
              </div>
            </div>
          ) : (
            <div className="center" style={{ padding: '6px 0' }}>
              <Button3D sheen onClick={() => go({ name: 'upload' })}><Icon name="upload" size={18} /> Upload your notes</Button3D>
            </div>
          )}

          {docs.length > 0 && (
            <section>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="label">Your notes</span>
                <button className="linkbtn" style={{ padding: '4px 6px', fontSize: 14 }} onClick={() => go({ name: 'upload' })}><Icon name="plus" size={15} /> Add</button>
              </div>
              <div className="col" style={{ gap: 10, marginTop: 6 }}>
                {docs.map((d) => (
                  <button key={d.id} className="card tap" onClick={() => { actions.setActiveDoc(d.id); go({ name: 'lessons' }); }}>
                    <div className="row">
                      <span className="doc-ic"><Icon name="file" size={20} /></span>
                      <div className="grow">
                        <b style={{ display: 'block', fontSize: 15.5 }}>{d.title}</b>
                        <span className="muted" style={{ fontSize: 13 }}>{d.units.reduce((n, u) => n + u.topics.length, 0)} lessons · {Math.round(docMastery(d, state) * 100)}% mastered</span>
                      </div>
                      <Icon name="chevron" size={18} />
                    </div>
                    <div style={{ marginTop: 10 }}><Bar value={docMastery(d, state)} tone="thin" label="Mastered" /></div>
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

/* ───────────── lessons: the interactive table of contents ───────────── */

const STATUS_LABEL = { new: 'Not started', gap: 'Has a gap', shaky: 'In progress', solid: 'Mastered' } as const;

export function LessonsScreen() {
  const docs = useStore((s) => s.docs);
  const activeDocId = useStore((s) => s.activeDocId);
  const concepts = useStore((s) => s.concepts);
  const solved = useStore((s) => s.solved);
  const read = useStore((s) => s.read);
  const notes = useStore((s) => s.notes);
  const saved = useStore((s) => s.saved);
  const lastTopicId = useStore((s) => s.lastTopicId);
  const [view, setView] = useState<'contents' | 'notebook'>('contents');
  const doc: LeraDoc | undefined = docs.find((d) => d.id === activeDocId) ?? docs[0];
  const state = { concepts, solved };
  const currentUnit = doc?.units.find((u) => u.topics.some((t) => t.id === lastTopicId))?.id ?? doc?.units[0]?.id;
  const [open, setOpen] = useState<Record<string, boolean>>(() => (currentUnit ? { [currentUnit]: true } : {}));

  if (!doc) {
    return (
      <div className="screen" data-dir="0">
        <div className="scroll center" style={{ justifyContent: 'center', gap: 14, padding: '0 30px' }}>
          <Lera size={104} mood="curious" />
          <h2 style={{ fontSize: 22 }}>No notes yet</h2>
          <p className="muted" style={{ lineHeight: 1.5 }}>Upload a PDF or Word file and its headings become this table of contents.</p>
          <Button3D onClick={() => go({ name: 'upload' })}><Icon name="upload" size={18} /> Upload notes</Button3D>
        </div>
        <TabBar current="lessons" />
      </div>
    );
  }

  const mastery = docMastery(doc, state);
  const docTopicIds = new Set(doc.units.flatMap((u) => u.topics.map((t) => t.id)));
  const myNotes = notes.filter((n) => docTopicIds.has(n.topicId));
  const mySaved = saved.filter((s) => docTopicIds.has(s.topicId));

  return (
    <div className="screen" data-dir="0">
      <header className="contents-head">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="label" style={{ color: 'rgba(255,255,255,.75)' }}>Notes contents</span>
          <button className="head-add" onClick={() => go({ name: 'upload' })} aria-label="Add notes"><Icon name="plus" size={18} /></button>
        </div>
        <h1>{doc.title}</h1>
        <div className="row" style={{ gap: 12, marginTop: 10 }}>
          <div className="grow"><Bar value={mastery} tone="onbrand" label="Mastered" /></div>
          <b style={{ fontSize: 14 }}>Mastered: <CountUp to={Math.round(mastery * 100)} suffix="%" /></b>
        </div>
        {docs.length > 1 && (
          <div className="docswitch">
            {docs.map((d) => (
              <button key={d.id} data-on={d.id === doc.id ? '' : undefined} onClick={() => actions.setActiveDoc(d.id)}>{d.title}</button>
            ))}
          </div>
        )}
      </header>
      <div style={{ padding: '12px 20px 6px' }}>
        <Seg options={[{ id: 'contents', label: 'Contents' }, { id: 'notebook', label: `Notebook${myNotes.length + mySaved.length ? ` · ${myNotes.length + mySaved.length}` : ''}` }]} value={view} onChange={setView} />
      </div>
      <div className="scroll">
        {view === 'contents' ? (
          <div className="stagger" style={{ padding: '6px 20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {doc.warnings.map((w) => (
              <p key={w} className="warn"><Icon name="alert" size={17} /> <span>{w}</span></p>
            ))}
            {doc.units.map((u, ui) => {
              const isOpen = !!open[u.id];
              const um = u.topics.reduce((s, t) => s + topicMastery(t, state), 0) / Math.max(1, u.topics.length);
              return (
                <section key={u.id} className={`unit ${isOpen ? 'open' : ''}`}>
                  <button className="unit-head" onClick={() => setOpen({ ...open, [u.id]: !isOpen })} aria-expanded={isOpen}>
                    <span className="unit-n">{ui + 1}</span>
                    <span className="grow">
                      <b>{u.title}</b>
                      <span className="muted">{u.topics.length} {u.topics.length === 1 ? 'lesson' : 'lessons'} · {Math.round(um * 100)}%</span>
                    </span>
                    <span className="chev"><Icon name="down" size={18} /></span>
                  </button>
                  <div className="unit-body">
                    <div>
                      {u.topics.map((t) => {
                        const st = topicStatus(t, state);
                        const seen = !!read[t.id];
                        return (
                          <button key={t.id} className="topic-row" onClick={() => go({ name: 'lesson', topicId: t.id })}>
                            <span className={`dot ${st}`} title={STATUS_LABEL[st]}>{st === 'solid' ? <Icon name="check" size={11} stroke={3.5} /> : null}</span>
                            <span className="grow">
                              <b>{t.title}</b>
                              <span className="muted">
                                {t.exercises.length ? `${t.exercises.length} ${t.exercises.length === 1 ? 'exercise' : 'exercises'}` : 'Reading'}
                                {st !== 'new' ? ` · ${STATUS_LABEL[st]}` : seen ? ' · Read' : ''}
                              </span>
                            </span>
                            {t.id === lastTopicId && <span className="chip">Here</span>}
                            <Icon name="chevron" size={16} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>
              );
            })}
            <p className="faint" style={{ fontSize: 12.5, textAlign: 'center', marginTop: 6 }}>
              {doc.fileName} · organised by {doc.via === 'ai' ? 'your AI model' : 'the built-in reader'}
            </p>
            <button className="linkbtn" style={{ color: 'var(--ink-3)', fontSize: 13.5, alignSelf: 'center' }} onClick={async () => { if (await confirmDialog(`Remove “${doc.title}”?`, { body: 'Its highlights and notes go too. Your practice history stays.', yes: 'Remove', danger: true })) { actions.removeDoc(doc.id); toast('Notes removed'); } }}>
              <Icon name="trash" size={15} /> Remove these notes
            </button>
          </div>
        ) : (
          <div className="stagger" style={{ padding: '6px 20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {myNotes.length + mySaved.length === 0 && (
              <div className="center" style={{ gap: 10, padding: '30px 10px' }}>
                <Lera size={80} mood="curious" />
                <p className="muted" style={{ lineHeight: 1.5, maxWidth: 280 }}>Select any text in a lesson to highlight it, add a note or save it. It all collects here.</p>
              </div>
            )}
            {myNotes.length > 0 && <span className="label">Your notes</span>}
            {myNotes.map((n) => (
              <div key={n.id} className="card">
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <button className="grow" style={{ textAlign: 'left' }} onClick={() => go({ name: 'lesson', topicId: n.topicId })}>
                    <b>{n.title || 'Untitled'}</b>
                    <p style={{ fontSize: 14.5, lineHeight: 1.5, margin: '4px 0' }}>{n.content}</p>
                    <span className="faint" style={{ fontSize: 13 }}>“{n.quote.slice(0, 70)}”</span>
                  </button>
                  <button className="iconbtn" onClick={() => actions.removeNote(n.id)} aria-label="Delete note"><Icon name="trash" size={17} /></button>
                </div>
              </div>
            ))}
            {mySaved.length > 0 && <span className="label" style={{ marginTop: 6 }}>Saved passages</span>}
            {mySaved.map((s) => (
              <div key={s.id} className="card">
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <button className="grow" style={{ textAlign: 'left' }} onClick={() => go({ name: 'lesson', topicId: s.topicId })}>
                    <p style={{ fontSize: 15, lineHeight: 1.5 }}>“{s.text}”</p>
                    <span className="faint" style={{ fontSize: 13 }}>{s.topicTitle}</span>
                  </button>
                  <button className="iconbtn" onClick={() => actions.removeSaved(s.id)} aria-label="Remove"><Icon name="trash" size={17} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <TabBar current="lessons" />
    </div>
  );
}

/* ───────────── practice hub: what's due, and what's weak ───────────── */

const dueLabel = (inDays: number): string => (inDays <= 0 ? 'Due now' : inDays === 1 ? 'Tomorrow' : `In ${inDays} days`);

export function PracticeScreen() {
  const docs = useStore((s) => s.docs);
  const concepts = useStore((s) => s.concepts);
  const solved = useStore((s) => s.solved);
  const queue = reviewQueue(concepts);
  const due = queue.filter((q) => q.inDays <= 0);
  const later = queue.filter((q) => q.inDays > 0);
  const state = { concepts, solved };
  const topics = docs.flatMap((d) => d.units.flatMap((u) => u.topics));
  const quick = (id: ConceptId) => go({ name: 'session', problems: practiceFor(id, 4, seedFrom(`${dayOf()}:${id}:${Date.now() % 991}`)), title: CONCEPTS[id].title });

  return (
    <div className="screen" data-dir="0">
      <div className="topbar"><h1 style={{ fontSize: 24 }}>Practice</h1></div>
      <div className="scroll">
        <div className="stagger" style={{ padding: '2px 20px 26px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <LeraSays
            size={56}
            mood={due.length ? 'idle' : 'proud'}
            text={due.length ? `**${due.length}** ${due.length === 1 ? 'idea is' : 'ideas are'} ready to come back. A gap clears after two clean solves on different days.` : queue.length ? 'Nothing is due today. What you fixed is resting — it comes back when it’s about to fade.' : 'When I mark a gap in your working, it lands here and keeps coming back until it holds.'}
          />

          {due.length > 0 && (
            <section className="col" style={{ gap: 10 }}>
              <span className="label">Due now</span>
              {due.map((q) => (
                <button key={q.concept} className="card tap" onClick={() => openOverlay({ name: 'review', concept: q.concept })}>
                  <div className="row">
                    <span className={`chip ${q.kind === 'gap' ? 'gap' : q.kind === 'pattern' ? 'slip' : 'info'}`}>{q.kind === 'gap' ? 'Gap' : q.kind === 'pattern' ? 'Pattern' : 'Check-in'}</span>
                    <b className="grow" style={{ fontSize: 15 }}>{CONCEPTS[q.concept].title}</b>
                    <Icon name="chevron" size={17} />
                  </div>
                  {q.state.lastTitle && <p className="muted" style={{ fontSize: 13.5, marginTop: 6 }}><RichText text={q.state.lastTitle} /></p>}
                  <div className="row" style={{ gap: 6, marginTop: 8 }}>
                    {[0, 1].map((i) => <i key={i} className={`pip ${q.state.cleanDays.length > i ? 'on' : ''}`} />)}
                    <span className="faint" style={{ fontSize: 12.5 }}>{q.kind === 'check' ? 'One clean solve keeps it solid' : `${q.state.cleanDays.length}/2 clean days`}</span>
                  </div>
                </button>
              ))}
              <div className="center"><Button3D sheen onClick={() => go({ name: 'session', title: 'Review' })}><Icon name="refresh" size={18} /> Start review</Button3D></div>
            </section>
          )}

          {later.length > 0 && (
            <section className="col" style={{ gap: 8 }}>
              <span className="label">Coming back later</span>
              {later.map((q) => (
                <button key={q.concept} className="noticed" style={{ borderTop: 0 }} onClick={() => openOverlay({ name: 'review', concept: q.concept })}>
                  <span className={`dot ${q.status}`} />
                  <span className="grow"><b style={{ fontSize: 14.5 }}>{CONCEPTS[q.concept].title}</b></span>
                  <span className="chip plain">{dueLabel(q.inDays)}</span>
                </button>
              ))}
            </section>
          )}

          {topics.length > 0 && (
            <section className="col" style={{ gap: 8 }}>
              <span className="label">By lesson</span>
              {topics.map((t) => (
                <button key={t.id} className="noticed" style={{ borderTop: 0 }} onClick={() => go({ name: 'session', topicId: t.id })}>
                  <span className={`dot ${topicStatus(t, state)}`} />
                  <span className="grow">
                    <b style={{ fontSize: 14.5, display: 'block' }}>{t.title}</b>
                    <span className="muted" style={{ fontSize: 13 }}>{t.exercises.length ? `${t.exercises.filter((e) => solved[e.id]).length}/${t.exercises.length} from your notes solved` : 'Fresh problems'}</span>
                  </span>
                  <Icon name="play" size={15} fill />
                </button>
              ))}
            </section>
          )}

          <section className="col" style={{ gap: 8 }}>
            <span className="label">Any idea, any time</span>
            <div className="idea-grid">
              {ALL_CONCEPTS.map((id) => (
                <button key={id} className={`idea ${statusOf(concepts[id])}`} onClick={() => quick(id)}>
                  {CONCEPTS[id].title}
                </button>
              ))}
            </div>
          </section>
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
    <div className="sig" role="img" aria-label={`Marks per day over the last ${days.length} days of practice`}>
      {days.map((d, i) => (
        <div key={d.day} className="sig-col" title={`${d.day}: ${d.gaps} gaps, ${d.slips} slips, ${d.solved}/${d.problems} solved`}>
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
  const [openId, setOpenId] = useState<string | null>(null);
  const days = streak(attempts);
  const solved = attempts.filter((a) => a.verdict === 'solved').length;
  const clean = attempts.filter((a) => a.verdict === 'solved' && a.marks.length === 0 && a.hintRung < 3).length;
  const notes = insights({ attempts, concepts });
  const known = Object.values(concepts).filter((c) => !!c);
  const order = { gap: 0, shaky: 1, solid: 2, new: 3 } as const;
  const sorted = [...known].sort((a, b) => order[statusOf(a)] - order[statusOf(b)]);
  const approaches = new Map<string, number>();
  attempts.forEach((a) => a.approach && approaches.set(a.approach, (approaches.get(a.approach) ?? 0) + 1));
  const topApproaches = [...approaches.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const totalApproach = topApproaches.reduce((s, [, n]) => s + n, 0);
  const gaps = attempts.reduce((s, a) => s + a.marks.filter((m) => m.severity === 'gap').length, 0);
  const slips = attempts.reduce((s, a) => s + a.marks.filter((m) => m.severity === 'slip').length, 0);

  return (
    <div className="screen" data-dir="0">
      <div className="topbar">
        <h1 style={{ fontSize: 24 }}>Progress</h1>
        <button className="iconbtn" onClick={() => go({ name: 'settings' })} aria-label="Settings"><Icon name="gear" /></button>
      </div>
      <div className="scroll">
        {attempts.length === 0 ? (
          <div className="center" style={{ gap: 14, padding: '60px 30px' }}>
            <Lera size={104} mood="curious" />
            <h2 style={{ fontSize: 21 }}>Nothing to analyse yet</h2>
            <p className="muted" style={{ lineHeight: 1.5 }}>Solve a few problems and this page fills in: where your working breaks, which ideas are shaky, and how you tend to approach things.</p>
            <Button3D onClick={() => go({ name: 'practice' })}>Go to Practice</Button3D>
          </div>
        ) : (
          <div className="stagger" style={{ padding: '2px 20px 26px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="row" style={{ gap: 10 }}>
              <div className="stat grow"><b><CountUp to={days} /></b><span>day streak</span></div>
              <div className="stat grow"><b><CountUp to={solved} /></b><span>solved</span></div>
              <div className="stat grow"><b><CountUp to={solved ? Math.round((clean / solved) * 100) : 0} suffix="%" /></b><span>clean</span></div>
            </div>

            <section className="card">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="label">Your error signature</span>
                <span className="row" style={{ gap: 10, fontSize: 12.5 }}>
                  <span className="row" style={{ gap: 4 }}><i className="lg gapbar" /> Gaps {gaps}</span>
                  <span className="row" style={{ gap: 4 }}><i className="lg slipbar" /> Slips {slips}</span>
                </span>
              </div>
              <Signature attempts={attempts} />
              <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.45 }}>A <b>gap</b> is a rule you don’t have yet — it gets a review. A <b>slip</b> is a rule you have but fumbled — it just gets noticed.</p>
            </section>

            {notes.length > 0 && (
              <section className="col" style={{ gap: 8 }}>
                <span className="label">What I’ve noticed about how you work</span>
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
                <span className="label">Knowledge map</span>
                {sorted.map((c) => {
                  const st = statusOf(c);
                  return (
                    <button key={c.id} className="kmap" onClick={() => openOverlay({ name: 'review', concept: c.id })}>
                      <span className={`dot ${st}`} />
                      <span className="grow">
                        <b>{CONCEPTS[c.id].title}</b>
                        <Bar value={confidence(c)} tone={`thin ${st === 'solid' ? 'ok' : ''}`} label="Confidence" />
                      </span>
                      <span className="faint" style={{ fontSize: 12.5, minWidth: 64, textAlign: 'right' }}>
                        {c.gaps ? `${c.gaps} gap${c.gaps > 1 ? 's' : ''}` : c.slips ? `${c.slips} slip${c.slips > 1 ? 's' : ''}` : `${c.clean} clean`}
                      </span>
                    </button>
                  );
                })}
              </section>
            )}

            {topApproaches.length > 0 && (
              <section className="card">
                <span className="label">How you approach problems</span>
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
              <span className="label">Recent working</span>
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
                            <span className={`mark ${l.status === 'ok' || l.status === 'recovered' ? 'ok static' : l.status === 'wrong' ? (l.severity === 'slip' ? 'slip' : 'gap') : l.status === 'carried' ? 'carried' : 'none'}`}>
                              {(l.status === 'ok' || l.status === 'recovered') && <Icon name="check" size={13} stroke={3.4} />}
                            </span>
                          </div>
                        </li>
                      ))}
                      {a.marks.map((m, i) => (
                        <p key={i} className="muted" style={{ fontSize: 13.5, padding: '4px 0 0 34px' }}>
                          <span className={`chip ${m.severity === 'gap' ? 'gap' : 'slip'}`} style={{ marginRight: 6 }}>Line {m.line + 1}</span>
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
