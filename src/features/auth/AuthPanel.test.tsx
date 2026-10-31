import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthPanel } from './AuthPanel';

const registeredUser = {
  id: 'user-1',
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
  it('registers a user, sends credentials to the API and supports logout', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(false))
      .mockResolvedValueOnce(response(true, { user: registeredUser }, 201))
      .mockResolvedValueOnce(response(true, undefined, 204));
    vi.stubGlobal('fetch', fetchMock);

    render(<AuthPanel language="fr" />);
    await waitFor(() =>
      expect(screen.queryByText('Chargement du compte…')).not.toBeInTheDocument(),
    );

    await user.type(screen.getByLabelText(/adresse e-mail/i), 'test@example.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'correct-horse-battery');
    await user.click(screen.getByRole('button', { name: 'Créer un compte' }));

    expect(await screen.findByText('test@example.com')).toBeInTheDocument();
    expect(toastMessages).toContain('Compte créé et connecté.');
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/auth/register',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: 'correct-horse-battery' }),
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    expect(await screen.findByLabelText(/adresse e-mail/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/auth/logout',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );
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
    await user.type(screen.getByLabelText(/password/i), 'correct-horse-battery');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('test@example.com')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', password: 'correct-horse-battery' }),
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
    await user.type(screen.getByLabelText(/password/i), 'correct-horse-battery');
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
});
