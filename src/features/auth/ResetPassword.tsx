import { useState, type FormEvent } from 'react';

export function ResetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const passwordRules = [
    { label: '12 caractères minimum', valid: password.length >= 12 },
    { label: 'Une lettre majuscule', valid: /[A-Z]/.test(password) },
    { label: 'Une lettre minuscule', valid: /[a-z]/.test(password) },
    { label: 'Un chiffre', valid: /[0-9]/.test(password) },
    { label: 'Un caractère spécial', valid: /[^A-Za-z0-9\s]/.test(password) },
  ];
  const passwordValid = passwordRules.every((rule) => rule.valid);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const token = new URLSearchParams(window.location.search).get('token') ?? '';
      const response = await fetch('/api/auth/password-reset/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const payload = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Lien invalide ou expiré.');
      window.dispatchEvent(
        new CustomEvent('template-toast', {
          detail: { message: payload.message ?? 'Mot de passe modifié.', type: 'success' },
        }),
      );
      setPassword('');
    } catch (error) {
      window.dispatchEvent(
        new CustomEvent('template-toast', {
          detail: {
            message:
              error instanceof Error
                ? error.message
                : 'Impossible de réinitialiser le mot de passe.',
            type: 'error',
          },
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="workspace-page">
      <span className="eyebrow">SÉCURITÉ DU COMPTE</span>
      <h1 className="workspace-title">
        Réinitialiser le mot de passe<span className="brand-period">.</span>
      </h1>
      <p className="workspace-intro">
        Choisissez un mot de passe de 12 à 128 caractères avec une majuscule, une minuscule, un
        chiffre et un caractère spécial.
      </p>
      <form className="checkout-form" onSubmit={(event) => void submit(event)}>
        <label>
          Nouveau mot de passe
          <input
            type="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby="reset-password-rules"
          />
          <ul id="reset-password-rules" className="password-rules" aria-live="polite">
            {passwordRules.map((rule) => (
              <li key={rule.label} className={rule.valid ? 'valid' : ''}>
                <span aria-hidden="true">{rule.valid ? '✓' : '○'}</span>
                {rule.label}
              </li>
            ))}
          </ul>
        </label>
        <button className="dark-button" type="submit" disabled={busy || !passwordValid}>
          {busy ? 'Enregistrement…' : 'Modifier le mot de passe'}
        </button>
      </form>
      <button className="back-link" onClick={onDone}>
        Retour à la boutique
      </button>
    </section>
  );
}
