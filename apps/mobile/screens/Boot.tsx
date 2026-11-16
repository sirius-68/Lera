import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import { Lera } from '../mascot/Lera';
import { Button3D, T } from '../ui/kit';
import { C } from '../ui/theme';

/** A ring that swells out from behind her and fades, again and again. */
function Ripple({ delay }: { delay: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }), -1));
  }, [p, delay]);
  const style = useAnimatedStyle(() => ({ opacity: 0.5 * (1 - p.value), transform: [{ scale: 0.6 + p.value * 1.5 }] }));
  return <Animated.View style={[styles.ring, style]} />;
}

/**
 * What is on screen while the app starts: Lera arrives with a small bounce and rings spread out behind her.
 * Everything here moves on the phone's drawing thread, so it stays smooth while the rest of the app loads.
 * When the app is ready it lifts away (`leaving`), rather than being cut.
 */
export function Boot({ leaving, slow, onRetry, onGone }: { leaving: boolean; slow: boolean; onRetry: () => void; onGone: () => void }) {
  const arrive = useSharedValue(0);
  const out = useSharedValue(0);
  useEffect(() => {
    arrive.value = withSpring(1, { damping: 11, stiffness: 150 });
  }, [arrive]);
  useEffect(() => {
    if (!leaving) return;
    out.value = withTiming(1, { duration: 420, easing: Easing.bezier(0.22, 1, 0.36, 1) });
    const id = setTimeout(onGone, 440);
    return () => clearTimeout(id);
  }, [leaving, out, onGone]);
  const screen = useAnimatedStyle(() => ({ opacity: 1 - out.value }));
  const mark = useAnimatedStyle(() => ({ transform: [{ scale: (0.7 + arrive.value * 0.3) * (1 + out.value * 0.35) }, { translateY: -out.value * 24 }] }));
  return (
    <Animated.View pointerEvents={leaving ? 'none' : 'auto'} style={[StyleSheet.absoluteFill, styles.screen, screen]}>
      <Animated.View style={[styles.mark, mark]}>
        <Ripple delay={0} />
        <Ripple delay={800} />
        <Ripple delay={1600} />
        <View style={styles.halo}><Lera size={88} mood={slow ? 'confused' : 'idle'} interactive={false} /></View>
      </Animated.View>
      {slow && (
        <Animated.View entering={FadeIn} style={styles.slow}>
          <T c={C.ink2} center>This is taking longer than it should.</T>
          <Button3D small onPress={onRetry}>Try again</Button3D>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  mark: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 150, height: 150, borderRadius: 75, borderWidth: 2, borderColor: C.brand },
  halo: { width: 150, height: 150, borderRadius: 75, backgroundColor: '#f1efff', alignItems: 'center', justifyContent: 'center' },
  slow: { position: 'absolute', bottom: '22%', left: 30, right: 30, alignItems: 'center', gap: 12 },
});
