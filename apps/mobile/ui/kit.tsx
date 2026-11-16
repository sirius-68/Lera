import { LinearGradient } from 'expo-linear-gradient';
import { getLang, t } from '@core/i18n';
import { ReactNode, startTransition, useContext, useEffect, useRef, useState } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, TextProps, TextStyle, View, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { PATHS } from '@core/ui/icons';
import { buzz } from '../host/phone';
import { LeraAwake } from '../mascot/Lera';
import { C, FONT, SPRING, Weight } from './theme';

/* The native versions of the pieces in src/ui/kit.tsx, sized and coloured from the same stylesheet. */

export function T({ w = 400, s = 15, c = C.ink, lh, center, style, ...rest }: TextProps & { w?: Weight; s?: number; c?: string; lh?: number; center?: boolean }) {
  // a plain line of text is shown in the app's language; anything else (a title from the notes, a number) passes through untouched
  const { children, ...props } = rest;
  // DM Sans has no Cyrillic letters, so Russian is set in the phone's own typeface rather than a mix of two
  const face = getLang() === 'ru' ? { fontWeight: String(w) as '400' } : { fontFamily: FONT[w] };
  return <Text {...props} style={[face, { fontSize: s, color: c, lineHeight: lh ?? Math.round(s * 1.3), textAlign: center ? 'center' : undefined }, style]}>{typeof children === 'string' ? t(children) : children}</Text>;
}

export const Label = ({ children, color = C.ink3 }: { children: ReactNode; color?: string }) => (
  <T w={700} s={12} c={color} style={{ letterSpacing: 1, textTransform: 'uppercase' }}>{children}</T>
);

export function Icon({ name, size = 22, stroke = 2, fill, color = C.ink }: { name: string; size?: number; stroke?: number; fill?: boolean; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={PATHS[name] ?? PATHS.question} fill={fill ? color : 'none'} stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** How the web build writes maths in a line of text, made readable without a typesetter. */
export const prettyMath = (t: string): string => {
  const sup: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', n: 'ⁿ', x: 'ˣ' };
  return t
    .replace(/⁣/g, '')
    .replace(/\^\(([-\dnx]+)\)|\^([\dnx])/g, (_m, a: string | undefined, b: string | undefined) => [...(a ?? b ?? '')].map((ch) => sup[ch] ?? ch).join(''))
    .replace(/sqrt\(/g, '√(')
    .replace(/<=/g, '≤')
    .replace(/>=/g, '≥')
    .replace(/!=/g, '≠')
    .replace(/->/g, '→')
    .replace(/\*/g, '·')
    .replace(/ - /g, ' − ');
};

/** `**bold**` and `$maths$` inside a sentence. */
export function Rich({ text, s = 15, c = C.ink, lh, bold = C.ink, w = 400, style }: { text: string; s?: number; c?: string; lh?: number; bold?: string; w?: Weight; style?: StyleProp<TextStyle> }) {
  const parts = t(text).split(/(\*\*[^*]+\*\*|\$[^$]+\$)/g).filter(Boolean);
  return (
    <T s={s} c={c} lh={lh} w={w} style={style}>
      {parts.map((p, i) =>
        p.startsWith('**') ? (
          <Text key={i} style={getLang() === 'ru' ? { fontWeight: '700', color: bold } : { fontFamily: FONT[700], color: bold }}>{p.slice(2, -2)}</Text>
        ) : p.startsWith('$') ? (
          <Text key={i} style={getLang() === 'ru' ? { fontWeight: '600' } : { fontFamily: FONT[600] }}>{prettyMath(p.slice(1, -1))}</Text>
        ) : (
          p
        ),
      )}
    </T>
  );
}

/** A progress ring with something in the middle. */
export function Ring({ value, size = 58, stroke = 6, color = C.brand, track = C.tint2, children }: { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={[StyleSheet.absoluteFill, { transform: [{ rotate: '-90deg' }] }]}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        {v > 0 && <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${len * v} ${len}`} />}
      </Svg>
      {typeof children === 'string' || typeof children === 'number' ? <T w={700} s={13.5}>{children}</T> : children}
    </View>
  );
}

export function Bar({ value, tone = '', height }: { value: number; tone?: string; height?: number }) {
  const thin = tone.includes('thin');
  const h = height ?? (thin ? 6 : 10);
  const on = tone.includes('onbrand');
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withSpring(Math.max(0, Math.min(1, value)), SPRING);
  }, [value, w]);
  const fill = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, w.value)) * 100}%` }));
  return (
    <View style={{ height: h, borderRadius: 999, backgroundColor: on ? 'rgba(255,255,255,0.25)' : C.tint2, overflow: 'hidden' }}>
      <Animated.View style={[{ height: h, borderRadius: 999, backgroundColor: on ? '#fff' : tone.includes('ok') ? C.ok : C.brand }, fill]} />
    </View>
  );
}

/** The hard edge under a raised thing: its own layer, a few pixels lower, which the face sinks onto. */
const Edge = ({ color, depth, radius }: { color: string; depth: number; radius: number }) => (
  <View style={{ position: 'absolute', left: 0, right: 0, top: depth, bottom: -depth, borderRadius: radius, backgroundColor: color }} />
);

/** Something that sits on a hard edge and sinks onto it when pressed: cards, tiles, banners. */
export function Raised({ children, onPress, style, edge = C.line, depth = 3, radius = 22, haptic = 0, label, disabled }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; edge?: string; depth?: number; radius?: number; haptic?: number; label?: string; disabled?: boolean }) {
  const down = useSharedValue(0);
  const face = useAnimatedStyle(() => ({ transform: [{ translateY: down.value * depth }] }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || !onPress}
      onPressIn={() => (down.value = withTiming(1, { duration: 70 }))}
      onPressOut={() => (down.value = withTiming(0, { duration: 140 }))}
      onPress={() => {
        if (haptic) buzz(haptic);
        onPress?.();
      }}
      style={{ marginBottom: depth }}
    >
      <Edge color={edge} depth={depth} radius={radius} />
      <Animated.View style={[{ borderRadius: radius }, style, face]}>{children}</Animated.View>
    </Pressable>
  );
}

const FACES = {
  primary: { face: ['#7b74ff', '#6c63ff', '#5a52e0'], edge: '#4a42c8', text: '#fff' },
  dark: { face: ['#44445a', '#2e2e3e', '#2e2e3e'], edge: '#1a1a28', text: '#ecebf5' },
  secondary: { face: ['#ffffff', '#f9f9fb', '#f5f5f7'], edge: '#d0d0d8', text: C.ink },
  ok: { face: ['#2cc08a', '#20b37e', '#17a673'], edge: '#0f8a5d', text: '#fff' },
  off: { face: ['#e8e8ec', '#e0e0e5', '#d8d8de'], edge: '#c8c8d0', text: '#a0a0b0' },
} as const;

/** The raised pill button. */
export function Button3D({ children, onPress, variant = 'primary', small, disabled, style, icon }: { children: ReactNode; onPress?: () => void; variant?: 'primary' | 'dark' | 'secondary' | 'ok'; small?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; icon?: string }) {
  const look = FACES[disabled ? 'off' : variant];
  const down = useSharedValue(0);
  const face = useAnimatedStyle(() => ({ transform: [{ translateY: down.value * 3 }] }));
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPressIn={() => (down.value = withTiming(1, { duration: 70 }))}
      onPressOut={() => (down.value = withTiming(0, { duration: 140 }))}
      onPress={() => {
        buzz(8);
        onPress?.();
      }}
      style={[{ marginBottom: 4, alignSelf: small ? 'auto' : 'stretch', maxWidth: small ? undefined : 340, width: small ? undefined : '100%' }, style]}
    >
      <Edge color={look.edge} depth={4} radius={999} />
      <Animated.View style={[{ borderRadius: 999 }, face]}>
        <LinearGradient colors={look.face} style={{ minHeight: small ? 42 : 54, paddingVertical: small ? 9 : 14, paddingHorizontal: small ? 18 : 22, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: variant === 'secondary' && !disabled ? 1.5 : 0, borderColor: C.lineD }}>
          {icon && <Icon name={icon} size={small ? 17 : 18} color={look.text} />}
          <T w={600} s={small ? 15 : 17} c={look.text}>{children}</T>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

/** The sliding choice between two or three things. The thumb moves at once; what it switches follows. */
export function Seg<V extends string>({ options, value, onChange }: { options: { id: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  const [w, setW] = useState(0);
  const at = Math.max(0, options.findIndex((o) => o.id === value));
  const [lit, setLit] = useState(at);
  const x = useSharedValue(at);
  useEffect(() => {
    x.value = withSpring(at, SPRING);
    setLit(at);
  }, [at, x]);
  const cell = w > 0 ? (w - 8) / options.length : 0;
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * cell }] }));
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: C.tint }}>
      {cell > 0 && (
        <Animated.View style={[{ position: 'absolute', top: 4, bottom: 4, left: 4, width: cell }, thumb]}>
          <View style={{ position: 'absolute', left: 0, right: 0, top: 2, bottom: -2, borderRadius: 999, backgroundColor: C.brandD }} />
          <View style={{ flex: 1, borderRadius: 999, backgroundColor: C.brand }} />
        </Animated.View>
      )}
      {options.map((o, i) => (
        <Pressable
          key={o.id}
          accessibilityRole="tab"
          accessibilityState={{ selected: o.id === value }}
          onPressIn={() => {
            if (i === lit) return;
            x.value = withSpring(i, SPRING);
            setLit(i);
            buzz(5);
          }}
          onPress={() => startTransition(() => onChange(o.id))}
          style={{ flex: 1, paddingVertical: 9, paddingHorizontal: 6, alignItems: 'center' }}
        >
          <T w={600} s={15} c={i === lit ? '#fff' : C.ink2} numberOfLines={1}>{o.label}</T>
        </Pressable>
      ))}
    </View>
  );
}

/** False inside anything that is mounted but not on screen; Lera and other endless motion rest while it is false. */
export const OnScreen = LeraAwake;

/** Keeps something mounted once it has been shown, and simply hides it afterwards, so coming back to it costs nothing. */
export function Keep({ on, children, style }: { on: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const outer = useContext(OnScreen);
  const seen = useRef(on);
  if (on) seen.current = true;
  const o = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    o.value = on ? withTiming(1, { duration: 200 }) : 0;
  }, [on, o]);
  const fade = useAnimatedStyle(() => ({ opacity: o.value }));
  if (!seen.current) return null;
  return (
    <Animated.View pointerEvents={on ? 'auto' : 'none'} style={[style, on ? null : { display: 'none' }, fade]}>
      <OnScreen.Provider value={on && outer}>{children}</OnScreen.Provider>
    </Animated.View>
  );
}

/** A number that counts up to its value when it appears. */
export function CountUp({ to, suffix = '', ...text }: { to: number; suffix?: string } & Parameters<typeof T>[0]) {
  const [n, setN] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = Date.now();
    const a = from.current;
    let raf = 0;
    const step = () => {
      const p = Math.min(1, (Date.now() - start) / 700);
      const v = Math.round(a + (to - a) * (1 - Math.pow(1 - p, 3)));
      setN(v);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = to;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <T {...text}>{n}{suffix}</T>;
}

export function Chip({ children, tone = 'brand' }: { children: ReactNode; tone?: 'brand' | 'gap' | 'slip' | 'ok' | 'info' | 'plain' }) {
  const look = { brand: [C.tint, C.brandD], gap: [C.gapBg, C.gap], slip: [C.slipBg, C.slip], ok: ['#2fbf71', '#fff'], info: [C.infoBg, C.info], plain: [C.bg2, C.ink2] }[tone];
  return (
    <View style={{ paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999, backgroundColor: look[0], alignSelf: 'flex-start' }}>
      <T w={600} s={12.5} c={look[1]}>{children}</T>
    </View>
  );
}

/** The round status mark beside a lesson or an idea. */
export function Dot({ status }: { status: 'new' | 'gap' | 'shaky' | 'solid' }) {
  const border = status === 'gap' ? C.gap : status === 'shaky' ? C.slip : status === 'solid' ? C.ok : C.lineD;
  return (
    <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2.5, borderColor: border, backgroundColor: status === 'gap' ? C.gapBg : status === 'solid' ? C.ok : '#fff', overflow: 'hidden' }}>
      {status === 'shaky' && <View style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, right: 0, backgroundColor: C.slip }} />}
    </View>
  );
}

/** A pressable that shrinks a little under the finger. */
export function Tap({ children, onPress, style, scale = 0.94, label, haptic = 0 }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; scale?: number; label?: string; haptic?: number }) {
  const down = useSharedValue(0);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: 1 - down.value * (1 - scale) }] }));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={6} onPressIn={() => (down.value = withTiming(1, { duration: 80 }))} onPressOut={() => (down.value = withSpring(0, SPRING))} onPress={() => { if (haptic) buzz(haptic); onPress?.(); }}>
      <Animated.View style={[style, anim]}>{children}</Animated.View>
    </Pressable>
  );
}

export const EASE = Easing.bezier(0.22, 1, 0.36, 1);
export const row = (gap = 10, extra?: ViewStyle): ViewStyle => ({ flexDirection: 'row', alignItems: 'center', gap, ...extra });
