import { createContext, createElement, memo, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Ellipse, Line, Path, Polygon, Polyline, Rect, Text as SvgText } from 'react-native-svg';
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

/** False where Lera is mounted but cannot be seen (a tab that is not showing): she stops moving until she can. Set by ui/kit's Keep. */
export const LeraAwake = createContext(true);

/** What she dreams of while asleep: the same five as the web mascot, in the same colours and places. */
const DREAMS = [
  { t: 'x²', x: 50, y: 8, c: '#8f88ff' },
  { t: 'π', x: 58, y: -1, c: '#ffb020' },
  { t: '∫', x: 64, y: -9, c: '#3ecf8e' },
  { t: '√x', x: 54, y: 2, c: '#ff7aa8' },
  { t: '∞', x: 62, y: -5, c: '#8f88ff' },
] as const;

/** One formula drifting up out of her head and fading, over and over, each a beat after the last. */
function Dream({ i, size }: { i: number; size: number }) {
  const d = DREAMS[i];
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(i * 1300, withRepeat(withTiming(1, { duration: 6500, easing: Easing.linear }), -1));
    return () => cancelAnimation(p);
  }, [p, i]);
  const style = useAnimatedStyle(() => {
    const v = p.value;
    const opacity = v < 0.12 ? v / 0.12 : v < 0.5 ? 1 : v < 0.75 ? 1 - (v - 0.5) / 0.25 : 0;
    const rise = Math.min(1, v / 0.75);
    return {
      opacity,
      transform: [
        { translateX: (-0.07 + rise * 0.16) * size },
        { translateY: (0.12 - rise * 0.34) * size },
        { scale: 0.5 + Math.min(1, v / 0.3) * 0.5 },
        { rotate: `${-12 + rise * 22}deg` },
      ],
    };
  });
  return (
    <Animated.Text style={[{ position: 'absolute', left: ((d.x + 12) / 86) * size - size * 0.08, top: ((d.y + 16) / 100) * size * 1.16 - size * 0.12, fontSize: Math.max(9, size * 0.17), fontWeight: '700', color: d.c }, style]}>
      {d.t}
    </Animated.Text>
  );
}

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
  // asleep she leans a little and breathes slower and deeper
  const deep = useSharedValue(0);
  const awake = useContext(LeraAwake);

  useEffect(() => {
    if (!awake) return;
    breath.value = 0;
    breath.value = withRepeat(withTiming(1, { duration: shown === 'sleepy' ? 2600 : 1900, easing: Easing.inOut(Easing.quad) }), -1, true);
    drift.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }), -1, true);
    const shut = (ms: number) => withDelay(ms, withSequence(withTiming(0.08, { duration: 70 }), withTiming(1, { duration: 100 })));
    lid.value = 1;
    lid.value = withRepeat(withSequence(shut(2700), shut(3400), shut(180)), -1);
    deep.value = withTiming(shown === 'sleepy' ? 1 : 0, { duration: 500 });
    return () => {
      cancelAnimation(breath);
      cancelAnimation(lid);
      cancelAnimation(drift);
    };
  }, [breath, lid, drift, deep, shown, awake]);

  // each mood carries itself differently: the glad ones bounce, the startled ones shudder
  useEffect(() => {
    cancelAnimation(bounce);
    cancelAnimation(shake);
    if (!awake) return;
    bounce.value = BOUNCY.has(shown) ? withRepeat(withSequence(withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) }), withTiming(0, { duration: 520 })), -1) : withTiming(0, { duration: 200 });
    shake.value = SHAKY.has(shown) ? withSequence(withRepeat(withSequence(withTiming(1, { duration: 55 }), withTiming(-1, { duration: 55 })), 5, true), withTiming(0, { duration: 80 })) : withTiming(0, { duration: 120 });
  }, [shown, bounce, shake, awake]);

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
      { rotate: `${deep.value * 4}deg` },
      { scaleX: 1 - breath.value * (0.012 + deep.value * 0.02) + hop.value * 0.03 },
      { scaleY: 1 + breath.value * (0.022 + deep.value * 0.035) - hop.value * 0.03 },
    ],
  }));
  const fxStyle = useAnimatedStyle(() => ({ opacity: 0.75 + drift.value * 0.25, transform: [{ translateY: -drift.value * 0.035 * size }] }));
  const eyes = useAnimatedStyle(() => ({ transform: [{ scaleY: lid.value }] }));

  // shapes in drawing order, with the eyes gathered so they can blink together
  const layers = useMemo(() => {
    const shadow = shapes.filter((s) => s[0] === 's');
    // asleep, what floats around her is drawn live (see Dream), not from the still copy
    const fx = shown === 'sleepy' ? [] : shapes.filter((s) => s[0] === 'f');
    const body: { eye: boolean; items: Shape[] }[] = [];
    for (const s of shapes) {
      if (s[0] !== 'b' && s[0] !== 'e') continue;
      const eye = s[0] === 'e';
      const last = body[body.length - 1];
      if (last && last.eye === eye) last.items.push(s);
      else body.push({ eye, items: [s] });
    }
    return { shadow, fx, body };
  }, [shapes, shown]);

  const h = size * 1.16;
  const box = { position: 'absolute' as const, left: 0, top: 0, width: size, height: h };
  const art = (
    <View style={{ width: size, height: h }} accessibilityRole={interactive ? 'button' : 'image'} accessibilityLabel={shown === 'sleepy' ? 'Lera, asleep. Tap to wake her.' : 'Lera'}>
      <Svg viewBox={data.viewBox} width={size} height={h} style={box}>{draw(layers.shadow, 0)}</Svg>
      <Animated.View style={[box, { transformOrigin: '50% 90%' }, bodyStyle]}>
        {layers.body.map((group, gi) =>
          group.eye ? (
            // the eyes close about their own middle line (40.5 in the drawing, 56.5% of the way down the box)
            <Animated.View key={`e${gi}`} style={[box, { transformOrigin: '50% 56.5%' }, eyes]}>
              <Svg viewBox={data.viewBox} width={size} height={h}>{draw(group.items, gi * 100)}</Svg>
            </Animated.View>
          ) : (
            <Svg key={`b${gi}`} viewBox={data.viewBox} width={size} height={h} style={box}>{draw(group.items, gi * 100)}</Svg>
          ),
        )}
      </Animated.View>
      {shown === 'sleepy' && awake && DREAMS.map((_, i) => <Dream key={i} i={i} size={size} />)}
      {layers.fx.length > 0 && (
        <Animated.View style={[box, fxStyle]} pointerEvents="none">
          <Svg viewBox={data.viewBox} width={size} height={h}>{draw(layers.fx, 5000)}</Svg>
        </Animated.View>
      )}
    </View>
  );
  return interactive ? <Pressable onPress={tap} hitSlop={4}>{art}</Pressable> : art;
});
