// Renders public/icon.svg (written by scripts/widget-art.py) to the PNG icons the web app and older Android launchers use.
//   node scripts/icon-png.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const svg = await readFile(new URL('../public/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await writeFile(new URL(`../public/icon-${size}.png`, import.meta.url), await page.screenshot());
  await page.close();
}
await browser.close();
console.log('icons written');
