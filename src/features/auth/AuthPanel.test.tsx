import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthPanel } from './AuthPanel';

const registeredUser = {
  id: 'user-1',
  publicId: 'USR-123456',
  role: 'CUSTOMER',
  email: 'test@example.com',
  createdAt: '2026-10-29T00:00:00.000Z',
};

function response(ok: boolean, body?: unknown, status = ok ? 200 : 401) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

let toastMessages: string[] = [];
const onToast = (event: Event) => {
  if (event instanceof CustomEvent && typeof event.detail?.message === 'string') {
    toastMessages.push(event.detail.message);
  }
};

beforeEach(() => {
  toastMessages = [];
  window.addEventListener('template-toast', onToast);
});

afterEach(() => {
  window.removeEventListener('template-toast', onToast);
  vi.unstubAllGlobals();
});

describe('AuthPanel', () => {
  it('requires email verification before creating a session and supports logout', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(false))
      .mockResolvedValueOnce(
        response(true, { verificationRequired: true, developmentCode: '1234567890' }, 202),
      )
      .mockResolvedValueOnce(response(true, { user: registeredUser }, 201))
      .mockResolvedValueOnce(response(true, undefined, 204));
    vi.stubGlobal('fetch', fetchMock);

    render(<AuthPanel language="fr" />);
    await waitFor(() =>
      expect(screen.queryByText('Chargement du compte…')).not.toBeInTheDocument(),
    );

    await user.type(screen.getByLabelText(/adresse e-mail/i), 'test@example.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'Correct-horse-battery-2026!');
    expect(screen.getByRole('button', { name: 'Créer un compte' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Créer un compte' }));

    expect(await screen.findByLabelText(/code de vérification/i)).toBeInTheDocument();
    expect(toastMessages.some((message) => message.includes('1234567890'))).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/auth/register',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'Correct-horse-battery-2026!',
        }),
      }),
    );

    await user.type(screen.getByLabelText(/code de vérification/i), '1234567890');
    await user.click(screen.getByRole('button', { name: 'Vérifier mon adresse e-mail' }));
    expect(await screen.findByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByText(/USR-123456/)).toBeInTheDocument();
    expect(toastMessages).toContain('Votre compte a été créé. Vous êtes connecté.');
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/auth/register/verify',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', code: '1234567890' }),
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    expect(await screen.findByLabelText(/adresse e-mail/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('shows every password requirement and blocks weak registration passwords', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(false)));
    render(<AuthPanel language="en" />);
    await waitFor(() => expect(screen.queryByText('Loading account…')).not.toBeInTheDocument());

    await user.type(screen.getByLabelText(/email address/i), 'new@example.test');
    const password = screen.getByLabelText(/password/i);
    const submit = screen.getByRole('button', { name: 'Create account' });
    await user.type(password, 'lowercaseonlypassword');
    expect(submit).toBeDisabled();
    expect(screen.getByText('At least 12 characters')).toBeInTheDocument();
    expect(screen.getByText('One uppercase letter')).toBeInTheDocument();
    expect(screen.getByText('One number')).toBeInTheDocument();
    expect(screen.getByText('One special character')).toBeInTheDocument();

    await user.clear(password);
    await user.type(password, 'Correct-horse-battery-2026!');
    expect(submit).toBeEnabled();
  });

  it('allows sign-in and restores an existing session', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(true, { user: registeredUser }))
      .mockResolvedValueOnce(response(false, { error: 'Temporary failure.' }, 500))
      .mockResolvedValueOnce(response(true, { user: registeredUser }));
    vi.stubGlobal('fetch', fetchMock);

    render(<AuthPanel language="en" />);
    expect(await screen.findByText('test@example.com')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(toastMessages).toContain('Something went wrong. Please try again.'));
    expect(screen.getByText('test@example.com')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByLabelText(/email address/i)).toBeInTheDocument();
  });

  it('switches to sign-in mode and submits login credentials', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(false))
      .mockResolvedValueOnce(response(true, { user: registeredUser }));
    vi.stubGlobal('fetch', fetchMock);

    render(<AuthPanel language="en" />);
    await waitFor(() => expect(screen.queryByText('Loading account…')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /already registered/i }));
    await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'Correct-horse-battery-2026!');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('test@example.com')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', password: 'Correct-horse-battery-2026!' }),
      }),
    );
  });

  it('shows a useful message when the API rejects registration', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(false))
      .mockResolvedValueOnce(
        response(false, { error: 'Unable to create account with these details.' }, 400),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<AuthPanel language="en" />);
    await waitFor(() => expect(screen.queryByText('Loading account…')).not.toBeInTheDocument());
    await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'Correct-horse-battery-2026!');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() =>
      expect(toastMessages).toContain(
        'Unable to create the account. Check your details or try another email address.',
      ),
    );
  });
  it('allows legacy passwords shorter than the registration minimum when signing in', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(false))
      .mockResolvedValueOnce(response(true, { user: registeredUser }));
    vi.stubGlobal('fetch', fetchMock);

    render(<AuthPanel language="en" initialMode="login" />);
    await waitFor(() => expect(screen.queryByText('Loading account…')).not.toBeInTheDocument());
    await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
    const passwordInput = screen.getByLabelText(/password/i);
    expect(passwordInput).not.toHaveAttribute('minLength');
    await user.type(passwordInput, 'legacy123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('test@example.com')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', password: 'legacy123' }),
      }),
    );
  });
  it('does not treat a temporary session API failure as a logout', async () => {
    const authEvents: boolean[] = [];
    const onAuthChanged = (event: Event) => {
      if (event instanceof CustomEvent) authEvents.push(event.detail?.authenticated);
    };
    window.addEventListener('template-auth-changed', onAuthChanged);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response(false, { error: 'Temporary failure.' }, 500)),
    );

    try {
      render(<AuthPanel language="en" />);
      await waitFor(() =>
        expect(toastMessages).toContain('Something went wrong. Please try again.'),
      );
      expect(authEvents).toEqual([]);
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    } finally {
      window.removeEventListener('template-auth-changed', onAuthChanged);
    }
  });

  it('shows localized password-reset actions and neutral confirmation feedback', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(false))
      .mockResolvedValueOnce(response(true, {}, 200));
    vi.stubGlobal('fetch', fetchMock);

    render(<AuthPanel language="en" initialMode="login" />);
    await waitFor(() => expect(screen.queryByText('Loading account…')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    await waitFor(() =>
      expect(toastMessages).toContain(
        'If an account exists for this address, a password reset link will be sent.',
      ),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/auth/password-reset/request',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
      }),
    );
  });
});
