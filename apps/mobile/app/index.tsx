import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button3D } from '@/components/Button3D';
import { Lera } from '@/components/Lera';
import { C } from '@/components/theme';

/** Welcome. The first native screen: phase 1 of MIGRATION.md proves the stack, phase 2 brings the full onboarding. */
export default function Welcome() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.hero}>
        {[210, 300, 400].map((d) => (
          <View key={d} style={[styles.ring, { width: d, height: d, borderRadius: d / 2 }]} />
        ))}
        <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.halo}>
          <Lera size={132} mood="happy" />
        </Animated.View>
      </View>
      <Animated.View entering={FadeInDown.delay(150).duration(500)} style={styles.sheet}>
        <Text style={styles.title}>A maths tutor that reads your working</Text>
        <Text style={styles.sub}>Line by line, until it sticks.</Text>
        <View style={{ height: 10 }} />
        <Button3D label="Try a problem" onPress={() => router.push('/check')} />
        <Text style={styles.note}>Native preview. The full app is still the Android build from the android-apk branch.</Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ring: { position: 'absolute', borderWidth: 2, borderColor: 'rgba(108,99,255,0.28)', borderStyle: 'dashed' },
  halo: { width: 190, height: 190, borderRadius: 95, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' },
  sheet: { paddingHorizontal: 24, paddingBottom: 22, gap: 8 },
  title: { fontSize: 30, lineHeight: 34, fontWeight: '800', color: C.ink, textAlign: 'center', letterSpacing: -0.5 },
  sub: { fontSize: 17, color: C.ink2, textAlign: 'center' },
  note: { fontSize: 12.5, color: C.ink3, textAlign: 'center', marginTop: 8 },
});
