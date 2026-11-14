/**
 * Daily study reminders.
 *
 * Inside the Android app these are real local notifications, scheduled on the
 * phone by Capacitor's LocalNotifications plugin — nothing is sent from a
 * server. In a browser only the permission is asked, since a web page cannot
 * schedule a notification for a time when it is closed.
 */

export const STUDY_TIMES: Record<string, { label: string; hour: number; minute: number }> = {
  morning: { label: 'Morning · 8:00', hour: 8, minute: 0 },
  afternoon: { label: 'Afternoon · 14:30', hour: 14, minute: 30 },
  evening: { label: 'Evening · 19:00', hour: 19, minute: 0 },
  night: { label: 'Night · 22:00', hour: 22, minute: 0 },
};

const REMINDER_ID = 7001;

interface Bridge {
  isNativePlatform?: () => boolean;
  nativePromise?: (plugin: string, method: string, options: unknown) => Promise<unknown>;
}

function bridge(): Bridge | null {
  const cap = (globalThis as { Capacitor?: Bridge }).Capacitor;
  return cap && cap.isNativePlatform?.() && typeof cap.nativePromise === 'function' ? cap : null;
}

/** Ask for permission and, in the app, schedule the daily reminder. Resolves to whether reminders are on. */
export async function enableReminders(studyTime?: string, name?: string): Promise<boolean> {
  const cap = bridge();
  try {
    if (cap) {
      const res = (await cap.nativePromise!('LocalNotifications', 'requestPermissions', {})) as { display?: string } | undefined;
      if (res?.display !== 'granted') return false;
      const at = STUDY_TIMES[studyTime ?? 'evening'] ?? STUDY_TIMES.evening;
      await cap.nativePromise!('LocalNotifications', 'cancel', { notifications: [{ id: REMINDER_ID }] }).catch(() => undefined);
      await cap.nativePromise!('LocalNotifications', 'schedule', {
        notifications: [
          {
            id: REMINDER_ID,
            title: name ? `${name}, two minutes of maths?` : 'Two minutes of maths?',
            body: 'One checked problem keeps your streak alive — and brings back an idea before it fades.',
            schedule: { on: { hour: at.hour, minute: at.minute }, allowWhileIdle: true },
          },
        ],
      });
      return true;
    }
    if (typeof Notification === 'undefined') return false;
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

export async function disableReminders(): Promise<void> {
  try {
    await bridge()?.nativePromise!('LocalNotifications', 'cancel', { notifications: [{ id: REMINDER_ID }] });
  } catch {
    /* nothing was scheduled */
  }
}
