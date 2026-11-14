import { useState } from 'react';
import { Lera, Mood } from '../mascot/Lera';
import { actions } from '../store';
import { passwordProblem, resetPassword, signIn, signUp, usesServer, validEmail } from '../store/auth';
import { Button3D, haptic, toast } from '../ui/kit';
import { Icon } from '../ui/icons';
import '../styles/onb.css';

/**
 * Create a profile, sign in, or reset a forgotten password.
 *
 * Lera watches the form: she reads along with the email, covers her eyes
 * while a password is typed, peeks through a magnifying glass when it is
 * shown, looks puzzled at a mistake and gives a thumbs-up when it works.
 */
export type AuthMode = 'signup' | 'signin' | 'forgot';

const COPY: Record<AuthMode, { title: string; sub: string; cta: string }> = {
  signup: { title: 'Create a free profile to save your plan', sub: 'Your streak and notes stay yours.', cta: 'Create profile' },
  signin: { title: 'Welcome back', sub: 'Sign in to pick up where you left off.', cta: 'Sign in' },
  forgot: { title: 'Reset your password', sub: '', cta: 'Set new password' },
};

export function AuthPanel({ mode: first, name = '', onDone, onSkip }: { mode: AuthMode; name?: string; onDone: () => void; onSkip?: () => void }) {
  const [mode, setMode] = useState<AuthMode>(first);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [focus, setFocus] = useState<'email' | 'password' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const server = usesServer();
  const needsPassword = mode !== 'forgot' || !server;
  const copy = COPY[mode];
  const weak = mode !== 'signin' && needsPassword && password.length > 0 ? passwordProblem(password) : null;
  const ready = validEmail(email) && (!needsPassword || (mode === 'signin' ? password.length > 0 : !passwordProblem(password)));

  const mood: Mood = done ? 'thumbsup' : busy ? 'calculating' : error ? 'confused' : focus === 'password' ? (show ? 'detective' : 'facepalm') : focus === 'email' ? 'reading' : mode === 'signin' ? 'wave' : mode === 'forgot' ? 'skeptical' : 'wink';

  const swap = (m: AuthMode) => {
    haptic(5);
    setMode(m);
    setError(null);
    setPassword('');
  };

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const res = mode === 'signup' ? await signUp(email, password, name) : mode === 'signin' ? await signIn(email, password) : await resetPassword(email, server ? undefined : password);
    setBusy(false);
    if (!res.ok) {
      haptic([12, 30, 12]);
      setError(res.error);
      return;
    }
    if (mode === 'forgot' && server) {
      toast('Check your inbox for a reset link.', 4000);
      swap('signin');
      return;
    }
    haptic([10, 40, 16]);
    setDone(true);
    actions.setProfile({ email: res.email, signedIn: true });
    setTimeout(onDone, 750);
  };

  return (
    <form
      className="auth"
      onSubmit={(e: { preventDefault(): void }) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="auth-lera"><Lera size={104} mood={mood} interactive={false} /></div>
      <h2 className="auth-title">{copy.title}</h2>
      <p className="auth-sub">{mode === 'forgot' ? (server ? 'We’ll email you a link.' : 'This profile lives on this phone, so you can set a new password right here.') : copy.sub}</p>

      <label className={`auth-field ${focus === 'email' ? 'on' : ''}`}>
        <Icon name="mail" size={19} />
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="Email"
          value={email}
          onFocus={() => setFocus('email')}
          onBlur={() => setFocus(null)}
          onChange={(e: { target: { value: string } }) => { setEmail(e.target.value); setError(null); }}
          aria-label="Email"
        />
        {validEmail(email) && <span className="auth-ok"><Icon name="check" size={13} stroke={3.4} /></span>}
      </label>

      {needsPassword && (
        <label className={`auth-field ${focus === 'password' ? 'on' : ''}`}>
          <Icon name="lock" size={19} />
          <input
            type={show ? 'text' : 'password'}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            placeholder={mode === 'forgot' ? 'New password' : 'Password'}
            value={password}
            onFocus={() => setFocus('password')}
            onBlur={() => setFocus(null)}
            onChange={(e: { target: { value: string } }) => { setPassword(e.target.value); setError(null); }}
            aria-label={mode === 'forgot' ? 'New password' : 'Password'}
          />
          <button type="button" className="auth-eye" onClick={() => { haptic(4); setShow(!show); }} aria-label={show ? 'Hide password' : 'Show password'}>
            <Icon name="eye" size={19} />
          </button>
        </label>
      )}

      <p className={`auth-note ${error ? 'bad' : ''}`} role={error ? 'alert' : undefined}>{error ?? weak ?? (mode === 'signup' ? '8 or more characters, with a number.' : ' ')}</p>

      <Button3D type="submit" sheen={ready} disabled={!ready} busy={busy} variant={done ? 'ok' : 'primary'}>{done ? 'Done' : mode === 'forgot' && server ? 'Send reset link' : copy.cta}</Button3D>

      <div className="auth-links">
        {mode === 'signin' && <button type="button" className="linkbtn" onClick={() => swap('forgot')}>Forgot password?</button>}
        {mode === 'signup' && <span>Existing user? <button type="button" className="linkbtn" onClick={() => swap('signin')}>Sign in</button></span>}
        {mode === 'signin' && <span>New here? <button type="button" className="linkbtn" onClick={() => swap('signup')}>Create a profile</button></span>}
        {mode === 'forgot' && <button type="button" className="linkbtn" onClick={() => swap('signin')}>Back to sign in</button>}
        {onSkip && mode === 'signup' && <button type="button" className="linkbtn quiet" onClick={onSkip}>Continue without a profile</button>}
      </div>
    </form>
  );
}

/** Shown in place of the app after signing out. */
export function AuthGate() {
  return (
    <div className="screen ob" data-dir="0">
      <div className="ob-step" style={{ justifyContent: 'center' }}>
        <AuthPanel mode="signin" onDone={() => undefined} />
      </div>
    </div>
  );
}
