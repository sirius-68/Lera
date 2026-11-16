import { useEffect } from 'react';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

/**
 * Lera, drawn natively. The shapes are the ones the web build draws (src/mascot/Lera.tsx).
 * This first version breathes, blinks and smiles; the full set of moods is ported in phase 4 of MIGRATION.md.
 */
export type Mood = 'idle' | 'happy' | 'thinking' | 'oops';

const AnimatedG = Animated.createAnimatedComponent(G);

export function Lera({ size = 120, mood = 'idle' }: { size?: number; mood?: Mood }) {
  const breath = useSharedValue(0);
  const lid = useSharedValue(1);

  useEffect(() => {
    breath.value = withRepeat(withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.quad) }), -1, true);
    // a blink every few seconds, sometimes twice
    lid.value = withRepeat(withSequence(withDelay(2600, withTiming(0.08, { duration: 70 })), withTiming(1, { duration: 90 }), withDelay(1400, withTiming(0.08, { duration: 70 })), withTiming(1, { duration: 90 }), withDelay(160, withTiming(0.08, { duration: 60 })), withTiming(1, { duration: 90 })), -1);
  }, [breath, lid]);

  const body = useAnimatedStyle(() => ({ transform: [{ scaleX: 1 - breath.value * 0.012 }, { scaleY: 1 + breath.value * 0.024 }] }));
  const eyes = useAnimatedProps(() => ({ transform: [{ translateY: 40.5 * (1 - lid.value) }, { scaleY: lid.value }] }));
  const smiling = mood === 'happy';

  return (
    <Animated.View style={[{ width: size, height: size * 1.16 }, body]}>
      <Svg viewBox="-12 -16 86 100" width="100%" height="100%">
        <Ellipse cx={30.6} cy={76.5} rx={21} ry={3.4} fill="rgba(40,34,120,0.16)" />
        <Rect y={0.57} width={61.25} height={70} rx={30.63} fill="#6C63FF" />
        <Path d="M9 44c-1.6-9 .8-17 5-22" stroke="rgba(255,255,255,0.22)" strokeWidth={2.6} strokeLinecap="round" fill="none" />
        <Path d="M0.547 33.928C11.12 29.049 32.266 15.105 32.266 0.568 21.693 0.399-0.547 6.584 0.547 33.928Z" fill="#050505" />
        <Path d="M61.168 35.063C50.601 29.714 29.622 14.768 30.162 0.003 40.916 0.225 63.295 7.332 61.168 35.063Z" fill="#050505" />
        {smiling ? (
          <G>
            <Path d="M15.6 43.5q5.7-9.4 11.4 0" stroke="#fff" strokeWidth={3.4} strokeLinecap="round" fill="none" />
            <Path d="M33.1 43.5q5.7-9.4 11.4 0" stroke="#fff" strokeWidth={3.4} strokeLinecap="round" fill="none" />
            <Circle cx={12.6} cy={53.5} r={3.6} fill="#FF9FC0" opacity={0.8} />
            <Circle cx={48.6} cy={53.5} r={3.6} fill="#FF9FC0" opacity={0.8} />
          </G>
        ) : (
          <AnimatedG animatedProps={eyes}>
            <Rect x={15.31} y={30.1} width={12.03} height={20.78} rx={4.5} fill="#fff" />
            <Rect x={32.81} y={30.1} width={12.03} height={20.78} rx={4.5} fill="#fff" />
            <Rect x={18.59} y={mood === 'thinking' ? 34.4 : mood === 'oops' ? 39.6 : 37.76} width={6.56} height={8.75} rx={3.28} fill="#1B1B1B" />
            <Rect x={36.09} y={mood === 'thinking' ? 34.4 : mood === 'oops' ? 39.6 : 37.76} width={6.56} height={8.75} rx={3.28} fill="#1B1B1B" />
          </AnimatedG>
        )}
        {mood === 'oops' ? (
          <Path d="M23.6 61.4q3.5-3.2 7-.4t7.2-.5" stroke="#fff" strokeWidth={2.8} strokeLinecap="round" fill="none" />
        ) : mood === 'thinking' ? (
          <Path d="M27.5 60.4q5.6 1.6 11.2 0" stroke="#fff" strokeWidth={2.8} strokeLinecap="round" fill="none" />
        ) : smiling ? (
          <Path d="M18.3 56.2c6 2.3 19 2.3 24.6 0-1.6 14.6-22.6 14.6-24.6 0Z" fill="#fff" />
        ) : (
          <Path d="M19.69 57.44C22.79 58.72 31.5 60.51 41.56 57.44 32.38 68.82 23.15 62.18 19.69 57.44Z" fill="#fff" />
        )}
      </Svg>
    </Animated.View>
  );
}
