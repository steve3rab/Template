import { useEffect, useState, type FormEvent } from 'react';
import type { Language } from '../../shared/i18n';
import { translations } from '../../shared/i18n';

type User = { id: string; email: string; createdAt: string };
type AuthResponse = { user: User };
type Mode = 'login' | 'register';

export function AuthPanel({ language }: { language: Language }) {
  const t = translations[language];
  const [mode, setMode] = useState<Mode>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as AuthResponse;
      })
      .then((result) => {
        if (active) setUser(result?.user ?? null);
      })
      .catch(() => {
        if (active) setMessage(t.authError);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => { active = false; };
  }, [t.authError]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setIsError(false);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await response.json()) as AuthResponse | { error?: string };
      if (!response.ok || !('user' in payload)) {
        throw new Error('error' in payload && payload.error ? payload.error : t.authError);
      }
      setUser(payload.user);
      setPassword('');
      setMessage(mode === 'register' ? t.authSuccess : '');
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : t.authError);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error(t.authError);
      setUser(null);
      setPassword('');
    } catch {
      setIsError(true);
      setMessage(t.authError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="auth-heading">
        <span className="card-label">API · SQLITE</span>
        <h2 id="auth-title">{t.authTitle}</h2>
        <p>{t.authIntro}</p>
      </div>
      {busy && !user ? <p role="status" className="auth-message">{t.authLoading}</p> : null}
      {user ? (
        <div className="auth-profile">
          <p>{t.authWelcome}</p>
          <strong>{user.email}</strong>
          <button className="primary-button" type="button" onClick={() => void logout()} disabled={busy}>
            {t.authLogout}
          </button>
        </div>
      ) : (
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
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
          <label>
            {t.authPassword}
            <input
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              type="password"
              name="password"
              required
              minLength={12}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? '…' : mode === 'register' ? t.authRegister : t.authLogin}
          </button>
          <button
            className="auth-mode-button"
            type="button"
            onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setMessage(''); }}
          >
            {mode === 'register' ? t.authSwitchLogin : t.authSwitchRegister}
          </button>
        </form>
      )}
      {message ? <p className={isError ? 'auth-message auth-error' : 'auth-message'} role={isError ? 'alert' : 'status'}>{message}</p> : null}
    </section>
  );
}