import { useState } from 'react';
import type { Topic } from '@core/ingest/types';
import { t, tn } from '@core/i18n';
import { Pressable, ScrollView, View } from 'react-native';
import { CONCEPTS } from '@core/engine/concepts';
import { SUBJECT_LABEL, subjectOf } from '@core/engine/concepts-calc';
import { ALL_CONCEPTS, practiceFor, seedFrom } from '@core/engine/generate';
import type { ConceptId, Subject } from '@core/engine/types';
import { dayOf, reviewQueue, statusOf, topicStatus } from '@core/store/learner';
import { act, go, openOverlay, toast, useApp } from '../host/link';
import { buzz } from '../host/phone';
import { Lera } from '../mascot/Lera';
import { Button3D, Chip, Dot, Icon, Keep, Label, Raised, Rich, row, Seg, T, Tap } from '../ui/kit';
import { C } from '../ui/theme';
import { Rise, RowBtn, Says, TopBar } from './parts';

const dueLabel = (inDays: number): string => (inDays <= 0 ? t('Due now') : inDays === 1 ? t('Tomorrow') : tn(inDays, 'In {n} day', 'In {n} days'));
const IDEA = {
  new: { border: C.lineD, text: C.ink2, bg: '#fff' },
  gap: { border: C.gap, text: C.gap, bg: C.gapBg },
  shaky: { border: '#e9c877', text: '#8a5a00', bg: C.slipBg },
  solid: { border: '#a9dfc8', text: C.okD, bg: C.okBg },
} as const;

/** Everything in a lesson that can be practised: the web side counts exercises and examples and sends the ids. */
const practiceIds = (topic: Topic): string[] => topic.practice ?? topic.exercises.map((e) => e.id);

export function PracticeScreen() {
  const docs = useApp((s) => s.docs);
  const concepts = useApp((s) => s.concepts);
  const solved = useApp((s) => s.solved);
  const profile = useApp((s) => s.profile);
  const mine: Subject[] = profile.subjects?.length ? profile.subjects : ['algebra'];
  const [subject, setSubject] = useState<Subject>(mine[0]);
  const queue = reviewQueue(concepts);
  const due = queue.filter((q) => q.inDays <= 0);
  const later = queue.filter((q) => q.inDays > 0);
  const state = { concepts, solved };
  const topics = docs.flatMap((d) => d.units.flatMap((u) => u.topics));
  // Lera's own problems run from beginner to advanced; 'mixed' takes them as they come
  const [level, setLevel] = useState<'0' | '1' | '2' | '3'>('0');
  const quick = (id: ConceptId) => go({ name: 'session', problems: practiceFor(id, 4, seedFrom(`${dayOf()}:${id}:${Date.now() % 991}`), 'generated', level === '0' ? undefined : (Number(level) as 1 | 2 | 3)), title: CONCEPTS[id].title });
  const shownSubject = mine.includes(subject) ? subject : mine[0];
  const [tab, setTab] = useState<'review' | 'lessons' | 'ideas'>(queue.length ? 'review' : topics.length ? 'lessons' : 'ideas');
  const ideas = ALL_CONCEPTS.filter((id) => subjectOf(id) === shownSubject);
  const atEnd = profile.checkMode === 'end';

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <TopBar title="Practice">
        <Tap label="Change when your working is checked" scale={0.95} onPress={() => { buzz(5); act('setProfile', { checkMode: atEnd ? 'line' : 'end' }); toast(t(atEnd ? 'Checking each line as you go' : 'Checking when you finish')); }} style={[row(6), { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.tint }]}>
          <Icon name={atEnd ? 'clock' : 'check'} size={15} stroke={2.6} color={C.brandD} />
          <T w={600} s={13} c={C.brandD}>{atEnd ? 'Check at the end' : 'Check as I go'}</T>
        </Tap>
      </TopBar>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 2, paddingHorizontal: 20, paddingBottom: 26, gap: 16 }}>
        <Rise i={0}>
          <Says
            mood={due.length ? 'determined' : queue.length ? 'cool' : 'happy'}
            text={due.length ? tn(due.length, '**{n}** idea is ready to come back. A gap clears after two clean solves on different days.', '**{n}** ideas are ready to come back. A gap clears after two clean solves on different days.') : queue.length ? 'Nothing is due today. What you fixed is resting, it comes back when it’s about to fade.' : 'When I mark a gap in your working, it lands here and keeps coming back until it holds.'}
          />
        </Rise>
        <Rise i={1}>
          <Seg options={[{ id: 'review', label: `${t('Review')}${due.length ? ` · ${due.length}` : ''}` }, { id: 'lessons', label: 'My lessons' }, { id: 'ideas', label: 'Any topic' }]} value={tab} onChange={setTab} />
        </Rise>

        <Keep on={tab === 'review'} style={{ gap: 16 }}>
          {queue.length === 0 && (
            <Rise i={2} style={{ alignItems: 'center', gap: 10, paddingVertical: 26, paddingHorizontal: 10 }}>
              <Lera size={84} mood="thumbsup" interactive={false} />
              <T w={700} s={17}>Nothing to review</T>
              <T s={14} c={C.ink2} center>When I find a gap in your working, it shows up here until it holds.</T>
              <Button3D small variant="secondary" onPress={() => setTab(topics.length ? 'lessons' : 'ideas')}>Practise something</Button3D>
            </Rise>
          )}
          {due.length > 0 && (
            <Rise i={2} style={{ gap: 10 }}>
              <Label>Due now</Label>
              {due.map((q) => (
                <Raised key={q.concept} onPress={() => openOverlay({ name: 'review', concept: q.concept })} style={{ backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.line, padding: 16 }}>
                  <View style={row()}>
                    <Chip tone={q.kind === 'gap' ? 'gap' : q.kind === 'pattern' ? 'slip' : 'info'}>{q.kind === 'gap' ? 'Gap' : q.kind === 'pattern' ? 'Pattern' : 'Check-in'}</Chip>
                    <T w={700} s={15} style={{ flex: 1 }}>{CONCEPTS[q.concept].title}</T>
                    <Icon name="chevron" size={17} />
                  </View>
                  {!!q.state.lastTitle && <Rich text={q.state.lastTitle} s={13.5} c={C.ink2} style={{ marginTop: 6 }} />}
                  <View style={[row(6), { marginTop: 8 }]}>
                    {[0, 1].map((i) => <View key={i} style={{ width: 22, height: 7, borderRadius: 4, backgroundColor: q.state.cleanDays.length > i ? C.ok : C.lineD }} />)}
                    <T s={12.5} c={C.ink3}>{q.kind === 'check' ? 'One clean solve keeps it solid' : t('{n}/2 clean days', { n: q.state.cleanDays.length })}</T>
                  </View>
                </Raised>
              ))}
              <View style={{ alignItems: 'center' }}><Button3D icon="refresh" onPress={() => go({ name: 'session', title: 'Review' })}>Start review</Button3D></View>
            </Rise>
          )}
          {later.length > 0 && (
            <Rise i={3}>
              <Label>Coming back later</Label>
              <View style={{ marginTop: 8 }}>
                {later.map((q) => (
                  <RowBtn key={q.concept} onPress={() => openOverlay({ name: 'review', concept: q.concept })}>
                    <Dot status={q.status} />
                    <T w={700} s={14.5} style={{ flex: 1 }}>{CONCEPTS[q.concept].title}</T>
                    <Chip tone="plain">{dueLabel(q.inDays)}</Chip>
                  </RowBtn>
                ))}
              </View>
            </Rise>
          )}
        </Keep>

        <Keep on={tab === 'lessons'}>
          {topics.length === 0 ? (
            <View style={{ alignItems: 'center', gap: 10, paddingVertical: 26, paddingHorizontal: 10 }}>
              <Lera size={84} mood="reading" interactive={false} />
              <T w={700} s={17}>No notes yet</T>
              <T s={14} c={C.ink2} center>Upload your notes and each lesson gets its own practice.</T>
              <Button3D small icon="upload" onPress={() => go({ name: 'upload' })}>Upload notes</Button3D>
            </View>
          ) : (
            topics.map((topic) => (
              <RowBtn key={topic.id} onPress={() => go({ name: 'session', topicId: topic.id })}>
                <Dot status={topicStatus(topic, state)} />
                <View style={{ flex: 1 }}>
                  <T w={700} s={14.5}>{topic.title}</T>
                  <T s={13} c={C.ink2}>{practiceIds(topic).length ? t('{a}/{b} from your notes solved', { a: practiceIds(topic).filter((id) => solved[id]).length, b: practiceIds(topic).length }) : t('No exercises in this section yet')}</T>
                </View>
                <Icon name="play" size={15} fill />
              </RowBtn>
            ))
          )}
        </Keep>

        <Keep on={tab === 'ideas'} style={{ gap: 10 }}>
          <Seg options={[{ id: '0', label: t('All') }, { id: '1', label: t('Beginner') }, { id: '2', label: t('Medium') }, { id: '3', label: t('Advanced') }]} value={level} onChange={setLevel} />
          {mine.length > 1 && <Seg options={mine.map((s) => ({ id: s, label: SUBJECT_LABEL[s] }))} value={shownSubject} onChange={setSubject} />}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {ideas.map((id) => {
              const k = IDEA[statusOf(concepts[id])];
              return (
                <Pressable key={id} onPress={() => { buzz(5); quick(id); }} style={({ pressed }) => ({ paddingVertical: 8, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1.5, borderColor: k.border, backgroundColor: k.bg, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
                  <T w={600} s={13.5} c={k.text}>{CONCEPTS[id].title}</T>
                </Pressable>
              );
            })}
          </View>
        </Keep>
      </ScrollView>
    </View>
  );
}
