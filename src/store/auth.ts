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
 *    POST {url}/signup, /signin and /reset with JSON bodies
 *    { email, password, name? }, expecting { ok: true } or { error }.
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
  if (password.length < 8) return 'Use at least 8 characters.';
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'Mix letters and at least one number.';
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
    return { ok: false, error: data.error ?? 'That didn’t work. Check the details and try again.' };
  } catch {
    return { ok: false, error: 'No connection to the server. Try again in a moment.' };
  }
}

export async function signUp(email: string, password: string, name: string): Promise<AuthResult> {
  email = email.trim().toLowerCase();
  if (!validEmail(email)) return { ok: false, error: 'That email doesn’t look right.' };
  const problem = passwordProblem(password);
  if (problem) return { ok: false, error: problem };
  if (REMOTE) return remote('/signup', { email, password, name });
  const existing = getAccount();
  if (existing && existing.email !== email) return { ok: false, error: `This phone already has a profile for ${existing.email}. Sign in instead.` };
  const salt = newSalt();
  const account: Account = { email, name, salt, hash: await stretch(password, salt), createdAt: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify(account));
  return { ok: true, email };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  email = email.trim().toLowerCase();
  if (!validEmail(email)) return { ok: false, error: 'That email doesn’t look right.' };
  if (REMOTE) return remote('/signin', { email, password });
  const account = getAccount();
  if (!account) return { ok: false, error: 'There’s no profile on this phone yet. Create one first.' };
  if (account.email !== email || (await stretch(password, account.salt)) !== account.hash) return { ok: false, error: 'Email or password is wrong.' };
  return { ok: true, email };
}

/**
 * Forgotten password. With a server this asks it to email a link. Without one, the profile
 * exists only on this phone — so the person who holds the phone may set a new password for it.
 */
export async function resetPassword(email: string, newPassword?: string): Promise<AuthResult> {
  email = email.trim().toLowerCase();
  if (!validEmail(email)) return { ok: false, error: 'That email doesn’t look right.' };
  if (REMOTE) return remote('/reset', { email });
  const account = getAccount();
  if (!account || account.email !== email) return { ok: false, error: 'No profile with that email on this phone.' };
  if (newPassword === undefined) return { ok: true, email };
  const problem = passwordProblem(newPassword);
  if (problem) return { ok: false, error: problem };
  const salt = newSalt();
  localStorage.setItem(KEY, JSON.stringify({ ...account, salt, hash: await stretch(newPassword, salt) }));
  return { ok: true, email };
}

export function forgetAccount(): void {
  localStorage.removeItem(KEY);
}
