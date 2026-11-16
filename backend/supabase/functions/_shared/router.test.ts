import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChatRequest, firstJson, handle, plan, route, TASKS } from './router.ts';

/** A pretend provider: answers by model name, and records who was asked. */
function fake(answers: Record<string, string | number>) {
  const asked: string[] = [];
  const bodies: Record<string, unknown>[] = [];
  const fetcher = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    bodies.push(body);
    const model = String(body.model);
    asked.push(model);
    const a = answers[model];
    if (typeof a === 'number') return new Response('busy', { status: a });
    return new Response(JSON.stringify({ content: [{ type: 'text', text: a ?? '' }] }), { status: 200 });
  }) as typeof fetch;
  return { fetcher, asked, bodies };
}

const env = { ANTHROPIC_API_KEY: 'sk-test' };
const req = (task: string, user = 'hi', extra: Partial<ChatRequest> = {}): ChatRequest => ({ messages: [{ role: 'system', content: 'be Lera' }, { role: 'user', content: user }], lera: { task }, ...extra });

test('each job starts at its own model', async () => {
  const f = fake({ 'claude-haiku-5-5': '{"title":"Signs flip","message":"m"}', 'claude-sonnet-5-5': 'Hello', 'claude-opus-5-5': '{"correct":true,"feedback":""}' });
  assert.equal((await route(req('diagnose'), env, f.fetcher)).model, 'anthropic/claude-haiku-5-5');
  assert.equal((await route(req('chat'), env, f.fetcher)).model, 'anthropic/claude-sonnet-5-5');
  assert.equal((await route(req('checkOpen'), env, f.fetcher)).model, 'anthropic/claude-opus-5-5');
});

test('an answer that fails its check goes to the next model up', async () => {
  const f = fake({ 'claude-haiku-5-5': 'Sorry, I cannot', 'claude-sonnet-5-5': '{"title":"Divide every term","message":"m"}' });
  const a = await route(req('diagnose'), env, f.fetcher);
  assert.deepEqual(f.asked, ['claude-haiku-5-5', 'claude-sonnet-5-5']);
  assert.equal(a.model, 'anthropic/claude-sonnet-5-5');
});

test('a translation must come back with as many paragraphs as went in', async () => {
  const f = fake({ 'claude-sonnet-5-5': '["un"]', 'claude-opus-5-5': '["un", "deux"]' });
  const a = await route(req('translate', '["one", "two"]'), env, f.fetcher);
  assert.equal(a.reply, '["un", "deux"]');
  assert.deepEqual(f.asked, ['claude-sonnet-5-5', 'claude-opus-5-5']);
});

test('a busy model is skipped; a request the provider calls wrong is not retried', async () => {
  const busy = fake({ 'claude-sonnet-5-5': 529, 'claude-opus-5-5': 'Here is why' });
  assert.equal((await route(req('chat'), env, busy.fetcher)).reply, 'Here is why');
  const bad = fake({ 'claude-sonnet-5-5': 400, 'claude-opus-5-5': 'never' });
  await assert.rejects(route(req('chat'), env, bad.fetcher));
  assert.deepEqual(bad.asked, ['claude-sonnet-5-5']);
});

test('the app can say a problem is already hard, and start higher', () => {
  assert.deepEqual(plan(TASKS.simplify, 0), ['easy', 'medium']);
  assert.deepEqual(plan(TASKS.simplify, 1), ['medium', 'hard']);
  assert.deepEqual(plan(TASKS.chat, 2), ['hard']);
});

test('a tier can be another company’s model', async () => {
  const seen: string[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    seen.push(`${url} ${JSON.parse(String(init.body)).model}`);
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
  }) as typeof fetch;
  await route(req('simplify'), { ...env, LERA_MODEL_EASY: 'openai/some-model', OPENAI_BASE_URL: 'https://other.example/v1/' }, fetcher);
  assert.deepEqual(seen, ['https://other.example/v1/chat/completions some-model']);
});

test('replies are capped per job, and unknown jobs are refused', async () => {
  const f = fake({ 'claude-sonnet-5-5': 'ok' });
  await route(req('chat', 'hi', { max_tokens: 100000 }), env, f.fetcher);
  assert.equal(f.bodies[0].max_tokens, TASKS.chat.maxTokens);
  assert.equal(f.bodies[0].system, 'be Lera');
  await assert.rejects(route(req('write-my-essay'), env, f.fetcher), /Unknown task/);
});

test('over HTTP: OpenAI-shaped in and out, a daily limit, and no provider details leak', async () => {
  const f = fake({ 'claude-sonnet-5-5': 'Hi there' });
  const post = (body: unknown, allow = async () => true) =>
    handle(new Request('https://x/lera-ai', { method: 'POST', headers: { 'x-lera-device': 'd1' }, body: JSON.stringify(body) }), env, { fetcher: f.fetcher, allow });
  const ok = await post(req('chat'));
  assert.equal(ok.status, 200);
  assert.equal(((await ok.json()) as { choices: { message: { content: string } }[] }).choices[0].message.content, 'Hi there');
  assert.equal((await post(req('chat'), async () => false)).status, 429);
  const down = fake({ 'claude-sonnet-5-5': 500, 'claude-opus-5-5': 500 });
  const res = await handle(new Request('https://x', { method: 'POST', body: JSON.stringify(req('chat')) }), env, { fetcher: down.fetcher });
  assert.equal(res.status, 502);
  assert.doesNotMatch(await res.text(), /sk-test|busy/);
});

test('JSON is found inside a chatty reply', () => {
  assert.deepEqual(firstJson('Sure! ```json\n["a", "b"]\n```'), ['a', 'b']);
  assert.equal(firstJson('none here'), undefined);
});
