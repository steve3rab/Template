import { useState, type FormEvent } from 'react';

export function ResetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const token = new URLSearchParams(window.location.search).get('token') ?? '';
      const response = await fetch('/api/auth/password-reset/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const payload = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Lien invalide ou expiré.');
      setMessage(payload.message ?? 'Mot de passe modifié.');
      setPassword('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Impossible de réinitialiser le mot de passe.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="workspace-page">
      <span className="eyebrow">SÉCURITÉ DU COMPTE</span>
      <h1 className="workspace-title">Réinitialiser le mot de passe<span className="brand-period">.</span></h1>
      <p className="workspace-intro">Choisissez un nouveau mot de passe de 12 à 128 caractères.</p>
      <form className="checkout-form" onSubmit={(event) => void submit(event)}>
        <label>Nouveau mot de passe<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <button className="dark-button" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Modifier le mot de passe'}</button>
      </form>
      {message && <p role="status">{message}</p>}
      <button className="back-link" onClick={onDone}>Retour à la boutique</button>
    </section>
  );
}
