import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Platform, Share } from 'react-native';

/** The phone's own services, asked for by the screens (native ones directly, web ones through the link). */

/** The web build describes a buzz in milliseconds; a phone has named taps. */
export function buzz(ms: number | number[] = 8): void {
  const run = Array.isArray(ms)
    ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    : ms <= 6
      ? Haptics.selectionAsync()
      : Haptics.impactAsync(ms <= 12 ? Haptics.ImpactFeedbackStyle.Light : ms <= 25 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy);
  run.catch(() => undefined);
}

export const copyText = (text: string): void => {
  Clipboard.setStringAsync(text).catch(() => undefined);
};

export const shareText = (title: string, text: string): void => {
  Share.share(Platform.OS === 'ios' ? { message: text } : { title, message: text }).catch(() => undefined);
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/** One reminder a day at the chosen time. Resolves to whether reminders are now on. */
export async function remind(hour: number, minute: number, title: string, body: string): Promise<boolean> {
  try {
    const now = await Notifications.getPermissionsAsync();
    const granted = now.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return false;
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('study', { name: 'Study reminder', importance: Notifications.AndroidImportance.DEFAULT });
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: 'study' },
    });
    return true;
  } catch {
    return false;
  }
}

export const remindOff = (): void => {
  Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
};

/*
 * A second copy of the learner's progress (everything except the lessons' text), kept by the app itself.
 * The web screens save their own; this one is only read if theirs ever comes back empty.
 * Stored in pieces because one stored value has a size limit on Android.
 */
const KEY = 'lera.backup';
const PIECE = 400_000;

export async function readBackup(): Promise<string | undefined> {
  try {
    const n = Number(await AsyncStorage.getItem(`${KEY}.n`));
    if (!n) return undefined;
    const parts = await AsyncStorage.multiGet(Array.from({ length: n }, (_, i) => `${KEY}.${i}`));
    if (parts.some((p) => p[1] == null)) return undefined;
    return parts.map((p) => p[1]).join('');
  } catch {
    return undefined;
  }
}

export function writeBackup(json: string): void {
  const rows: [string, string][] = [];
  for (let i = 0; i * PIECE < json.length; i++) rows.push([`${KEY}.${i}`, json.slice(i * PIECE, (i + 1) * PIECE)]);
  rows.push([`${KEY}.n`, String(rows.length)]);
  AsyncStorage.multiSet(rows).catch(() => undefined);
}
