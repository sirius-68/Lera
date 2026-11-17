import { t } from '../i18n';
/**
 * Accounts.
 *
 * Two ways to run, chosen when the app is built:
 *
 *  - No server (the default). The account lives on this device only: the
 *    email and a salted, stretched hash of the password sit in local
 *    storage. It keeps someone who picks up the phone out of the app; it
 *    does not sync or recover anything.
 *
 *  - A server. Build with LERA_AUTH_URL set and the same calls go to
 *    POST {url}/signup, /signin, /reset ({ email }: emails a 6-digit code) and
 *    /reset/confirm ({ email, code, password }), all expecting { ok: true } or { error }.
 */
declare const __LERA_AUTH_URL__: string | undefined;
const REMOTE = typeof __LERA_AUTH_URL__ !== 'undefined' && __LERA_AUTH_URL__ ? __LERA_AUTH_URL__.replace(/\/$/, '') : '';

const KEY = 'lera.account.v1';

export interface Account {
  email: string;
  name: string;
  salt: string;
  hash: string;
  createdAt: string;
}

export type AuthResult = { ok: true; email: string } | { ok: false; error: string };

export const usesServer = (): boolean => REMOTE !== '';

export const validEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

/** Why a password is not acceptable yet, or null when it is. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return t('Use at least 8 characters.');
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return t('Mix letters and at least one number.');
  return null;
}

export function getAccount(): Account | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Account) : null;
  } catch {
    return null;
  }
}

const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** PBKDF2-SHA256 where the browser offers it; a plain repeated hash otherwise, so sign-in still works on old web views. */
export async function stretch(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const key = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 120000 }, key, 256);
    return `p2$${hex(new Uint8Array(bits))}`;
  }
  let h = 2166136261;
  const text = `${salt}:${password}`;
  for (let round = 0; round < 4000; round++) for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return `f1$${(h >>> 0).toString(16)}`;
}

function newSalt(): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return hex(bytes);
}

async function remote(path: string, body: Record<string, string>): Promise<AuthResult> {
  try {
    const res = await fetch(`${REMOTE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (res.ok && data.ok !== false) return { ok: true, email: body.email };
    return { ok: false, error: data.error ?? t('That didn’t work. Check the details and try again.') };
  } catch {
    return { ok: false, error: t('No connection to the server. Try again in a moment.') };
  }
}

export async function signUp(email: string, password: string, name: string): Promise<AuthResult> {
  email = email.trim().toLowerCase();
  if (!validEmail(email)) return { ok: false, error: t('That email doesn’t look right.') };
  const problem = passwordProblem(password);
  if (problem) return { ok: false, error: problem };
  if (REMOTE) return remote('/signup', { email, password, name });
  const existing = getAccount();
  if (existing && existing.email !== email) return { ok: false, error: t('This phone already has a profile for {0}. Sign in instead.', { 0: existing.email }) };
  const salt = newSalt();
  const account: Account = { email, name, salt, hash: await stretch(password, salt), createdAt: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify(account));
  return { ok: true, email };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  email = email.trim().toLowerCase();
  if (!validEmail(email)) return { ok: false, error: t('That email doesn’t look right.') };
  if (REMOTE) return remote('/signin', { email, password });
  const account = getAccount();
  if (!account) return { ok: false, error: t('There’s no profile on this phone yet. Create one first.') };
  if (account.email !== email || (await stretch(password, account.salt)) !== account.hash) return { ok: false, error: t('Email or password is wrong.') };
  return { ok: true, email };
}

/** A reset that has been asked for and not yet confirmed (no server: kept in memory only, ten minutes). */
let pending: { email: string; code: string; until: number } | null = null;

export type ResetStart = { ok: true; email: string; /** Set only when there is no server to email it. */ code?: string } | { ok: false; error: string };

/**
 * Forgotten password, step 1: ask for a confirmation code for this email.
 * With a server the code is emailed (POST /reset). Without one there is nothing that can send an email,
 * so the code is handed back to be shown on the phone itself.
 */
export async function requestReset(email: string): Promise<ResetStart> {
  email = email.trim().toLowerCase();
  if (!validEmail(email)) return { ok: false, error: t('That email doesn’t look right.') };
  if (REMOTE) return remote('/reset', { email });
  const account = getAccount();
  if (!account || account.email !== email) return { ok: false, error: t('No profile with that email on this phone.') };
  const n = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(n);
  else n[0] = Math.floor(Math.random() * 1e9);
  const code = String(n[0] % 1000000).padStart(6, '0');
  pending = { email, code, until: Date.now() + 10 * 60 * 1000 };
  return { ok: true, email, code };
}

/** Step 2: is this the code that was sent? (With a server the code is checked there, together with step 3.) */
export function checkResetCode(email: string, code: string): AuthResult {
  email = email.trim().toLowerCase();
  if (!/^\d{6}$/.test(code.trim())) return { ok: false, error: t('The code is six digits.') };
  if (REMOTE) return { ok: true, email };
  if (!pending || pending.email !== email || Date.now() > pending.until) return { ok: false, error: t('That code has expired. Ask for a new one.') };
  if (pending.code !== code.trim()) return { ok: false, error: t('That code isn’t right.') };
  return { ok: true, email };
}

/** Step 3: set the new password. Only works with the code from step 1. */
export async function confirmReset(email: string, code: string, newPassword: string): Promise<AuthResult> {
  email = email.trim().toLowerCase();
  const problem = passwordProblem(newPassword);
  if (problem) return { ok: false, error: problem };
  if (REMOTE) return remote('/reset/confirm', { email, code: code.trim(), password: newPassword });
  const checked = checkResetCode(email, code);
  if (!checked.ok) return checked;
  const account = getAccount();
  if (!account || account.email !== email) return { ok: false, error: t('No profile with that email on this phone.') };
  const salt = newSalt();
  localStorage.setItem(KEY, JSON.stringify({ ...account, salt, hash: await stretch(newPassword, salt) }));
  pending = null;
  return { ok: true, email };
}

