import { useEffect, useState, type FormEvent } from 'react';
import type { Language } from '../../shared/i18n';
import { TextField } from '../../shared/components/TextField';
import { translations } from '../../shared/i18n';

type User = { id: string; publicId: string; email: string; role: string; createdAt: string };
type AuthResponse = { user: User };
type Mode = 'login' | 'register' | 'verify' | 'reset';

export function AuthPanel({
  language,
  onAuthenticated,
  initialMode = 'register',
}: {
  language: Language;
  onAuthenticated?: (user: User) => void;
  initialMode?: Mode;
}) {
  const t = translations[language];
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [busy, setBusy] = useState(false);
  const passwordRules = [
    { label: t.passwordRuleLength, valid: password.length >= 12 },
    { label: t.passwordRuleUppercase, valid: /[A-Z]/.test(password) },
    { label: t.passwordRuleLowercase, valid: /[a-z]/.test(password) },
    { label: t.passwordRuleNumber, valid: /[0-9]/.test(password) },
    { label: t.passwordRuleSpecial, valid: /[^A-Za-z0-9\s]/.test(password) },
  ];
  const passwordValid = passwordRules.every((rule) => rule.valid);

  function showToast(message: string, type: 'info' | 'success' | 'error' = 'info') {
    window.dispatchEvent(new CustomEvent('template-toast', { detail: { message, type } }));
  }

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    void fetch('/api/auth/me', { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          if (active) {
            setUser(null);
            window.dispatchEvent(
              new CustomEvent('template-auth-changed', {
                detail: { authenticated: false, role: '' },
              }),
            );
          }
          return;
        }
        if (!response.ok) throw new Error('Session check failed');
        const result = (await response.json()) as AuthResponse;
        if (!result?.user) throw new Error('Invalid session response');
        if (active) {
          setUser(result.user);
          window.dispatchEvent(
            new CustomEvent('template-auth-changed', {
              detail: { authenticated: true, role: result.user.role },
            }),
          );
        }
      })
      .catch(() => {
        // A network/server failure is not proof that the session is invalid.
        if (active) showToast(t.authError, 'error');
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setCheckingSession(false);
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [t.authError]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const submittedMode = mode;
    setBusy(true);
    try {
      const endpoint =
        submittedMode === 'reset'
          ? '/api/auth/password-reset/request'
          : submittedMode === 'verify'
            ? '/api/auth/register/verify'
            : `/api/auth/${submittedMode}`;
      const requestBody =
        submittedMode === 'reset'
          ? { email }
          : submittedMode === 'verify'
            ? { email, code: verificationCode }
            : { email, password };
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(15000),
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const payload = (await response.json()) as
        AuthResponse | { error?: string; verificationRequired?: boolean; developmentCode?: string };
      if (!response.ok) {
        const localizedMessage =
          submittedMode === 'register'
            ? t.authRegisterError
            : submittedMode === 'login'
              ? t.authLoginError
              : t.authError;
        showToast(localizedMessage, 'error');
        return;
      }
      if (submittedMode === 'register' && 'verificationRequired' in payload) {
        setMode('verify');
        setPassword('');
        setVerificationCode('');
        showToast(
          'developmentCode' in payload && payload.developmentCode
            ? `${t.authVerificationSent} ${language === 'en' ? 'Local code:' : 'Code local :'} ${payload.developmentCode}`
            : t.authVerificationSent,
          'success',
        );
        return;
      }
      if (submittedMode === 'reset') {
        setPassword('');
        showToast(t.authResetNotice, 'success');
        return;
      }
      if (!('user' in payload)) throw new Error(t.authError);
      setUser(payload.user);
      window.dispatchEvent(
        new CustomEvent('template-auth-changed', {
          detail: { authenticated: true, role: payload.user.role },
        }),
      );
      onAuthenticated?.(payload.user);
      setPassword('');
      if (submittedMode === 'verify') {
        setMode('login');
        showToast(t.authSuccess, 'success');
      }
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
      window.dispatchEvent(
        new CustomEvent('template-auth-changed', { detail: { authenticated: false } }),
      );
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
          <span className="account-public-id">
            {t.userIdentifier}: {user.publicId}
          </span>
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
            style={{
              visibility: checkingSession && !user ? 'visible' : 'hidden',
              minHeight: '1.3em',
            }}
          >
            {checkingSession && !user ? t.authLoading : '\u00a0'}
          </p>
          <TextField
            className="auth-form-input"
            label={t.authEmail}
            autoComplete="email"
            type="email"
            name="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {mode !== 'reset' && mode !== 'verify' && (
            <label>
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
                aria-describedby={mode === 'register' ? 'password-rules' : undefined}
              />
              {mode === 'register' && (
                <ul id="password-rules" className="password-rules" aria-live="polite">
                  {passwordRules.map((rule) => (
                    <li key={rule.label} className={rule.valid ? 'valid' : ''}>
                      <span aria-hidden="true">{rule.valid ? '✓' : '○'}</span>
                      {rule.label}
                    </li>
                  ))}
                </ul>
              )}
            </label>
          )}
          {mode === 'verify' && (
            <TextField
              className="auth-form-input"
              label={t.authVerificationCode}
              hint={t.authVerificationHint}
              autoComplete="one-time-code"
              inputMode="numeric"
              type="text"
              name="verificationCode"
              required
              minLength={10}
              maxLength={10}
              pattern="[0-9]{10}"
              value={verificationCode}
              onChange={(event) =>
                setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 10))
              }
            />
          )}
          <button
            className="primary-button"
            type="submit"
            disabled={
              busy ||
              checkingSession ||
              (mode === 'register' && !passwordValid) ||
              (mode === 'verify' && verificationCode.length !== 10)
            }
          >
            {busy
              ? t.authSubmitting
              : mode === 'reset'
                ? t.authReset
                : mode === 'register'
                  ? t.authRegister
                  : mode === 'verify'
                    ? t.authVerify
                    : t.authLogin}
          </button>
          <button
            className="auth-mode-button"
            type="button"
            onClick={() => {
              if (busy) return;
              setMode(
                mode === 'reset'
                  ? 'login'
                  : mode === 'verify'
                    ? 'register'
                    : mode === 'register'
                      ? 'login'
                      : 'register',
              );
            }}
            disabled={busy}
          >
            {mode === 'reset'
              ? t.authBackToLogin
              : mode === 'verify'
                ? t.authChangeEmail
                : mode === 'register'
                  ? t.authSwitchLogin
                  : t.authSwitchRegister}
          </button>
          {mode === 'login' && (
            <button
              className="auth-mode-button"
              type="button"
              onClick={() => setMode('reset')}
              disabled={busy}
            >
              {t.authForgotPassword}
            </button>
          )}
        </form>
      )}
    </section>
  );
}
