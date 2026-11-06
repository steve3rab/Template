import { useState, type FormEvent } from 'react';
import { translateText, type Language } from '../../shared/i18n';

export function ResetPassword({
  onDone,
  language = 'fr',
}: {
  onDone: () => void;
  language?: Language;
}) {
  const t = (fr: string, en: string) => translateText(language, fr, en);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const passwordRules = [
    { label: t('12 caractères minimum', 'At least 12 characters'), valid: password.length >= 12 },
    { label: t('Une lettre majuscule', 'One uppercase letter'), valid: /[A-Z]/.test(password) },
    { label: t('Une lettre minuscule', 'One lowercase letter'), valid: /[a-z]/.test(password) },
    { label: t('Un chiffre', 'One number'), valid: /[0-9]/.test(password) },
    {
      label: t('Un caractère spécial', 'One special character'),
      valid: /[^A-Za-z0-9\s]/.test(password),
    },
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
      if (!response.ok)
        throw new Error(payload.error ?? t('Lien invalide ou expiré.', 'Invalid or expired link.'));
      window.dispatchEvent(
        new CustomEvent('template-toast', {
          detail: { message: t('Mot de passe modifié.', 'Password updated.'), type: 'success' },
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
                : t(
                    'Impossible de réinitialiser le mot de passe.',
                    'Unable to reset the password.',
                  ),
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
      <span className="eyebrow">{t('SÉCURITÉ DU COMPTE', 'ACCOUNT SECURITY')}</span>
      <h1 className="workspace-title">
        {t('Réinitialiser le mot de passe', 'Reset your password')}
        <span className="brand-period">.</span>
      </h1>
      <p className="workspace-intro">
        {t(
          'Choisissez un mot de passe de 12 à 128 caractères avec une majuscule, une minuscule, un chiffre et un caractère spécial.',
          'Choose a password between 12 and 128 characters, including an uppercase letter, a lowercase letter, a number and a special character.',
        )}
      </p>
      <form className="checkout-form" onSubmit={(event) => void submit(event)}>
        <label>
          {t('Nouveau mot de passe', 'New password')}
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
          {busy
            ? t('Enregistrement…', 'Saving…')
            : t('Modifier le mot de passe', 'Update password')}
        </button>
      </form>
      <button className="back-link" onClick={onDone}>
        {t('Retour à la boutique', 'Back to shop')}
      </button>
    </section>
  );
}
