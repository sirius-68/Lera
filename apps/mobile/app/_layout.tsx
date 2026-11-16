import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold, DMSans_800ExtraBold, useFonts } from '@expo-google-fonts/dm-sans';
import { Slot } from 'expo-router';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function Layout() {
  // the app's own typeface, carried inside it; until it is ready nothing with text is drawn
  const [loaded, failed] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold, DMSans_800ExtraBold });
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#fff' }}>
      <SafeAreaProvider>{loaded || failed ? <Slot /> : <View style={{ flex: 1, backgroundColor: '#fff' }} />}</SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
