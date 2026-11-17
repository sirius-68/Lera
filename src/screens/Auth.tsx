import { useState } from 'react';
import { Lera, Mood } from '../mascot/Lera';
import { actions } from '../store';
import { checkResetCode, confirmReset, passwordProblem, requestReset, signIn, signUp, usesServer, validEmail } from '../store/auth';
import { Button3D, haptic } from '../ui/kit';
import { Icon } from '../ui/icons';
import '../styles/onb.css';
import { msg, t } from '../i18n';

/**
 * Create a profile, sign in, or reset a forgotten password.
 *
 * Lera watches the form: she reads along with the email, covers her eyes
 * while a password is typed, peeks through a magnifying glass when it is
 * shown, looks puzzled at a mistake and gives a thumbs-up when it works.
 */
export type AuthMode = 'signup' | 'signin' | 'forgot';

const COPY: Record<AuthMode, { title: string; sub: string; cta: string }> = {
  signup: { title: msg('Create a free profile to save your plan'), sub: msg('Your streak and notes stay yours.'), cta: msg('Create profile') },
  signin: { title: msg('Welcome back'), sub: msg('Sign in to pick up where you left off.'), cta: msg('Sign in') },
  forgot: { title: msg('Reset your password'), sub: msg('Enter your email and I’ll send a confirmation code.'), cta: msg('Send code') },
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
  // forgotten password runs in three steps: email, the code that was sent, then the new password
  const [stage, setStage] = useState<'email' | 'code' | 'new'>('email');
  const [code, setCode] = useState('');
  const [shown, setShown] = useState<string | null>(null);
  const resetting = mode === 'forgot';
  const needsPassword = !resetting || stage === 'new';
  const needsEmail = !resetting || stage === 'email';
  const copy = { title: t(COPY[mode].title), sub: t(COPY[mode].sub), cta: t(COPY[mode].cta) };
  const weak = mode !== 'signin' && needsPassword && password.length > 0 ? passwordProblem(password) : null;
  const ready = resetting
    ? stage === 'email' ? validEmail(email) : stage === 'code' ? /^\d{6}$/.test(code) : !passwordProblem(password)
    : validEmail(email) && (mode === 'signin' ? password.length > 0 : !passwordProblem(password));

  const mood: Mood = done ? 'thumbsup' : busy ? 'calculating' : error ? 'confused' : resetting && stage === 'code' ? 'detective' : focus === 'password' ? (show ? 'detective' : 'facepalm') : focus === 'email' ? 'reading' : mode === 'signin' ? 'wave' : resetting ? 'skeptical' : 'wink';

  const swap = (m: AuthMode) => {
    haptic(5);
    setMode(m);
    setError(null);
    setPassword('');
    setStage('email');
    setCode('');
    setShown(null);
  };

  const finishWith = (address: string) => {
    haptic([10, 40, 16]);
    setDone(true);
    actions.setProfile({ email: address, signedIn: true });
    setTimeout(onDone, 750);
  };

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const fail = (message: string) => {
      setBusy(false);
      haptic([12, 30, 12]);
      setError(message);
    };
    if (resetting) {
      if (stage === 'email') {
        const res = await requestReset(email);
        if (!res.ok) return fail(res.error);
        setShown(res.code ?? null);
        setStage('code');
      } else if (stage === 'code') {
        const res = checkResetCode(email, code);
        if (!res.ok) return fail(res.error);
        setStage('new');
      } else {
        const res = await confirmReset(email, code, password);
        if (!res.ok) return fail(res.error);
        setBusy(false);
        return finishWith(res.email);
      }
      setBusy(false);
      return;
    }
    const res = mode === 'signup' ? await signUp(email, password, name) : await signIn(email, password);
    if (!res.ok) return fail(res.error);
    setBusy(false);
    finishWith(res.email);
  };

  const sub = !resetting ? copy.sub : stage === 'email' ? copy.sub : stage === 'code' ? t('Enter the 6-digit code sent to {0}.', { 0: email.trim() }) : t('Code confirmed. Choose a new password.');
  const cta = done ? t('Done') : !resetting ? copy.cta : stage === 'email' ? t('Send code') : stage === 'code' ? t('Confirm code') : t('Set new password');

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
      <p className="auth-sub">{sub}</p>
      {resetting && <div className="auth-steps" aria-hidden="true">{(['email', 'code', 'new'] as const).map((st, i) => <i key={st} className={stage === st ? 'on' : ['email', 'code', 'new'].indexOf(stage) > i ? 'done' : ''} />)}</div>}

      {resetting && stage === 'code' && (
        <>
          {shown && !server && (
            <p className="auth-local">{t('No email service is connected to this build yet, so your code is shown here instead:')}{' '}<b>{shown}</b></p>
          )}
          <label className={`auth-field code ${focus === 'email' ? 'on' : ''}`}>
            <Icon name="lock" size={19} />
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="6-digit code"
              value={code}
              onFocus={() => setFocus('email')}
              onBlur={() => setFocus(null)}
              onChange={(e: { target: { value: string } }) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null); }}
              aria-label={t('Confirmation code')}
            />
          </label>
        </>
      )}

      {needsEmail && <label className={`auth-field ${focus === 'email' ? 'on' : ''}`}>
        <Icon name="mail" size={19} />
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={t('Email')}
          value={email}
          onFocus={() => setFocus('email')}
          onBlur={() => setFocus(null)}
          onChange={(e: { target: { value: string } }) => { setEmail(e.target.value); setError(null); }}
          aria-label={t('Email')}
        />
        {validEmail(email) && <span className="auth-ok"><Icon name="check" size={13} stroke={3.4} /></span>}
      </label>}

      {needsPassword && (
        <label className={`auth-field ${focus === 'password' ? 'on' : ''}`}>
          <Icon name="lock" size={19} />
          <input
            type={show ? 'text' : 'password'}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            placeholder={mode === 'forgot' ? t('New password') : t('Password')}
            value={password}
            onFocus={() => setFocus('password')}
            onBlur={() => setFocus(null)}
            onChange={(e: { target: { value: string } }) => { setPassword(e.target.value); setError(null); }}
            aria-label={mode === 'forgot' ? t('New password') : t('Password')}
          />
          <button type="button" className="auth-eye" onClick={() => { haptic(4); setShow(!show); }} aria-label={show ? t('Hide password') : t('Show password')}>
            <Icon name="eye" size={19} />
          </button>
        </label>
      )}

      <p className={`auth-note ${error ? 'bad' : ''}`} role={error ? 'alert' : undefined}>{error ?? weak ?? (mode === 'signup' ? '8 or more characters, with a number.' : ' ')}</p>

      <Button3D type="submit" sheen={ready} disabled={!ready} busy={busy} variant={done ? 'ok' : 'primary'}>{cta}</Button3D>

      <div className="auth-links">
        {mode === 'signin' && <button type="button" className="linkbtn" onClick={() => swap('forgot')}>{t('Forgot password?')}</button>}
        {mode === 'signup' && <span>{t('Existing user?')}{' '}<button type="button" className="linkbtn" onClick={() => swap('signin')}>{t('Sign in')}</button></span>}
        {mode === 'signin' && <span>{t('New here?')}{' '}<button type="button" className="linkbtn" onClick={() => swap('signup')}>{t('Create a profile')}</button></span>}
        {resetting && stage === 'code' && <button type="button" className="linkbtn" onClick={() => { setStage('email'); setCode(''); setShown(null); setError(null); }}>{t('Send a new code')}</button>}
        {resetting && <button type="button" className="linkbtn" onClick={() => swap('signin')}>{t('Back to sign in')}</button>}
        {onSkip && mode === 'signup' && <button type="button" className="linkbtn quiet" onClick={onSkip}>{t('Continue without a profile')}</button>}
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
