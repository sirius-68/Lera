import { weekStrip, xpByDay } from './game';
import { dayOf, dueNow, streak } from './learner';
import type { AppState } from './types';

/**
 * The home-screen widgets (Android app only).
 *
 * The native side draws them and decides Lera's mood from the clock; the
 * app's part is to hand over a few numbers whenever they change or the app
 * comes to the front. `window.LeraNative` exists only inside the Android app,
 * so in a browser all of this quietly does nothing.
 */
interface Native {
  setWidget(json: string): void;
  setTest?(on: boolean): void;
  isTest?(): boolean;
  takeAction?(): string;
  canPin?(): boolean;
  pinWidget?(wide: boolean): boolean;
}

const native = (): Native | null => (globalThis as { LeraNative?: Native }).LeraNative ?? null;

let sent = '';

/** `force` resends even when nothing changed — the widget also needs to know the app was just looked at. */
export function syncWidget(s: AppState, force = false): void {
  const n = native();
  if (!n) return;
  const today = dayOf();
  const game = { attempts: s.attempts, read: s.read };
  const week = weekStrip(game);
  const payload = JSON.stringify({
    streak: streak(s.attempts),
    lastDay: s.attempts.reduce((best, a) => (a.day > best ? a.day : best), ''),
    goal: s.profile.dailyXp || 30,
    xpToday: xpByDay(game).get(today) ?? 0,
    due: dueNow(s.concepts).length,
    week: week.map((d) => (d.active ? '1' : '0')).join(''),
    weekStart: week[0]?.day ?? '',
  });
  if (payload === sent && !force) return;
  sent = payload;
  try {
    n.setWidget(payload);
  } catch {
    /* an older build of the app without the widget */
  }
}

/** True inside the Android app. */
export const hasWidget = (): boolean => native() !== null;

const call = <T,>(fn: (n: Native) => T | undefined, fallback: T): T => {
  try {
    const n = native();
    return (n && fn(n)) ?? fallback;
  } catch {
    return fallback;
  }
};

/** The launcher can show its own "add widget" dialog for us. */
export const canPinWidget = (): boolean => call((n) => n.canPin?.(), false);
export const pinWidget = (wide = false): boolean => call((n) => n.pinWidget?.(wide), false);

/** Test mode: the widget climbs its whole ladder of moods, one a minute, from when the app was last open. */
export const widgetTestMode = (): boolean => call((n) => n.isTest?.(), true);
export function setWidgetTestMode(on: boolean): void {
  call((n) => (n.setTest?.(on), true), false);
}

/** Where a tap on the widget wants the app to go ('practice'), once. */
export const takeWidgetAction = (): string => call((n) => n.takeAction?.(), '');
