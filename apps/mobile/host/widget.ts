import { requireOptionalNativeModule } from 'expo';
import { syncWidget } from '@core/store/widget';
import { getApp } from './link';

/**
 * The home-screen widgets. The native module (modules/lera-widgets, Android) draws them; the shared
 * code in src/store/widget.ts works out the numbers and hands them over through `LeraNative`, the
 * same name the older Android build used.
 */
interface WidgetModule {
  setWidget(json: string): void;
  takeAction(): string;
  canPin(): boolean;
  pinWidget(wide: boolean): boolean;
}

const mod = requireOptionalNativeModule<WidgetModule>('LeraWidgets');

if (mod) {
  (globalThis as Record<string, unknown>).LeraNative = {
    setWidget: (json: string) => mod.setWidget(json),
    takeAction: () => mod.takeAction(),
    canPin: () => mod.canPin(),
    pinWidget: (wide: boolean) => mod.pinWidget(wide),
  };
}

export const hasWidgets = mod !== null;
/** undefined when this phone has no widgets at all (the web screens then hide the buttons). */
export const canPin = (): boolean | undefined => {
  try {
    return mod ? mod.canPin() : undefined;
  } catch {
    return undefined;
  }
};
export const pin = (wide: boolean): void => {
  try {
    mod?.pinWidget(wide);
  } catch {
    /* the launcher refused */
  }
};
/** 'practice' once, after the widget's card was tapped. */
export const takeAction = (): string => {
  try {
    return mod?.takeAction() ?? '';
  } catch {
    return '';
  }
};
export const pushWidget = (force = false): void => {
  if (mod) syncWidget(getApp(), force);
};
