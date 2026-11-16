import { createElement, memo, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Line, Path, Polygon, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { buzz } from '../host/phone';
import data from './moods.json';

/**
 * Lera, drawn natively.
 *
 * Her 50 moods are not redrawn by hand: scripts/gen-lera.mjs copies each one from the web mascot
 * (src/mascot/Lera.tsx) into mascot/moods.json as a list of shapes, each tagged with the part it
 * belongs to. Here those parts are given life: the body breathes, the eyes blink (sometimes twice),
 * what floats around her drifts, and a tap makes her hop and react.
 */
/** Every mood she has; the names are the web mascot's. */
export type Mood = keyof (typeof data)['moods'];

type Shape = [part: 's' | 'b' | 'e' | 'f', type: string, attrs: Record<string, string | number>];
const MOODS = (data as unknown as { moods: Record<string, Shape[]> }).moods;
const TAGS: Record<string, unknown> = { path: Path, rect: Rect, circle: Circle, ellipse: Ellipse, line: Line, polygon: Polygon, polyline: Polyline, text: SvgText };
const AnimatedG = Animated.createAnimatedComponent(G);

const draw = (shapes: Shape[], from: number) =>
  shapes.map(([, type, a], i) => {
    const { text, ...attrs } = a;
    return createElement(TAGS[type] as typeof Path, { key: from + i, ...attrs } as never, text as never);
  });

/** What a tap turns her into, in turn (the web mascot cycles the same way). */
const ON_TAP: Mood[] = ['happy', 'wink', 'curious', 'laugh', 'love', 'starstruck'];
/** Moods that are a moment, not a state: afterwards she goes back to looking around. */
const BRIEF = new Set<string>(['happy', 'celebrate', 'laugh', 'wink', 'clap', 'thumbsup']);
const BOUNCY = new Set<string>(['happy', 'celebrate', 'party', 'laugh', 'clap', 'fired', 'strong', 'starstruck', 'eureka']);
const SHAKY = new Set<string>(['oops', 'angry', 'scared', 'nervous', 'frozen', 'shocked']);

interface Props {
  size?: number;
  mood?: Mood;
  interactive?: boolean;
  /** Milliseconds of being left alone before she dozes off. 0 = never. */
  sleepAfter?: number;
  onTap?: () => void;
}

export const Lera = memo(function Lera({ size = 96, mood = 'idle', interactive = true, sleepAfter = 0, onTap }: Props) {
  const [reaction, setReaction] = useState<Mood | null>(null);
  const [asleep, setAsleep] = useState(false);
  const [settled, setSettled] = useState(false);
  const taps = useRef(0);
  const shown: string = asleep ? 'sleepy' : reaction ?? (settled && BRIEF.has(mood) ? 'idle' : mood);
  const shapes = MOODS[shown] ?? MOODS.idle;

  const breath = useSharedValue(0);
  const lid = useSharedValue(1);
  const hop = useSharedValue(0);
  const bounce = useSharedValue(0);
  const shake = useSharedValue(0);
  const drift = useSharedValue(0);

  useEffect(() => {
    breath.value = withRepeat(withTiming(1, { duration: shown === 'sleepy' ? 2600 : 1900, easing: Easing.inOut(Easing.quad) }), -1, true);
    drift.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }), -1, true);
    const shut = (ms: number) => withDelay(ms, withSequence(withTiming(0.08, { duration: 70 }), withTiming(1, { duration: 100 })));
    lid.value = 1;
    lid.value = withRepeat(withSequence(shut(2700), shut(3400), shut(180)), -1);
    return () => {
      cancelAnimation(breath);
      cancelAnimation(lid);
      cancelAnimation(drift);
    };
  }, [breath, lid, drift, shown]);

  // each mood carries itself differently: the glad ones bounce, the startled ones shudder
  useEffect(() => {
    cancelAnimation(bounce);
    cancelAnimation(shake);
    bounce.value = BOUNCY.has(shown) ? withRepeat(withSequence(withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) }), withTiming(0, { duration: 520 })), -1) : withTiming(0, { duration: 200 });
    shake.value = SHAKY.has(shown) ? withSequence(withRepeat(withSequence(withTiming(1, { duration: 55 }), withTiming(-1, { duration: 55 })), 5, true), withTiming(0, { duration: 80 })) : withTiming(0, { duration: 120 });
  }, [shown, bounce, shake]);

  // a change of mood from outside wakes her
  useEffect(() => {
    setAsleep(false);
    setSettled(false);
    setReaction(null);
    if (!BRIEF.has(mood)) return;
    const id = setTimeout(() => setSettled(true), 2600);
    return () => clearTimeout(id);
  }, [mood]);

  useEffect(() => {
    if (!reaction) return;
    const id = setTimeout(() => setReaction(null), 1500);
    return () => clearTimeout(id);
  }, [reaction]);

  useEffect(() => {
    if (!sleepAfter || asleep || reaction) return;
    const id = setTimeout(() => setAsleep(true), sleepAfter);
    return () => clearTimeout(id);
  }, [sleepAfter, asleep, reaction, mood]);

  const tap = () => {
    buzz(8);
    hop.value = withSequence(withTiming(1, { duration: 150, easing: Easing.out(Easing.quad) }), withSpring(0, { damping: 9, stiffness: 220 }));
    if (asleep) {
      setAsleep(false);
      setReaction('shocked');
    } else {
      taps.current += 1;
      setReaction(taps.current % 6 === 0 ? 'confused' : ON_TAP[taps.current % ON_TAP.length]);
    }
    onTap?.();
  };

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -(hop.value * 0.14 + bounce.value * 0.07) * size },
      { translateX: shake.value * 0.025 * size },
      { scaleX: 1 - breath.value * 0.012 + hop.value * 0.03 },
      { scaleY: 1 + breath.value * 0.022 - hop.value * 0.03 },
    ],
  }));
  const fxStyle = useAnimatedStyle(() => ({ opacity: 0.75 + drift.value * 0.25, transform: [{ translateY: -drift.value * 0.035 * size }] }));
  const eyes = useAnimatedProps(() => ({ transform: [{ translateY: 40.5 * (1 - lid.value) }, { scaleY: lid.value }] }));

  // shapes in drawing order, with the eyes gathered so they can blink together
  const layers = useMemo(() => {
    const shadow = shapes.filter((s) => s[0] === 's');
    const fx = shapes.filter((s) => s[0] === 'f');
    const body: { eye: boolean; items: Shape[] }[] = [];
    for (const s of shapes) {
      if (s[0] !== 'b' && s[0] !== 'e') continue;
      const eye = s[0] === 'e';
      const last = body[body.length - 1];
      if (last && last.eye === eye) last.items.push(s);
      else body.push({ eye, items: [s] });
    }
    return { shadow, fx, body };
  }, [shapes]);

  const h = size * 1.16;
  const box = { position: 'absolute' as const, left: 0, top: 0, width: size, height: h };
  let n = 0;
  const art = (
    <View style={{ width: size, height: h }} accessibilityRole={interactive ? 'button' : 'image'} accessibilityLabel={shown === 'sleepy' ? 'Lera, asleep. Tap to wake her.' : 'Lera'}>
      <Svg viewBox={data.viewBox} width={size} height={h} style={box}>{draw(layers.shadow, 0)}</Svg>
      <Animated.View style={[box, { transformOrigin: '50% 90%' }, bodyStyle]}>
        <Svg viewBox={data.viewBox} width={size} height={h}>
          {layers.body.map((group, gi) => {
            const from = (n += 100);
            return group.eye ? <AnimatedG key={`e${gi}`} animatedProps={eyes}>{draw(group.items, from)}</AnimatedG> : <G key={`b${gi}`}>{draw(group.items, from)}</G>;
          })}
        </Svg>
      </Animated.View>
      {layers.fx.length > 0 && (
        <Animated.View style={[box, fxStyle]} pointerEvents="none">
          <Svg viewBox={data.viewBox} width={size} height={h}>{draw(layers.fx, 5000)}</Svg>
        </Animated.View>
      )}
    </View>
  );
  return interactive ? <Pressable onPress={tap} hitSlop={4}>{art}</Pressable> : art;
});
