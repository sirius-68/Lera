import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { AppState as Phone, BackHandler, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, FadeOutDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Island } from '../host/Island';
import { act, gated, getApp, getShell, send, setTab, useApp, useShell } from '../host/link';
import { pushWidget, takeAction } from '../host/widget';
import { Lera } from '../mascot/Lera';
import { HomeScreen } from '../screens/Home';
import { LessonsScreen } from '../screens/Learn';
import { PracticeScreen } from '../screens/Practice';
import { ProgressScreen } from '../screens/Progress';
import { TabBar } from '../screens/TabBar';
import { EASE, T } from '../ui/kit';
import { C } from '../ui/theme';

const SCREENS = { home: HomeScreen, lessons: LessonsScreen, practice: PracticeScreen, progress: ProgressScreen } as const;

/** A tap on the home-screen widget's card opens Practice. */
function followWidget(): void {
  if (takeAction() !== 'practice') return;
  act('track', 'widget');
  if (!gated(getApp())) {
    send({ t: 'reset' });
    setTab('practice');
  }
}

/**
 * The whole app: the four native tabs, and on top of them the web screens (lessons, practice, upload,
 * Ask Lera, the notebook, settings, onboarding), which slide in from the right when one is opened.
 */
export default function Shell() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const ready = useShell((s) => s.ready);
  const tab = useShell((s) => s.tab);
  const deep = useShell((s) => s.deep);
  const sheet = useShell((s) => s.sheet);
  const toast = useShell((s) => s.toast);
  const locked = useApp(gated);
  const covering = ready && (locked || deep);

  // 0 = the web screens are on screen, 1 = off to the right
  const off = useSharedValue(1);
  const was = useRef({ covering: false, sheet: false, locked: true });
  useEffect(() => {
    if (!ready) return;
    const before = was.current;
    was.current = { covering, sheet, locked };
    if (covering) {
      // a sheet over a tab, and the first-run screens, are simply there; a pushed screen slides in
      off.value = sheet || locked || before.locked ? 0 : withTiming(0, { duration: 340, easing: EASE });
    } else {
      off.value = before.sheet || before.locked ? 1 : withTiming(1, { duration: 260, easing: Easing.in(Easing.cubic) });
    }
  }, [ready, covering, sheet, locked, off]);
  const islandStyle = useAnimatedStyle(() => ({ transform: [{ translateX: off.value * width }] }));
  const tabsStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -(1 - off.value) * width * 0.22 }], opacity: 0.55 + 0.45 * off.value }));

  // the phone's back button walks back through the web screens first, then to Home, then leaves
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const s = getShell();
      if (s.deep) {
        send({ t: 'back' });
        return true;
      }
      if (!gated(getApp()) && s.tab !== 'home') {
        setTab('home');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  // coming back to the app: the widget is told it was looked at, and a tap on it is followed
  useEffect(() => {
    if (ready) followWidget();
    const sub = Phone.addEventListener('change', (st) => {
      if (st !== 'active') return;
      pushWidget(true);
      followWidget();
    });
    return () => sub.remove();
  }, [ready]);

  const Screen = SCREENS[tab];
  return (
    <View style={styles.fill}>
      <StatusBar style={!covering && tab === 'lessons' ? 'light' : 'dark'} />
      {ready && !locked && (
        <Animated.View style={[styles.fill, sheet ? undefined : tabsStyle]}>
          <Animated.View key={tab} entering={FadeIn.duration(240)} style={styles.fill}>
            <Screen />
          </Animated.View>
          <TabBar />
        </Animated.View>
      )}
      <Animated.View style={[StyleSheet.absoluteFill, islandStyle]} pointerEvents={covering ? 'auto' : 'none'}>
        <Island />
      </Animated.View>
      {!ready && (
        <Animated.View exiting={FadeOut.duration(260)} style={[StyleSheet.absoluteFill, styles.boot]}>
          <Lera size={84} mood="idle" interactive={false} />
        </Animated.View>
      )}
      {toast && (
        <Animated.View key={toast.id} entering={FadeInDown.springify().damping(14)} exiting={FadeOutDown.duration(200)} pointerEvents="none" style={[styles.toast, { bottom: 96 + insets.bottom }]}>
          <T w={500} s={14} c="#fff" center>{toast.text}</T>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#fff' },
  boot: { backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', alignSelf: 'center', maxWidth: '86%', paddingVertical: 11, paddingHorizontal: 16, borderRadius: 14, backgroundColor: C.ink, boxShadow: '0px 10px 30px rgba(20,18,46,0.3)' },
});
