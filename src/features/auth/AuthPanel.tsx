import { useEffect, useState, type FormEvent } from 'react';
import type { Language } from '../../shared/i18n';
import { translations } from '../../shared/i18n';

type User = { id: string; email: string; createdAt: string };
type AuthResponse = { user: User };
type Mode = 'login' | 'register' | 'reset';

export function AuthPanel({
  language,
  onAuthenticated,
  initialMode = 'register',
}: {
  language: Language;
  onAuthenticated?: () => void;
  initialMode?: Mode;
}) {
  const t = translations[language];
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [busy, setBusy] = useState(false);

  function showToast(message: string, type: 'info' | 'success' | 'error' = 'info') {
    window.dispatchEvent(new CustomEvent('template-toast', { detail: { message, type } }));
  }

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me', { credentials: 'include', signal: AbortSignal.timeout(15000) })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as AuthResponse;
      })
      .then((result) => {
        if (active) {
          setUser(result?.user ?? null);
          window.dispatchEvent(new CustomEvent('template-auth-changed', { detail: { authenticated: Boolean(result?.user) } }));
        }
      })
      .catch(() => {
        if (active) showToast(t.authError, 'error');
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });
    return () => {
      active = false;
    };
  }, [t.authError]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const endpoint = mode === 'reset' ? '/api/auth/password-reset/request' : `/api/auth/${mode}`;
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(15000),
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'reset' ? { email } : { email, password }),
      });
      const payload = (await response.json()) as AuthResponse | { error?: string };
      if (!response.ok) {
        showToast(mode === 'register' ? t.authRegisterError : mode === 'login' ? t.authLoginError : t.authError, 'error');
        return;
      }
      if (mode === 'reset') {
        setPassword('');
        showToast('Si cette adresse correspond à un compte, un lien de réinitialisation sera envoyé.', 'success');
        return;
      }
      if (!('user' in payload)) throw new Error(t.authError);
      setUser(payload.user);
      window.dispatchEvent(new CustomEvent('template-auth-changed', { detail: { authenticated: true } }));
      onAuthenticated?.();
      setPassword('');
      if (mode === 'register') showToast(t.authSuccess, 'success');
    } catch {
      showToast(t.authError, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error(t.authError);
      setUser(null);
      window.dispatchEvent(new CustomEvent('template-auth-changed', { detail: { authenticated: false } }));
      setPassword('');
    } catch {
      showToast(t.authError, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="auth-heading">
        <h2 id="auth-title">{t.authTitle}</h2>
        <p>{t.authIntro}</p>
      </div>
      {user ? (
        <div className="auth-profile">
          <p>{t.authWelcome}</p>
          <strong>{user.email}</strong>
          <button
            className="primary-button"
            type="button"
            onClick={() => void logout()}
            disabled={busy}
          >
            {t.authLogout}
          </button>
        </div>
      ) : (
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <p
            role="status"
            className="auth-message auth-loading-slot"
            aria-hidden={!checkingSession || Boolean(user)}
            style={{ visibility: checkingSession && !user ? 'visible' : 'hidden', minHeight: '1.3em' }}
          >
            {checkingSession && !user ? t.authLoading : '\u00a0'}
          </p>
          <label>
            {t.authEmail}
            <input
              autoComplete="email"
              type="email"
              name="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          {mode !== 'reset' && <label>
            {t.authPassword}
            <input
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              type="password"
              name="password"
              required
              minLength={mode === 'register' ? 12 : undefined}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>}
          <button className="primary-button" type="submit" disabled={busy || checkingSession}>
            {busy ? '…' : mode === 'reset' ? 'Envoyer le lien' : mode === 'register' ? t.authRegister : t.authLogin}
          </button>
          <button
            className="auth-mode-button"
            type="button"
            onClick={() => {
              setMode(mode === 'reset' ? 'login' : mode === 'register' ? 'login' : 'register');
            }}
          >
            {mode === 'reset' ? 'Retour à la connexion' : mode === 'register' ? t.authSwitchLogin : t.authSwitchRegister}
          </button>
          {mode === 'login' && <button className="auth-mode-button" type="button" onClick={() => setMode('reset')}>Mot de passe oublié ?</button>}
        </form>
      )}
    </section>
  );
}
