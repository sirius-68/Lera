import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { C } from './theme';

/** The raised button used everywhere: it sinks onto its shadow while pressed. */
export function Button3D({ label, onPress, disabled, tone = 'primary' }: { label: string; onPress: () => void; disabled?: boolean; tone?: 'primary' | 'secondary' | 'ok' }) {
  const down = useSharedValue(0);
  const face = useAnimatedStyle(() => ({ transform: [{ translateY: down.value * 4 }] }));
  const colors = tone === 'secondary' ? { bg: '#fff', edge: C.line, text: C.ink } : tone === 'ok' ? { bg: C.ok, edge: '#219457', text: '#fff' } : { bg: C.brand, edge: C.brandDark, text: '#fff' };
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPressIn={() => (down.value = withTiming(1, { duration: 60 }))}
      onPressOut={() => (down.value = withTiming(0, { duration: 120 }))}
      onPress={onPress}
      style={[styles.wrap, { backgroundColor: disabled ? '#C9C7D6' : colors.edge }]}
    >
      <Animated.View style={[styles.face, { backgroundColor: disabled ? '#E3E2EC' : colors.bg, borderColor: tone === 'secondary' ? C.line : 'transparent' }, face]}>
        <Text style={[styles.text, { color: disabled ? '#9C9BAE' : colors.text }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 18, paddingBottom: 4, alignSelf: 'stretch' },
  face: { height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2, marginBottom: 0, marginTop: -0 },
  text: { fontSize: 16.5, fontWeight: '700' },
});
