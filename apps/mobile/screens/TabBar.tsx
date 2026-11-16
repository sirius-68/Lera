import { startTransition, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dueNow } from '@core/store/learner';
import { setTab, Tab, TABS, useApp, useShell } from '../host/link';
import { buzz } from '../host/phone';
import { Icon, T } from '../ui/kit';
import { C, SPRING } from '../ui/theme';

const ITEMS: { name: Tab; label: string; icon: string }[] = [
  { name: 'home', label: 'Home', icon: 'home' },
  { name: 'lessons', label: 'Learn', icon: 'book' },
  { name: 'practice', label: 'Practice', icon: 'pencil' },
  { name: 'progress', label: 'Progress', icon: 'chart' },
];

function Item({ item, on, due, onPick }: { item: (typeof ITEMS)[number]; on: boolean; due: number; onPick: () => void }) {
  const v = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    v.value = withSpring(on ? 1 : 0, SPRING);
  }, [on, v]);
  const icon = useAnimatedStyle(() => ({ transform: [{ translateY: -2 * v.value }, { scale: 1 + 0.12 * v.value }] }));
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      onPressIn={() => {
        if (on) return;
        buzz(4);
        onPick();
      }}
      onPress={() => startTransition(() => setTab(item.name))}
      style={{ flex: 1, height: 52, alignItems: 'center', justifyContent: 'center', gap: 2 }}
    >
      <Animated.View style={icon}><Icon name={item.icon} size={23} color={on ? C.brand : C.ink3} fill={on && item.icon === 'home'} /></Animated.View>
      <T w={600} s={11.5} lh={14} c={on ? C.brand : C.ink3}>{item.label}</T>
      {item.name === 'practice' && due > 0 && (
        <View style={{ position: 'absolute', top: 2, left: '50%', marginLeft: 6, minWidth: 17, height: 17, paddingHorizontal: 3, borderRadius: 9, backgroundColor: C.gap, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
          <T w={600} s={10} lh={12} c="#fff">{due}</T>
        </View>
      )}
    </Pressable>
  );
}

/** The four tabs. The tinted pill slides under the one you are on, starting the moment a tab is touched. */
export function TabBar() {
  const insets = useSafeAreaInsets();
  const tab = useShell((s) => s.tab);
  const concepts = useApp((s) => s.concepts);
  const due = dueNow(concepts).length;
  const [w, setW] = useState(0);
  const at = TABS.indexOf(tab);
  const x = useSharedValue(at);
  useEffect(() => {
    x.value = withSpring(at, SPRING);
  }, [at, x]);
  const cell = w > 0 ? (w - 16) / 4 : 0;
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * cell }] }));
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', paddingTop: 8, paddingHorizontal: 8, paddingBottom: 8 + insets.bottom, backgroundColor: '#fff', boxShadow: `0px -1px 0px ${C.line}, 0px -10px 30px rgba(40,30,120,0.05)` }}>
      {cell > 0 && <Animated.View style={[{ position: 'absolute', top: 8, left: 8, width: cell, height: 52, borderRadius: 16, backgroundColor: C.tint }, pill]} />}
      {ITEMS.map((item, i) => <Item key={item.name} item={item} on={tab === item.name} due={due} onPick={() => (x.value = withSpring(i, SPRING))} />)}
    </View>
  );
}
