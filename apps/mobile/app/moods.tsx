import { ScrollView, View } from 'react-native';
import { Lera, Mood } from '../mascot/Lera';
import data from '../mascot/moods.json';
import { T } from '../ui/kit';

/** Every mood side by side. Not linked from the app: it is here to compare the native Lera with the web one. */
export default function Moods() {
  return (
    <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 12, paddingTop: 50, backgroundColor: '#fff' }}>
      {(Object.keys(data.moods) as Mood[]).map((m) => (
        <View key={m} style={{ width: 68, alignItems: 'center' }}>
          <Lera size={58} mood={m} />
          <T s={10}>{m}</T>
        </View>
      ))}
    </ScrollView>
  );
}
