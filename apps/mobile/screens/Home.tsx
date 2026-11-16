import { LinearGradient } from 'expo-linear-gradient';
import { t, tn } from '@core/i18n';
import { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { CONCEPTS } from '@core/engine/concepts';
import { levelOf, totalXp, weekStrip, xpByDay } from '@core/store/game';
import { dailyQuests } from '@core/store/insights';
import { dayOf, docMastery, dueNow, findTopic, streak, topicMastery } from '@core/store/learner';
import { weaknesses } from '@core/store/weakness';
import { act, go, openOverlay, useApp } from '../host/link';
import { Lera, Mood } from '../mascot/Lera';
import { Bar, Button3D, Chip, Icon, Label, Raised, Rich, Ring, row, T, Tap } from '../ui/kit';
import { C } from '../ui/theme';
import { Card, IconBtn, Rise, TopBar, WeakCard } from './parts';

const hello = (): string => {
  const h = new Date().getHours();
  return t(h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
};

export function HomeScreen() {
  const profile = useApp((s) => s.profile);
  const docs = useApp((s) => s.docs);
  const concepts = useApp((s) => s.concepts);
  const solved = useApp((s) => s.solved);
  const attempts = useApp((s) => s.attempts);
  const read = useApp((s) => s.read);
  const understood = useApp((s) => s.understood);
  const events = useApp((s) => s.events);
  const kept = useApp((s) => s.saved.length + s.notes.length + s.highlights.length);
  const chatCount = useApp((s) => Object.values(s.chats).filter((t) => t.length).length);
  const lastTopicId = useApp((s) => s.lastTopicId);
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
  const weak = useMemo(() => weaknesses({ attempts, concepts, docs, understood })[0], [attempts, concepts, docs, understood]);
  const quests = useMemo(() => dailyQuests({ attempts, concepts, profile, events, read }), [attempts, concepts, profile, events, read]);

  let mood: Mood = 'idle';
  let line: string;
  if (docs.length === 0) {
    line = 'Give me your notes and I’ll turn them into lessons and practice.';
    mood = 'curious';
  } else if (xpToday >= goal) {
    line = 'Goal reached. Anything more today is a bonus.';
    mood = 'cool';
  } else if (!doneToday && days > 0 && new Date().getHours() >= 19) {
    line = t('Your **{n}-day streak** ends tonight. One problem saves it.', { n: days });
    mood = 'sad';
  } else if (due.length > 0) {
    line = t(due.length > 1 ? '**{idea}** is ready to come back, and {n} more.' : '**{idea}** is ready to come back.', { idea: t(CONCEPTS[due[0].concept].title), n: due.length - 1 });
    mood = 'determined';
  } else if (doneToday) {
    line = t('{n} XP to today’s goal. One or two more problems.', { n: goal - xpToday });
    mood = days >= 3 ? 'fired' : 'happy';
  } else if (attempts.length === 0) {
    line = 'Your notes are ready. Read a lesson, then show me your working.';
  } else {
    line = days > 1 ? t('Day {n}. Shall we keep it going?', { n: days }) : 'Ready when you are.';
    mood = days >= 3 ? 'fired' : 'idle';
  }

  const start = () => {
    if (due.length > 0) go({ name: 'session', title: 'Review' });
    else if (last) go({ name: 'session', topicId: last.topic.id });
    else go({ name: 'upload' });
  };
  const lastMastery = last ? topicMastery(last.topic, state) : 0;
  let i = 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <TopBar title={profile.name || t('Welcome')} small={hello()}>
        <Tap onPress={() => go({ name: 'streak' })} label={`${days}-day streak`} scale={0.92}>
          {doneToday ? (
            <View style={{ marginBottom: 2 }}>
              <View style={{ position: 'absolute', left: 0, right: 0, top: 2, bottom: -2, borderRadius: 999, backgroundColor: C.flameD }} />
              <LinearGradient colors={['#ffb347', C.flame]} style={[row(5), { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999 }]}>
                <Icon name="flame" size={17} fill color="#fff" /><T w={700} s={14.5} c="#fff">{days}</T>
              </LinearGradient>
            </View>
          ) : (
            <View style={[row(5), { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#fff3df' }]}>
              <Icon name="flame" size={17} fill color="#d97a00" /><T w={700} s={14.5} c="#d97a00">{days}</T>
            </View>
          )}
        </Tap>
        <IconBtn name="gear" label="Settings" onPress={() => go({ name: 'settings' })} />
      </TopBar>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 4, paddingHorizontal: 18, paddingBottom: 26, gap: 14 }}>
        <Rise i={i++}>
          <View style={{ marginBottom: 5 }}>
          <View style={{ position: 'absolute', left: 0, right: 0, top: 5, bottom: -5, borderRadius: 26, backgroundColor: C.brandDD }} />
          <LinearGradient colors={['#8f88ff', C.brand, '#4b43c9']} locations={[0, 0.48, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 26, padding: 16, overflow: 'hidden' }}>
            <View style={{ position: 'absolute', width: 190, height: 190, borderRadius: 95, right: -60, top: -70, backgroundColor: 'rgba(255,255,255,0.08)' }} />
            <View style={{ position: 'absolute', width: 120, height: 120, borderRadius: 60, right: 40, bottom: -70, backgroundColor: 'rgba(255,255,255,0.08)' }} />
            <View style={row(12)}>
              <View style={{ width: 94, height: 94, borderRadius: 47, backgroundColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 83, height: 83, borderRadius: 42, backgroundColor: 'rgba(255,255,255,0.96)', alignItems: 'center', justifyContent: 'center' }}>
                  <Lera size={62} mood={mood} sleepAfter={30000} />
                </View>
              </View>
              <View style={{ flex: 1, paddingVertical: 11, paddingHorizontal: 13, borderRadius: 16, borderBottomLeftRadius: 4, backgroundColor: 'rgba(255,255,255,0.96)', boxShadow: '0px 3px 0px rgba(40,30,120,0.2)' }}>
                <Rich text={line} s={14.5} lh={20} />
              </View>
            </View>
            <View style={[row(12), { marginTop: 14, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 18, backgroundColor: 'rgba(20,14,90,0.22)' }]}>
              <Ring value={Math.min(1, xpToday / goal)} size={62} stroke={7} color="#fff" track="rgba(255,255,255,0.25)"><T w={700} s={15} c="#fff">{xpToday}</T></Ring>
              <View style={{ flex: 1 }}>
                <T w={700} s={15.5} c="#fff">{xpToday >= goal ? 'Daily goal done' : 'Today’s goal'}</T>
                <T s={12.5} c="rgba(255,255,255,0.85)">{t('{a} / {b} XP · Level {level} {title}', { a: xpToday, b: goal, level: lv.level, title: t(lv.title) })}</T>
                <View style={{ flexDirection: 'row', gap: 4, marginTop: 7, maxWidth: 190 }}>
                  {week.map((d) => (
                    <View key={d.day} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                      <T w={600} s={9.5} lh={12} c="rgba(255,255,255,0.8)">{d.label}</T>
                      <View style={{ width: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: d.active ? '#fff' : 'rgba(255,255,255,0.18)', borderWidth: d.today ? 2 : 0, borderColor: 'rgba(255,255,255,0.8)' }}>
                        {d.active && <Icon name="check" size={10} stroke={4} color={C.brandD} />}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </View>
            <Raised onPress={start} haptic={8} edge="rgba(20,14,90,0.35)" depth={4} radius={999} style={[row(8), { justifyContent: 'center', minHeight: 50, backgroundColor: '#fff', marginTop: 12 }]}>
              <Icon name={docs.length === 0 ? 'upload' : 'play'} size={17} fill={docs.length > 0} color={C.brandD} />
              <T w={700} s={16} c={C.brandD}>{docs.length === 0 ? 'Upload your notes' : due.length > 0 ? tn(due.length, 'Review {n} due idea', 'Review {n} due ideas') : attempts.length ? 'Continue practising' : 'Start practising'}</T>
            </Raised>
          </LinearGradient>
          </View>
        </Rise>

        {docs.length > 0 && (
          <Rise i={i++}>
            <Card style={{ gap: 10 }}>
              <View style={[row(), { justifyContent: 'space-between' }]}>
                <Label>Today’s quests</Label>
                <Chip tone="plain">{quests.filter((q) => q.done >= q.of).length}/{quests.length}</Chip>
              </View>
              {quests.map((q) => {
                const done = q.done >= q.of;
                return (
                  <View key={q.id} style={row(12)}>
                    <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: done ? '#2fbf71' : C.tint, alignItems: 'center', justifyContent: 'center', transform: [{ scale: done ? 1.06 : 1 }] }}>
                      <Icon name={done ? 'check' : q.icon} size={17} stroke={done ? 3.2 : 2} color={done ? '#fff' : C.brandD} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <T w={700} s={14.5} lh={18} c={done ? C.ink3 : C.ink} style={done ? { textDecorationLine: 'line-through' } : undefined}>{q.title}</T>
                      <View style={{ marginTop: 5 }}><Bar value={q.done / q.of} tone={done ? 'thin ok' : 'thin'} /></View>
                    </View>
                    <T w={700} s={12.5} c={C.ink3}>{q.done}/{q.of}</T>
                  </View>
                );
              })}
            </Card>
          </Rise>
        )}

        {weak && (
          <Rise i={i++} style={{ gap: 8 }}>
            <View style={[row(), { justifyContent: 'space-between' }]}>
              <Label>Fix this first</Label>
              <Pressable onPress={() => go({ name: 'progress' })} hitSlop={8}><T w={600} s={13.5} c={C.brand}>All weak spots</T></Pressable>
            </View>
            <WeakCard w={weak} />
          </Rise>
        )}

        {last && (
          <Rise i={i++}>
            <Card style={{ borderColor: '#d9d6ff', boxShadow: '0px 3px 0px #d9d6ff', marginBottom: 3 }}>
              <Label>{attempts.length || Object.keys(solved).length ? 'Continue' : 'Start here'}</Label>
              <View style={[row(14), { marginTop: 8 }]}>
                <Ring value={lastMastery} size={58}>{`${Math.round(lastMastery * 100)}%`}</Ring>
                <View style={{ flex: 1 }}>
                  <T w={700} s={17} lh={21}>{last.topic.title}</T>
                  <T s={13.5} c={C.ink2} style={{ marginTop: 2 }}>{last.unit.title} · {last.topic.exercises.length ? tn(last.topic.exercises.length, '{n} exercise', '{n} exercises') : t('reading')}</T>
                </View>
              </View>
              <View style={[row(10), { marginTop: 14 }]}>
                <Button3D small icon="book" variant={last.topic.exercises.length ? 'secondary' : 'primary'} style={{ flex: 1 }} onPress={() => go({ name: 'lesson', topicId: last.topic.id })}>Read</Button3D>
                {last.topic.exercises.length > 0 && <Button3D small icon="pencil" style={{ flex: 1 }} onPress={() => go({ name: 'session', topicId: last.topic.id })}>Practise</Button3D>}
              </View>
            </Card>
          </Rise>
        )}

        <Rise i={i++} style={{ gap: 10 }}>
          {[
            [
              { key: 'streak', icon: 'flame', fill: true, bg: C.flameBg, fg: C.flame, title: tn(days, '{n} day', '{n} days'), sub: 'Streak & badges', run: () => go({ name: 'streak' }) },
              { key: 'saved', icon: 'bookmark', fill: true, bg: C.goldBg, fg: '#c98f00', title: String(kept), sub: 'Notebook', run: () => go({ name: 'saved' }) },
            ],
            [
              { key: 'ask', icon: 'chat', fill: false, bg: C.infoBg, fg: C.info, title: 'Ask Lera', sub: chatCount ? tn(chatCount, '{n} saved chat', '{n} saved chats') : 'Any question', run: () => openOverlay({ name: 'ask' }) },
              { key: 'add', icon: 'plus', fill: false, bg: C.tint, fg: C.brand, title: 'Add', sub: 'New notes', run: () => go({ name: 'upload' }) },
            ],
          ].map((pair, r) => (
            <View key={r} style={{ flexDirection: 'row', gap: 10 }}>
              {pair.map((t) => (
                <View key={t.key} style={{ flex: 1 }}>
                  <Raised onPress={t.run} haptic={5} radius={20} style={{ padding: 12, backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.line, gap: 2 }}>
                    <View style={row(10)}>
                      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}><Icon name={t.icon} size={22} fill={t.fill} color={t.fg} /></View>
                      <T w={700} s={16} style={{ flex: 1 }} numberOfLines={1}>{t.title}</T>
                    </View>
                    <T s={12} c={C.ink2}>{t.sub}</T>
                  </Raised>
                </View>
              ))}
            </View>
          ))}
        </Rise>

        {docs.length > 0 && (
          <Rise i={i++}>
            <Label>Your notes</Label>
            <View style={{ gap: 10, marginTop: 8 }}>
              {docs.map((d) => {
                const m = docMastery(d, state);
                return (
                  <Raised key={d.id} onPress={() => { act('setActiveDoc', d.id); go({ name: 'lessons' }); }} style={{ backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.line, padding: 16 }}>
                    <View style={row()}>
                      <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' }}><Icon name="file" size={20} color={C.brand} /></View>
                      <View style={{ flex: 1 }}>
                        <T w={700} s={15.5}>{d.title}</T>
                        <T s={13} c={C.ink2}>{tn(d.units.reduce((n, u) => n + u.topics.length, 0), '{n} lesson · {p}% mastered', '{n} lessons · {p}% mastered', { p: Math.round(m * 100) })}</T>
                      </View>
                      <Icon name="chevron" size={18} />
                    </View>
                    <View style={{ marginTop: 10 }}><Bar value={m} tone="thin" /></View>
                  </Raised>
                );
              })}
            </View>
          </Rise>
        )}
      </ScrollView>
    </View>
  );
}
