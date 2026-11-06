import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResetPassword } from './ResetPassword';

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');

  it('does not submit when the reset link has no token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<ResetPassword onDone={vi.fn()} language="en" />);

    expect(
      screen.getByRole('alert'),
    ).toHaveTextContent(/link is incomplete or invalid/i);
    expect(screen.getByRole('button', { name: /update password/i })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows a localized error when the reset token has expired', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Invalid or expired link.' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    window.history.replaceState({}, '', '/reset-password?token=expired-token');

    render(<ResetPassword onDone={vi.fn()} language="en" />);
    await user.type(screen.getByLabelText(/new password/i), 'New-secure-passphrase2026!');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Invalid or expired link.')).toBeInTheDocument();
  });

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

  it('renders password reset guidance in English', () => {
    render(<ResetPassword onDone={vi.fn()} language="en" />);
    expect(screen.getByRole('heading', { name: /reset your password/i })).toBeInTheDocument();
    expect(
      screen.getByText(/choose a password between 12 and 128 characters/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /update password/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /back to shop/i })).toBeInTheDocument();
  });
});
