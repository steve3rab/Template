import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashToken } from './tokenHash.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('hashToken', () => {
  it('returns a stable SHA-256 HMAC digest for the same token and secret', () => {
    const first = hashToken('opaque-token', 'a-test-secret');
    const second = hashToken('opaque-token', 'a-test-secret');

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes the digest when the token or secret changes', () => {
    const original = hashToken('opaque-token', 'first-secret');

    expect(hashToken('different-token', 'first-secret')).not.toBe(original);
    expect(hashToken('opaque-token', 'second-secret')).not.toBe(original);
  });

  it('uses the configured session secret by default', () => {
    vi.stubEnv('SESSION_SECRET', 'configured-session-secret');

    expect(hashToken('opaque-token')).toBe(
      hashToken('opaque-token', 'configured-session-secret'),
    );
  });

  it('does not return the raw token', () => {
    const token = 'a-raw-recovery-token';

    expect(hashToken(token, 'a-test-secret')).not.toContain(token);
  });
});
