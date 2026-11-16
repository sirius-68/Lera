import { ReactNode } from 'react';
import { Pressable, View, ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CONCEPTS } from '@core/engine/concepts';
import { practiceFor, seedFrom } from '@core/engine/generate';
import { dayOf } from '@core/store/learner';
import type { Weakness } from '@core/store/weakness';
import { go, openOverlay } from '../host/link';
import { Lera, Mood } from '../mascot/Lera';
import { EASE, Icon, Rich, row, T } from '../ui/kit';
import { C } from '../ui/theme';

/** Pieces shared by the four tabs. */

/** Sections of a tab rise in one after another, as on the web screens. */
export const Rise = ({ i, children, style }: { i: number; children: ReactNode; style?: ViewStyle }) => (
  <Animated.View entering={FadeInDown.delay(40 + i * 55).duration(420).easing(EASE)} style={style}>{children}</Animated.View>
);

export function TopBar({ title, small, children }: { title: string; small?: string; children?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[row(10), { paddingTop: 12 + insets.top, paddingHorizontal: 16, paddingBottom: small ? 6 : 10, minHeight: 56 + insets.top }]}>
      <View style={{ flex: 1 }}>
        {small && <T w={600} s={13.5} c={C.ink3}>{small}</T>}
        <T w={700} s={small ? 22 : 24} numberOfLines={1}>{title}</T>
      </View>
      {children}
    </View>
  );
}

export const IconBtn = ({ name, onPress, label }: { name: string; onPress: () => void; label: string }) => (
  <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: C.bg2, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.9 : 1 }] })}>
    <Icon name={name} />
  </Pressable>
);

export const Card = ({ children, style }: { children: ReactNode; style?: ViewStyle }) => (
  <View style={[{ backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.line, borderRadius: 22, padding: 16 }, style]}>{children}</View>
);

/** Lera with something to say, in the same bubble as onboarding. */
export function Says({ mood, text, size = 58 }: { mood: Mood; text: string; size?: number }) {
  return (
    <View style={row(12)}>
      <Lera size={size} mood={mood} sleepAfter={30000} />
      <View style={{ flex: 1 }}>
        <View style={{ backgroundColor: '#f6f5ff', borderWidth: 2, borderColor: '#e4e1ff', borderRadius: 22, borderTopLeftRadius: 6, paddingVertical: 14, paddingHorizontal: 16 }}>
          <Rich text={text} s={15} lh={21} />
        </View>
        {/* the tail: a turned square whose inner half covers the bubble's edge, so the two read as one shape */}
        <View style={{ position: 'absolute', left: -7, top: 14, width: 14, height: 14, backgroundColor: '#f6f5ff', borderLeftWidth: 2, borderBottomWidth: 2, borderColor: '#e4e1ff', borderBottomLeftRadius: 4, transform: [{ rotate: '45deg' }] }} />
      </View>
    </View>
  );
}

/** What tapping a weak spot does. */
export function actOn(w: Weakness): void {
  const a = w.action;
  if (a.type === 'lesson' && a.topicId) go({ name: 'lesson', topicId: a.topicId });
  else if (a.type === 'review' && a.concept) openOverlay({ name: 'review', concept: a.concept });
  else if (a.concept) go({ name: 'session', problems: practiceFor(a.concept, 4, seedFrom(`${dayOf()}:${a.concept}:${Date.now() % 991}`)), title: CONCEPTS[a.concept].title });
  else go({ name: 'practice' });
}

const WEAK = {
  gap: { border: '#f5c4ba', edge: '#f8d9d2', bg: '#fff9f7', icBg: C.gapBg, ic: C.gap, icon: 'target' },
  slip: { border: '#f0d49b', edge: '#f6e4bd', bg: '#fffaf0', icBg: C.slipBg, ic: C.slip, icon: 'eye' },
  info: { border: '#cfdcf5', edge: '#dfe8f9', bg: '#f7faff', icBg: C.infoBg, ic: C.info, icon: 'bulb' },
} as const;

export function WeakCard({ w }: { w: Weakness }) {
  const k = WEAK[w.tone];
  return (
    <View style={{ borderRadius: 20, paddingTop: 13, paddingHorizontal: 13, paddingBottom: 11, borderWidth: 1.5, borderColor: k.border, backgroundColor: k.bg, boxShadow: `0px 3px 0px ${k.edge}`, marginBottom: 3 }}>
      <View style={[row(8), { alignItems: 'flex-start' }]}>
        <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: k.icBg, alignItems: 'center', justifyContent: 'center' }}><Icon name={k.icon} size={18} color={k.ic} /></View>
        <View style={{ flex: 1 }}>
          <T w={700} s={15.5} lh={20}>{w.title}</T>
          <Rich text={w.detail} s={14} lh={21} c={C.ink2} bold={C.ink2} style={{ marginTop: 3 }} />
          {w.topic && w.action.type !== 'lesson' && (
            <View style={[row(5), { marginTop: 6 }]}><Icon name="book" size={13} color={C.ink2} /><T w={600} s={12.5} c={C.ink2} style={{ flex: 1 }}>Taught in: {w.topic.title}</T></View>
          )}
        </View>
      </View>
      <Pressable accessibilityRole="button" onPress={() => actOn(w)} style={({ pressed }) => [row(8), { marginTop: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: pressed ? C.tint2 : C.tint, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
        <Icon name={w.action.type === 'lesson' ? 'book' : w.action.type === 'review' ? 'bulb' : 'pencil'} size={16} color={C.brandD} />
        <T w={600} s={14.5} c={C.brandD} style={{ flex: 1 }}>{w.action.label}</T>
        <Icon name="chevron" size={15} color={C.brandD} />
      </Pressable>
    </View>
  );
}

/** A plain row that can be tapped (lists in Practice and Progress). */
export const RowBtn = ({ children, onPress, border = false }: { children: ReactNode; onPress: () => void; border?: boolean }) => (
  <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [row(10), { paddingVertical: 11, paddingHorizontal: 2, backgroundColor: pressed ? C.tint : 'transparent', borderBottomWidth: border ? 1.5 : 0, borderColor: C.line }]}>{children}</Pressable>
);
