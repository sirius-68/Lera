// Development: rebuild on every save and reload the browser.
//   npm run dev   →  http://localhost:5173
import * as esbuild from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { copyPublic, options, root, writeHtml } from './build.mjs';
import { serve } from './server.mjs';

const outdir = path.join(root, '.dev');
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await copyPublic(outdir);
await writeHtml(outdir, {
  styles: '<link rel="stylesheet" href="app.css">',
  scripts: '<script type="module" src="app.js"></script>',
});

const server = serve({ dir: '.dev', port: Number(process.env.PORT ?? 5173), live: true });
const ctx = await esbuild.context({
  ...options({ dev: true, outdir }),
  plugins: [
    ...options({ dev: true, outdir }).plugins,
    { name: 'reload', setup: (b) => b.onEnd((r) => r.errors.length === 0 && server.reload()) },
  ],
});
await ctx.watch();
