import { getApp, Msg, receive, send } from './link';
import { buzz, copyText, remind, remindOff, shareText, writeBackup } from './phone';
import { pin, pushWidget } from './widget';

let backupTimer: ReturnType<typeof setTimeout> | undefined;
let widgetTimer: ReturnType<typeof setTimeout> | undefined;

/** Everything the web screens can send to the native app. */
export function handle(m: Msg): void {
  switch (m.t) {
    case 'state':
      receive(m);
      clearTimeout(backupTimer);
      backupTimer = setTimeout(() => writeBackup(JSON.stringify({ ...getApp(), docs: [] })), 1500);
      clearTimeout(widgetTimer);
      widgetTimer = setTimeout(() => pushWidget(), 400);
      break;
    case 'ready':
    case 'nav':
      receive(m);
      break;
    case 'haptic':
      buzz(m.ms as number | number[]);
      break;
    case 'copy':
      copyText(String(m.text ?? ''));
      break;
    case 'share':
      shareText(String(m.title ?? ''), String(m.text ?? ''));
      break;
    case 'remind':
      remind(Number(m.hour), Number(m.minute), String(m.title), String(m.body)).then((ok) => send({ t: 'reply', id: m.id, ok }));
      break;
    case 'remind-off':
      remindOff();
      break;
    case 'pin':
      pin(m.wide === true);
      break;
  }
}

/** The page the web view loads: the built screens, with the settings they need already in place. */
export function compose(island: string, config: Record<string, unknown>): string {
  const cfg = JSON.stringify(config).replace(/</g, '\\u003c');
  return island.replace('<head>', () => `<head><script>window.__LERA_HOST__=${cfg};</script>`);
}
