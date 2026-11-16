// A small static server for Lera.
//   node scripts/server.mjs dist            serve a built folder on http://localhost:4173
//
// Lera's AI router on your own computer, so you can try the AI without deploying anything:
//   put ANTHROPIC_API_KEY=... in a .env file, then build with LERA_AI_URL=/api/ai
//   (LERA_AI_URL=/api/ai npm run preview). The key stays in .env; the page never sees it.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.map': 'application/json', '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function loadEnv() {
  const file = path.join(root, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

/** /api/ai: the same router as backend/supabase/functions/lera-ai, run here with the keys from .env. */
async function routeAi(req, res) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  let router;
  try {
    router = await import('../backend/supabase/functions/_shared/router.ts');
  } catch (e) {
    res.writeHead(501, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: `The AI router could not be loaded (needs Node 22.18 or newer): ${e.message}` } }));
    return;
  }
  const request = new Request('http://localhost/api/ai', {
    method: req.method,
    headers: Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === 'string')),
    body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
  });
  const answer = await router.handle(request, process.env);
  res.writeHead(answer.status, Object.fromEntries(answer.headers.entries()));
  res.end(Buffer.from(await answer.arrayBuffer()));
}

/** @param {{dir: string, port?: number, live?: boolean}} o */
export function serve({ dir, port = 4173, live = false }) {
  loadEnv();
  const base = path.resolve(root, dir);
  const clients = new Set();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/api/ai') return routeAi(req, res);
    if (live && url.pathname === '/__live') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write('retry: 500\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    let file = path.join(base, decodeURIComponent(url.pathname));
    if (!file.startsWith(base)) {
      res.writeHead(403).end();
      return;
    }
    try {
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    } catch {
      // unknown paths fall back to the app shell
      if (!path.extname(file)) file = path.join(base, 'index.html');
    }
    try {
      let body = await readFile(file);
      const ext = path.extname(file);
      if (live && ext === '.html') {
        body = Buffer.from(
          body.toString('utf8').replace('</body>', `<script>new EventSource('/__live').onmessage=()=>location.reload()</script></body>`),
        );
      }
      res.writeHead(200, { 'Content-Type': TYPES[ext] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    }
  });
  server.listen(port, () => console.log(`\n  Lera is running at http://localhost:${port}\n`));
  return { reload: () => clients.forEach((c) => c.write('data: reload\n\n')), close: () => server.close() };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  serve({ dir: process.argv[2] ?? 'dist', port: Number(process.env.PORT ?? 4173) });
}
