import assert from 'node:assert/strict';
import { test } from 'node:test';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const auth = await import('./auth');

test('emails and passwords are checked before anything is stored', async () => {
  assert.equal(auth.validEmail('a@b.co'), true);
  assert.equal(auth.validEmail('not-an-email'), false);
  assert.ok(auth.passwordProblem('short1'));
  assert.ok(auth.passwordProblem('lettersonly'));
  assert.equal(auth.passwordProblem('algebra2026'), null);
  const bad = await auth.signUp('nope', 'algebra2026', 'Eko');
  assert.equal(bad.ok, false);
  assert.equal(auth.getAccount(), null);
});

test('sign up, then sign in with the right password only', async () => {
  const made = await auth.signUp('Eko@Example.com ', 'algebra2026', 'Eko');
  assert.deepEqual(made, { ok: true, email: 'eko@example.com' });
  const account = auth.getAccount()!;
  assert.equal(account.email, 'eko@example.com');
  assert.ok(!JSON.stringify(account).includes('algebra2026'), 'the password itself is never stored');
  assert.equal((await auth.signIn('eko@example.com', 'algebra2026')).ok, true);
  assert.equal((await auth.signIn('eko@example.com', 'algebra2027')).ok, false);
  assert.equal((await auth.signIn('other@example.com', 'algebra2026')).ok, false);
});

test('a second profile cannot silently replace the first', async () => {
  const again = await auth.signUp('someone@else.org', 'calculus2026', 'Sam');
  assert.equal(again.ok, false);
  assert.equal(auth.getAccount()!.email, 'eko@example.com');
});

test('a forgotten password can be reset on the phone that holds the profile', async () => {
  assert.equal((await auth.resetPassword('wrong@example.com')).ok, false);
  assert.equal((await auth.resetPassword('eko@example.com')).ok, true);
  assert.equal((await auth.resetPassword('eko@example.com', 'weak')).ok, false);
  assert.equal((await auth.resetPassword('eko@example.com', 'integrals99')).ok, true);
  assert.equal((await auth.signIn('eko@example.com', 'algebra2026')).ok, false);
  assert.equal((await auth.signIn('eko@example.com', 'integrals99')).ok, true);
});
