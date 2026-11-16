/** Browser preview of the native app (used for checking the screens): the phone's services do nothing here. */
export const buzz = (_ms: number | number[] = 8): void => undefined;
export const copyText = (text: string): void => {
  navigator.clipboard?.writeText(text).catch(() => undefined);
};
export const shareText = (_title: string, _text: string): void => undefined;
export const remind = async (_h: number, _m: number, _t: string, _b: string): Promise<boolean> => false;
export const remindOff = (): void => undefined;
export const readBackup = async (): Promise<string | undefined> => undefined;
export const writeBackup = (_json: string): void => undefined;
