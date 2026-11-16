// Copies the Android home-screen widgets from android-overrides/ (the one place they are maintained)
// into the app's local native module, modules/lera-widgets.
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const from = path.resolve(here, '../../../android-overrides');
const main = path.resolve(here, '../modules/lera-widgets/android/src/main');
const java = path.join(main, 'java/expo/modules/lerawidgets');
const res = path.join(main, 'res');

for (const name of ['StreakWidget.java', 'StreakWidgetWide.java']) {
  let src = await readFile(path.join(from, name), 'utf8');
  src = src.replace('package com.sirius68.lera;', 'package expo.modules.lerawidgets;').replace('new Intent(context, MainActivity.class)', 'WidgetStore.launch(context)');
  if (src.includes('MainActivity')) throw new Error(`${name} still refers to MainActivity`);
  await writeFile(path.join(java, name), `// Copied from android-overrides/${name} by scripts/sync-widgets.mjs. Edit it there.\n${src}`);
}

await rm(res, { recursive: true, force: true });
for (const dir of ['layout', 'xml']) await cp(path.join(from, 'res', dir), path.join(res, dir), { recursive: true });
await mkdir(path.join(res, 'drawable'), { recursive: true });
await mkdir(path.join(res, 'values'), { recursive: true });
for (const f of await readdir(path.join(from, 'res/drawable'))) if (f.startsWith('widget_')) await cp(path.join(from, 'res/drawable', f), path.join(res, 'drawable', f));
await cp(path.join(from, 'res/values/widget_strings.xml'), path.join(res, 'values/widget_strings.xml'));
console.log('widgets: copied into modules/lera-widgets');
