// A small static server for Lera.
//   node scripts/server.mjs dist            serve a built folder on http://localhost:4173
//
// Optional AI proxy, so the key never reaches the browser:
//   put LERA_AI_BASE_URL and LERA_AI_KEY in a .env file, then in the app choose
//   Settings → AI → "Other", address /api/ai, and leave the key empty.
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

async function proxyAi(req, res, rest) {
  const base = process.env.LERA_AI_BASE_URL;
  const key = process.env.LERA_AI_KEY;
  if (!base) {
    res.writeHead(501, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'AI proxy is not configured. Set LERA_AI_BASE_URL (and LERA_AI_KEY) in .env.' }));
    return;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    const upstream = await fetch(base.replace(/\/+$/, '') + rest, {
      method: req.method,
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
    });
    res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' });
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `AI proxy could not reach the provider: ${e.message}` }));
  }
}

/** @param {{dir: string, port?: number, live?: boolean}} o */
export function serve({ dir, port = 4173, live = false }) {
  loadEnv();
  const base = path.resolve(root, dir);
  const clients = new Set();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname.startsWith('/api/ai/')) return proxyAi(req, res, url.pathname.slice('/api/ai'.length) + url.search);
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
