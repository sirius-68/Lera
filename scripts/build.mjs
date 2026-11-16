// Build Lera with esbuild.
//   node scripts/build.mjs            → dist/            (what you deploy)
//   node scripts/build.mjs --single   → dist-single/lera.html   (everything in one file, for sharing a preview)
import * as esbuild from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const single = process.argv.includes('--single');

/** KaTeX lists three font formats per face; every current browser takes the first (woff2). Drop the rest. */
const katexFonts = {
  name: 'katex-woff2-only',
  setup(build) {
    build.onLoad({ filter: /katex(\.min)?\.css$/ }, async (args) => {
      const css = await readFile(args.path, 'utf8');
      return {
        contents: css.replace(/,url\([^)]+\.woff\) format\("woff"\),url\([^)]+\.ttf\) format\("truetype"\)/g, ''),
        loader: 'css',
      };
    });
  },
};

const assetLoader = single ? 'dataurl' : 'file';

export function options({ dev = false, outdir, singleFile = false } = {}) {
  const loader = singleFile ? 'dataurl' : 'file';
  return {
    absWorkingDir: root,
    bundle: true,
    jsx: 'automatic',
    target: 'es2022',
    define: {
      'process.env.NODE_ENV': dev ? '"development"' : '"production"',
      __SINGLE_FILE__: String(singleFile),
      // the AI backend is chosen at build time (see src/ai/config.ts); empty values mean "no AI"
      __LERA_AUTH_URL__: JSON.stringify(process.env.LERA_AUTH_URL ?? ''),
      __LERA_AI__: JSON.stringify({
        baseUrl: process.env.LERA_AI_BASE_URL ?? '',
        model: process.env.LERA_AI_MODEL ?? '',
        key: process.env.LERA_AI_KEY ?? '',
      }),
    },
    loader: {
      '.png': loader, '.jpg': loader, '.svg': loader, '.woff2': loader, '.woff': loader, '.ttf': loader, '.docx': loader,
    },
    plugins: [katexFonts],
    minify: !dev,
    sourcemap: dev ? 'inline' : false,
    legalComments: 'none',
    logLevel: 'info',
    outdir,
    ...(singleFile
      ? { entryPoints: { app: 'src/main.tsx' }, format: 'iife', write: false }
      : {
          entryPoints: { app: 'src/main.tsx', 'pdf.worker': 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs' },
          format: 'esm',
          splitting: true,
          entryNames: '[name]',
          chunkNames: 'chunks/[name]-[hash]',
          assetNames: 'media/[name]-[hash]',
        }),
  };
}

export async function writeHtml(outdir, { styles, scripts }) {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  await writeFile(
    path.join(outdir, 'index.html'),
    html.replace('<!--LERA:STYLES-->', styles).replace('<!--LERA:SCRIPTS-->', scripts),
  );
}

export async function copyPublic(outdir) {
  const pub = path.join(root, 'public');
  if (existsSync(pub)) await cp(pub, outdir, { recursive: true });
}

async function buildSite() {
  const outdir = path.join(root, 'dist');
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  await esbuild.build(options({ outdir }));
  await copyPublic(outdir);
  const stamp = Date.now().toString(36);
  await writeHtml(outdir, {
    styles: `<link rel="stylesheet" href="app.css?v=${stamp}">`,
    scripts: `<script type="module" src="app.js?v=${stamp}"></script>`,
  });
  console.log('\n  Built → dist/   (serve it with: npm run preview)\n');
}

async function buildSingle() {
  const outdir = path.join(root, 'dist-single');
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  const result = await esbuild.build(options({ outdir, singleFile: true }));
  const js = result.outputFiles.find((f) => f.path.endsWith('.js'))?.text ?? '';
  const css = result.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';
  const html = (await readFile(path.join(root, 'index.html'), 'utf8'))
    .replace(/<link rel="(manifest|icon|apple-touch-icon)"[^>]*>\n?/g, '')
    .replace('<!--LERA:STYLES-->', `<style>${css}</style>`)
    .replace('<!--LERA:SCRIPTS-->', () => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`);
  await writeFile(path.join(outdir, 'lera.html'), html);
  // the same app as a bare fragment (no <html>/<head>/<body>), for hosts that wrap pages in their own document
  const fonts = /<link rel="stylesheet" href="https:\/\/fonts[^>]*>/.exec(html)?.[0] ?? '';
  const fragment = [
    '<title>Lera Algebra Tutor</title>',
    fonts,
    `<style>${css}\n:root{--safe-t:0px;--safe-b:0px}</style>`,
    '<div id="root"></div>',
    `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`,
  ].join('\n');
  await writeFile(path.join(outdir, 'lera-embed.html'), fragment);
  console.log(`\n  Built → dist-single/lera.html  (${(html.length / 1024 / 1024).toFixed(1)} MB)\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await (single ? buildSingle() : buildSite());
}
void assetLoader;
