import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';
import { AiError, chat, extractJson } from '../client';
import { localAnswer } from '../offline';
import { AiConfig, aiReady, NO_AI } from '../providers';
import { aiCheckOpen, aiStructure } from '../tasks';
import { ingestBytes, readText } from '../../ingest';

/**
 * No real provider is called here. A small local server stands in for an
 * OpenAI-compatible API so the request shape, the fallbacks and the error
 * messages can be checked.
 */
let server: http.Server;
let url = '';
const seen: { path: string; auth?: string; body: Record<string, unknown> }[] = [];
let reply: (body: Record<string, unknown>, path: string) => { status: number; json: unknown } = () => ({ status: 200, json: {} });

before(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = chunks.length ? (JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>) : {};
      seen.push({ path: req.url ?? '', auth: req.headers.authorization, body });
      const out = reply(body, req.url ?? '');
      res.writeHead(out.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out.json));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/v1/`;
});
after(() => server.close());

const cfg = (): AiConfig => ({ provider: 'custom', baseUrl: url, model: 'test-model', apiKey: 'sk-test' });
const says = (content: string) => ({ status: 200, json: { choices: [{ message: { role: 'assistant', content } }] } });

test('chat sends an OpenAI-style request and returns the reply text', async () => {
  seen.length = 0;
  reply = () => says('hello');
  assert.equal(await chat(cfg(), [{ role: 'user', content: 'hi' }], { task: 'chat', maxTokens: 20 }), 'hello');
  assert.equal(seen[0].path, '/v1/chat/completions');
  assert.equal(seen[0].auth, 'Bearer sk-test');
  assert.equal(seen[0].body.model, 'test-model');
  assert.equal(seen[0].body.max_tokens, 20);
});

test('a model that rejects JSON mode is retried without it', async () => {
  seen.length = 0;
  reply = (body) => (body.response_format ? { status: 400, json: { error: 'json mode unsupported' } } : says('{"ok":true}'));
  assert.equal(await chat(cfg(), [{ role: 'user', content: 'x' }], { task: 'diagnose', json: true }), '{"ok":true}');
  assert.equal(seen.length, 2);
});

test('errors are turned into sentences a student can act on', async () => {
  reply = () => ({ status: 401, json: {} });
  const job = { task: 'chat' } as const;
  await assert.rejects(chat(cfg(), [{ role: 'user', content: 'x' }], job), (e: unknown) => e instanceof AiError && e.status === 401 && /turned the request away/.test(e.message));
  reply = () => ({ status: 429, json: {} });
  await assert.rejects(chat(cfg(), [{ role: 'user', content: 'x' }], job), /Today’s limit/);
  await assert.rejects(chat({ ...cfg(), baseUrl: 'http://127.0.0.1:9/v1' }, [{ role: 'user', content: 'x' }], job), /Couldn’t reach/);
});

test('through Lera’s router: one address, the job named, no key sent, the phone’s id for the daily limit', async () => {
  seen.length = 0;
  reply = () => says('routed');
  const router: AiConfig = { provider: 'lera', baseUrl: `${url.replace(/\/+$/, '')}/lera-ai`, model: 'auto', apiKey: '' };
  assert.equal(await chat(router, [{ role: 'user', content: 'x' }], { task: 'translate', json: true }), 'routed');
  assert.equal(seen[0].path, '/v1/lera-ai');
  assert.equal(seen[0].auth, undefined);
  assert.deepEqual(seen[0].body.lera, { task: 'translate', level: 0 });
  assert.equal(seen[0].body.response_format, undefined);
});

test('JSON is recovered from a chatty reply', () => {
  assert.deepEqual(extractJson('Sure! ```json\n{"a": {"b": "}"}}\n``` hope that helps'), { a: { b: '}' } });
  assert.equal(extractJson('no json here'), null);
});

test('an open-problem check parses the verdict', async () => {
  reply = () => says('{"correct": false, "feedback": "Line 2 drops the 4."}');
  const v = await aiCheckOpen(cfg(), { id: 'p', kind: 'open', prompt: 'A word problem', given: '', concepts: [], source: 'notes' }, ['x = 3']);
  assert.deepEqual(v, { correct: false, feedback: 'Line 2 drops the 4.' });
});

test('when the model returns rubbish, notes are still organised by the built-in reader — with a warning', async () => {
  reply = () => says('I am not JSON.');
  const md = '# Algebra\n\n## Linear equations\n\nTo solve, undo each operation.\n\n### Exercises\n\n1. Solve 3x + 4 = 19\n2. Solve 2x - 5 = 9\n';
  await assert.rejects(aiStructure(cfg(), readText(md, 'n.md')));
  const doc = await ingestBytes(new TextEncoder().encode(md), 'n.md', { ai: cfg() });
  assert.equal(doc.via, 'local');
  assert.match(doc.warnings[0], /AI reader wasn’t available/);
  assert.equal(doc.units.flatMap((u) => u.topics).flatMap((t) => t.exercises).length, 2);
});

test('readiness needs an address, a model and (usually) a key', () => {
  assert.equal(aiReady(NO_AI), false);
  assert.equal(aiReady({ provider: 'custom', baseUrl: 'https://x', model: '', apiKey: '' }), false);
  assert.equal(aiReady({ provider: 'lera', baseUrl: 'https://x/lera-ai', model: 'auto', apiKey: '' }), true);
});

test('without a model, Lera still answers from the concept library', () => {
  const a = localAnswer('why do signs flip when I move a term?', {});
  assert.match(a, /Moving terms across the equals sign/);
  const hint = localAnswer('give me a hint', { problem: { id: 'p', kind: 'linear', prompt: 'Solve for x', given: '3x + 4 = 19', variable: 'x', concepts: ['inverse-operations'], source: 'notes' }, lines: [] });
  assert.ok(hint.length > 20 && !/x = 5/.test(hint));
  assert.match(localAnswer('what is the capital of France?', {}), /Settings/);
});
