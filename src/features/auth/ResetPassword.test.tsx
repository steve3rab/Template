import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResetPassword } from './ResetPassword';

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('ResetPassword', () => {
  it('enforces the full password policy before submitting a reset', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: 'Password updated.' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    window.history.replaceState({}, '', '/reset-password?token=reset-token');

    render(<ResetPassword onDone={vi.fn()} />);
    const submit = screen.getByRole('button', { name: 'Modifier le mot de passe' });
    const password = screen.getByLabelText(/nouveau mot de passe/i);

    await user.type(password, 'lowercaseonlypassword');
    expect(submit).toBeDisabled();

    await user.clear(password);
    await user.type(password, 'New-secure-passphrase2026!');
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/password-reset/complete',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'reset-token', password: 'New-secure-passphrase2026!' }),
      }),
    );
  });
});
