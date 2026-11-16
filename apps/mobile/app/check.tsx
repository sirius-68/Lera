import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { analyze, cleanPath } from '@core/engine/analyze';
import { practiceFor } from '@core/engine/generate';
import { Button3D } from '@/components/Button3D';
import { Lera, Mood } from '@/components/Lera';
import { C } from '@/components/theme';

const plain = (s: string): string => s.replace(/\*\*|\$/g, '');

/**
 * One problem, checked line by line by the same engine as the web build, running on the phone.
 * This is the proof that Lera's logic carries over unchanged; the real practice screen (box keyboard,
 * hints, summaries) is phase 5 of MIGRATION.md.
 */
export default function Check() {
  const [seed, setSeed] = useState(7);
  const problem = useMemo(() => practiceFor('inverse-operations', 1, seed)[0], [seed]);
  const [lines, setLines] = useState<string[]>([]);
  const [text, setText] = useState('');
  const result = useMemo(() => analyze(problem, lines), [problem, lines]);
  const solved = result.verdict === 'solved';
  const last = result.lines[result.lines.length - 1];
  const mood: Mood = solved ? 'happy' : last?.status === 'wrong' ? 'oops' : lines.length ? 'thinking' : 'idle';
  const answer = useMemo(() => cleanPath(problem), [problem]);

  const add = () => {
    const t = text.trim();
    if (!t) return;
    setLines([...lines, t]);
    setText('');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.top}>
          <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Back"><Text style={styles.backText}>‹</Text></Pressable>
          <Text style={styles.h}>Checked on this phone</Text>
          <Lera size={44} mood={mood} />
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.label}>{problem.prompt}</Text>
            <Text style={styles.given}>{problem.given}</Text>
          </View>
          {result.lines.map((l, i) => (
            <Animated.View key={`${i}:${l.text}`} entering={FadeInDown.duration(250)} layout={LinearTransition} style={[styles.line, l.status === 'wrong' ? styles.bad : l.status === 'ok' || l.status === 'recovered' ? styles.good : null]}>
              <Text style={styles.n}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.math}>{l.text}</Text>
                {l.diag && <Text style={styles.diag}><Text style={{ fontWeight: '700' }}>{plain(l.diag.title)} </Text>{plain(l.diag.message)}</Text>}
                {l.note && !l.diag && <Text style={styles.diag}>{l.note}</Text>}
              </View>
              <Text style={[styles.mark, { color: l.status === 'wrong' ? C.gap : C.ok }]}>{l.status === 'wrong' ? '✕' : l.status === 'ok' || l.status === 'recovered' ? '✓' : '·'}</Text>
            </Animated.View>
          ))}
          {solved ? (
            <Animated.View entering={FadeInDown} style={styles.done}>
              <Text style={styles.doneText}>Solved in {result.steps} {result.steps === 1 ? 'line' : 'lines'}{result.approach ? ` · ${result.approach}` : ''}</Text>
            </Animated.View>
          ) : (
            <View style={styles.entry}>
              <TextInput
                style={styles.input}
                value={text}
                onChangeText={setText}
                onSubmitEditing={add}
                placeholder={lines.length ? 'Next line…' : 'Write your first line, e.g. 3x = 15'}
                placeholderTextColor={C.ink3}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
              />
            </View>
          )}
          {!solved && result.remaining && lines.length > 0 && <Text style={styles.hint}>{result.remaining}</Text>}
          {!solved && lines.length >= 3 && answer.length > 0 && <Text style={styles.hint}>The shortest route ends at: {answer[answer.length - 1].line}</Text>}
        </ScrollView>
        <View style={styles.foot}>
          {solved ? (
            <Button3D tone="ok" label="Another one" onPress={() => { setSeed(seed + 1); setLines([]); }} />
          ) : (
            <Button3D label="Check this line" disabled={!text.trim()} onPress={add} />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg2 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 26, lineHeight: 28, color: C.ink },
  h: { flex: 1, fontSize: 18, fontWeight: '700', color: C.ink },
  body: { padding: 16, gap: 10 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 16, borderWidth: 2, borderColor: C.line },
  label: { fontSize: 14, color: C.ink2 },
  given: { fontSize: 24, color: C.ink, marginTop: 4, fontFamily: Platform.select({ ios: 'Times New Roman', default: 'serif' }) },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#fff', borderRadius: 16, padding: 12, borderWidth: 2, borderColor: C.line },
  good: { borderColor: '#BFE9D1', backgroundColor: '#F1FBF5' },
  bad: { borderColor: '#F6C7C8', backgroundColor: '#FFF5F5' },
  n: { width: 18, fontSize: 13, color: C.ink3, marginTop: 4 },
  math: { fontSize: 20, color: C.ink, fontFamily: Platform.select({ ios: 'Times New Roman', default: 'serif' }) },
  diag: { fontSize: 14, lineHeight: 20, color: C.ink2, marginTop: 6 },
  mark: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  entry: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 2, borderColor: C.brand, paddingHorizontal: 14 },
  input: { height: 52, fontSize: 19, color: C.ink },
  hint: { fontSize: 13.5, color: C.ink2, paddingHorizontal: 4 },
  done: { backgroundColor: '#E6F7EE', borderRadius: 16, padding: 14 },
  doneText: { fontSize: 16, fontWeight: '700', color: '#17794A' },
  foot: { padding: 16, paddingTop: 8 },
});
