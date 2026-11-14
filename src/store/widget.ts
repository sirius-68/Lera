import { xpByDay } from './game';
import { dayOf, dueNow, streak } from './learner';
import type { AppState } from './types';

/**
 * The home-screen widget (Android app only).
 *
 * The native side draws it; the app's part is to hand over a few numbers
 * whenever they change. `window.LeraNative` exists only inside the Android
 * app, so in a browser all of this quietly does nothing.
 */
interface Native {
  setWidget(json: string): void;
  canPin?(): boolean;
  pinWidget?(): boolean;
}

const native = (): Native | null => (globalThis as { LeraNative?: Native }).LeraNative ?? null;

let sent = '';

export function syncWidget(s: AppState): void {
  const n = native();
  if (!n) return;
  const today = dayOf();
  const lastDay = s.attempts.reduce((best, a) => (a.day > best ? a.day : best), '');
  const payload = JSON.stringify({
    streak: streak(s.attempts),
    lastDay,
    goal: s.profile.dailyXp || 30,
    xpToday: xpByDay({ attempts: s.attempts, read: s.read }).get(today) ?? 0,
    due: dueNow(s.concepts).length,
  });
  if (payload === sent) return;
  sent = payload;
  try {
    n.setWidget(payload);
  } catch {
    /* an older build of the app without the widget */
  }
}

/** True inside the Android app. */
export const hasWidget = (): boolean => native() !== null;

/** The launcher can show its own "add widget" dialog for us. */
export function canPinWidget(): boolean {
  try {
    return !!native()?.canPin?.();
  } catch {
    return false;
  }
}

export function pinWidget(): boolean {
  try {
    return !!native()?.pinWidget?.();
  } catch {
    return false;
  }
}
