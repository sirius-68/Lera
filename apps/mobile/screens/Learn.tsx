import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { docMastery, topicMastery, topicStatus } from '@core/store/learner';
import type { LeraDoc, Topic } from '@core/ingest/types';
import { act, go, toast, useApp } from '../host/link';
import { buzz } from '../host/phone';
import { Lera } from '../mascot/Lera';
import { Bar, Button3D, CountUp, Icon, Label, Raised, Ring, row, T } from '../ui/kit';
import { C, SPRING } from '../ui/theme';
import { Rise } from './parts';

const STATUS_LABEL = { new: 'Not started', gap: 'Has a gap', shaky: 'In progress', solid: 'Mastered' } as const;
/** How far each stop sits from the centre line, so the path winds. */
const SWAY = [0, 46, 74, 46, 0, -46, -74, -46];
const TONES = [
  { face: ['#8d86ff', '#5a52e0'], edge: C.brandDD },
  { face: ['#35c796', '#0f8a5d'], edge: '#0b6b48' },
  { face: ['#ffab4d', '#e36a00'], edge: '#b95600' },
  { face: ['#5aa6f5', '#2f7de1'], edge: '#2362b6' },
] as const;
const FACE = {
  idle: { face: ['#c9c9d6', '#b4b4c4'], edge: '#9a9aae' },
  on: { face: ['#8d86ff', C.brand], edge: C.brandDD },
  solid: { face: ['#ffd24a', C.gold], edge: '#c98f00' },
  gap: { face: ['#f08a78', C.gap], edge: '#b8402d' },
} as const;

/** The "Start" or "Continue" flag over the lesson you are on: it bobs so the eye finds it. */
function Flag({ text }: { text: string }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withRepeat(withTiming(1, { duration: 800, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [y]);
  const bob = useAnimatedStyle(() => ({ transform: [{ translateY: -y.value * 5 }] }));
  return (
    <Animated.View style={[{ position: 'absolute', top: -30, alignSelf: 'center', zIndex: 2, alignItems: 'center' }, bob]}>
      <View style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.line, boxShadow: `0px 3px 0px ${C.line}` }}>
        <T w={800} s={13} c={C.brandD} style={{ letterSpacing: 0.5, textTransform: 'uppercase' }}>{text}</T>
      </View>
      <View style={{ width: 12, height: 12, marginTop: -6, backgroundColor: '#fff', borderRightWidth: 1.5, borderBottomWidth: 1.5, borderColor: C.line, transform: [{ rotate: '45deg' }] }} />
    </Animated.View>
  );
}

function Glow() {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [p]);
  const style = useAnimatedStyle(() => ({ opacity: 0.45 + p.value * 0.55, transform: [{ scale: 1 + p.value * 0.06 }] }));
  return <Animated.View style={[{ position: 'absolute', left: -7, top: -7, right: -7, bottom: -7, borderRadius: 60, borderWidth: 3, borderColor: C.tint2 }, style]} />;
}

function Stop({ t, sway, here, seen, m, st, solvedN }: { t: Topic; sway: number; here: boolean; seen: boolean; m: number; st: keyof typeof STATUS_LABEL; solvedN: number }) {
  const look = st === 'solid' ? FACE.solid : st === 'gap' ? FACE.gap : seen || st === 'shaky' || here ? FACE.on : FACE.idle;
  const down = useSharedValue(0);
  const face = useAnimatedStyle(() => ({ transform: [{ translateY: down.value * 4 }] }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t.title}: ${STATUS_LABEL[st]}`}
      onPressIn={() => (down.value = withTiming(1, { duration: 70 }))}
      onPressOut={() => (down.value = withTiming(0, { duration: 140 }))}
      onPress={() => { buzz(6); go({ name: 'lesson', topicId: t.id }); }}
      style={{ width: 190, alignItems: 'center', gap: 6, paddingTop: 4, paddingBottom: 10, marginTop: here ? 26 : 0, transform: [{ translateX: sway }] }}
    >
      {here && <Flag text={st === 'new' && !seen ? 'Start' : 'Continue'} />}
      <View style={{ width: 78, height: 78, alignItems: 'center', justifyContent: 'center' }}>
        {here && <Glow />}
        <Svg width={78} height={78} viewBox="0 0 80 80" style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
          <Circle cx={40} cy={40} r={36} fill="none" stroke={C.line} strokeWidth={6} />
          {m > 0 && <Circle cx={40} cy={40} r={36} fill="none" stroke={st === 'solid' ? C.ok : C.gold} strokeWidth={6} strokeLinecap="round" strokeDasharray={`${226 * m} 226`} />}
        </Svg>
        <View style={{ marginBottom: 5 }}>
          <View style={{ position: 'absolute', left: 0, right: 0, top: 5, bottom: -5, borderRadius: 29, backgroundColor: look.edge }} />
          <Animated.View style={[{ borderRadius: 29 }, face]}>
          <LinearGradient colors={look.face} style={{ width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={st === 'solid' ? 'check' : st === 'gap' ? 'target' : t.exercises.length ? 'pencil' : 'book'} size={st === 'solid' ? 28 : 25} stroke={st === 'solid' ? 3.2 : 2} color="#fff" />
          </LinearGradient>
          </Animated.View>
        </View>
      </View>
      <View style={{ alignItems: 'center' }}>
        <T w={700} s={14.5} lh={18} center>{t.title}</T>
        <T s={12.5} c={C.ink2} center>{t.exercises.length ? `${solvedN}/${t.exercises.length} solved` : 'Reading'}{st === 'gap' ? ' · gap' : ''}</T>
      </View>
    </Pressable>
  );
}

function Chevron({ open }: { open: boolean }) {
  const r = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    r.value = withSpring(open ? 1 : 0, SPRING);
  }, [open, r]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value * 180}deg` }] }));
  return (
    <Animated.View style={[{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }, style]}>
      <Icon name="down" size={18} color="#fff" />
    </Animated.View>
  );
}

export function LessonsScreen() {
  const insets = useSafeAreaInsets();
  const docs = useApp((s) => s.docs);
  const activeDocId = useApp((s) => s.activeDocId);
  const concepts = useApp((s) => s.concepts);
  const solved = useApp((s) => s.solved);
  const read = useApp((s) => s.read);
  const kept = useApp((s) => s.saved.length + s.notes.length + s.highlights.length);
  const lastTopicId = useApp((s) => s.lastTopicId);
  const doc: LeraDoc | undefined = docs.find((d) => d.id === activeDocId) ?? docs[0];
  const state = { concepts, solved };
  // a long book shows one chapter at a time; the others fold down to their banner
  const [openUnits, setOpenUnits] = useState<Record<string, boolean>>({});

  if (!doc) {
    return (
      <View style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 30 }}>
        <Lera size={104} mood="curious" />
        <T w={700} s={22}>No notes yet</T>
        <T c={C.ink2} lh={22} center>Upload a PDF or Word file and its headings become your learning path.</T>
        <Button3D icon="upload" onPress={() => go({ name: 'upload' })}>Upload notes</Button3D>
      </View>
    );
  }

  const mastery = docMastery(doc, state);
  const allTopics = doc.units.flatMap((u) => u.topics);
  const hereId = allTopics.some((t) => t.id === lastTopicId) ? lastTopicId : allTopics.find((t) => topicStatus(t, state) !== 'solid')?.id ?? allTopics[0]?.id;
  let n = 0;
  const big = doc.units.length > 3 || allTopics.length > 14;
  const hereUnit = doc.units.find((u) => u.topics.some((t) => t.id === hereId))?.id;
  const isOpen = (id: string): boolean => openUnits[`${doc.id}:${id}`] ?? (!big || id === hereUnit);

  const remove = () =>
    Alert.alert(`Remove “${doc.title}”?`, 'Its highlights and notes go too. Your practice history stays.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { act('removeDoc', doc.id); toast('Notes removed'); } },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <LinearGradient colors={['#7b74ff', '#6c63ff', '#5a52e0']} locations={[0, 0.55, 1]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ paddingTop: 18 + insets.top, paddingHorizontal: 20, paddingBottom: 18, borderBottomLeftRadius: 26, borderBottomRightRadius: 26 }}>
        <View style={[row(), { justifyContent: 'space-between' }]}>
          <Label color="rgba(255,255,255,0.75)">Your path</Label>
          <View style={row(8)}>
            <Pressable accessibilityLabel={`Notebook, ${kept} kept`} onPress={() => go({ name: 'saved' })} hitSlop={6} style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}><Icon name="bookmark" size={17} color="#fff" /></Pressable>
            <Pressable accessibilityLabel="Add notes" onPress={() => go({ name: 'upload' })} hitSlop={6} style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={18} color="#fff" /></Pressable>
          </View>
        </View>
        <T w={700} s={26} lh={31} c="#fff" style={{ marginTop: 6 }}>{doc.title}</T>
        <View style={[row(12), { marginTop: 10 }]}>
          <View style={{ flex: 1 }}><Bar value={mastery} tone="onbrand" /></View>
          <View style={row(4)}><CountUp to={Math.round(mastery * 100)} suffix="%" w={700} s={14} c="#fff" /><T w={700} s={14} c="#fff">mastered</T></View>
        </View>
        {docs.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12, marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
            {docs.map((d) => (
              <Pressable key={d.id} onPress={() => act('setActiveDoc', d.id)} style={{ maxWidth: 200, paddingVertical: 7, paddingHorizontal: 13, borderRadius: 999, backgroundColor: d.id === doc.id ? '#fff' : 'rgba(255,255,255,0.16)' }}>
                <T w={600} s={13.5} c={d.id === doc.id ? C.brandD : '#fff'} numberOfLines={1}>{d.title}</T>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </LinearGradient>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 14, paddingHorizontal: 18, paddingBottom: 30, gap: 10 }}>
        {doc.warnings.map((w) => (
          <View key={w} style={[row(8), { alignItems: 'flex-start', paddingVertical: 11, paddingHorizontal: 13, borderRadius: 14, backgroundColor: C.slipBg }]}>
            <Icon name="alert" size={17} color="#7a5200" /><T s={13.5} lh={20} c="#7a5200" style={{ flex: 1 }}>{w}</T>
          </View>
        ))}
        {doc.units.map((u, ui) => {
          const um = u.topics.reduce((s, t) => s + topicMastery(t, state), 0) / Math.max(1, u.topics.length);
          const open = isOpen(u.id);
          const tone = TONES[ui % 4];
          return (
            <Rise key={u.id} i={Math.min(ui, 6)}>
              <Raised onPress={() => { buzz(5); setOpenUnits({ ...openUnits, [`${doc.id}:${u.id}`]: !open }); }} edge={tone.edge} depth={4} radius={20} style={{ opacity: open ? 1 : 0.94 }}>
                <LinearGradient colors={tone.face} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[row(12), { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 20 }]}>
                  <View style={{ flex: 1 }}>
                    <T w={700} s={11.5} c="rgba(255,255,255,0.85)" style={{ letterSpacing: 1.1, textTransform: 'uppercase' }}>{big ? 'Chapter' : 'Unit'} {ui + 1} · {u.topics.length} {u.topics.length === 1 ? 'lesson' : 'lessons'}</T>
                    <T w={700} s={17.5} lh={22} c="#fff" style={{ marginTop: 1 }}>{u.title}</T>
                  </View>
                  <Ring value={um} size={44} stroke={5} color="#fff" track="rgba(255,255,255,0.3)"><T w={700} s={11.5} c="#fff">{Math.round(um * 100)}%</T></Ring>
                  <Chevron open={open} />
                </LinearGradient>
              </Raised>
              {open && (
                <Animated.View entering={FadeIn.duration(260)} style={{ alignItems: 'center', gap: 6, paddingTop: 22, paddingBottom: 6 }}>
                  {u.topics.map((t) => (
                    <Stop key={t.id} t={t} sway={SWAY[n++ % SWAY.length]} here={t.id === hereId} seen={!!read[t.id]} m={topicMastery(t, state)} st={topicStatus(t, state)} solvedN={t.exercises.filter((e) => solved[e.id]).length} />
                  ))}
                </Animated.View>
              )}
            </Rise>
          );
        })}
        <T s={12.5} c={C.ink3} center style={{ marginTop: 6 }}>
          {doc.fileName}
          {doc.tocVia === 'outline' || doc.tocVia === 'contents' ? ' · chapters from the book’s own contents' : ''}
        </T>
        <Pressable onPress={remove} style={[row(6), { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 12 }]}>
          <Icon name="trash" size={15} color={C.ink3} /><T w={600} s={13.5} c={C.ink3}>Remove these notes</T>
        </Pressable>
      </ScrollView>
    </View>
  );
}
