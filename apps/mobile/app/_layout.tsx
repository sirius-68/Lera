import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold, DMSans_800ExtraBold, useFonts } from '@expo-google-fonts/dm-sans';
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';

// the phone's own launch picture stays until the app has something of its own to show, so there is no blank frame between
SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function Layout() {
  // the app's own typeface, carried inside it; until it is ready nothing with text is drawn
  const [loaded, failed] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold, DMSans_800ExtraBold });
  const up = loaded || !!failed;
  useEffect(() => {
    if (up) SplashScreen.hideAsync().catch(() => undefined);
  }, [up]);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#fff' }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>{up ? <Slot /> : <View style={{ flex: 1, backgroundColor: '#fff' }} />}</SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
