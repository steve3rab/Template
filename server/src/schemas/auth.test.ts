import { describe, expect, it } from 'vitest';
import {
  emailSchema,
  loginCredentialsSchema,
  loginPasswordSchema,
  passwordResetCompleteCredentialsSchema,
  passwordSchema,
  registrationCredentialsSchema,
} from './auth.js';

describe('email validator', () => {
  it('trims whitespace and normalizes email to lowercase', () => {
    expect(emailSchema.parse('  USER.Name+shop@Example.COM  ')).toBe('user.name+shop@example.com');
  });

  it.each([
    '',
    'plain-text',
    'missing-at.example.com',
    'user@',
    '@example.com',
    'user name@example.com',
    'user@example..com',
    `user@${'a'.repeat(250)}.com`,
  ])('rejects invalid email: %s', (email) => {
    expect(emailSchema.safeParse(email).success).toBe(false);
  });

  it('applies email and password validation together during registration', () => {
    expect(
      registrationCredentialsSchema.safeParse({
        email: 'shopper@example.com',
        password: 'correct-horse-battery',
      }).success,
    ).toBe(true);
    expect(
      registrationCredentialsSchema.safeParse({
        email: 'invalid-email',
        password: 'correct-horse-battery',
      }).success,
    ).toBe(false);
  });
});

describe('password validator', () => {
  it('accepts a long passphrase without requiring arbitrary character classes', () => {
    expect(passwordSchema.safeParse('correct-horse-battery').success).toBe(true);
    expect(passwordSchema.safeParse('a secure phrase 2026!').success).toBe(true);
  });

  it.each([
    '',
    'short',
    '12345678901',
    ' '.repeat(12),
    'password\u0000unsafe',
    'x'.repeat(129),
  ])('rejects weak or malformed password input: %s', (password) => {
    expect(passwordSchema.safeParse(password).success).toBe(false);
  });

  it('allows legacy short passwords for login, but still bounds input', () => {
    expect(loginPasswordSchema.safeParse('legacy123').success).toBe(true);
    expect(loginPasswordSchema.safeParse('').success).toBe(false);
    expect(loginPasswordSchema.safeParse('x'.repeat(129)).success).toBe(false);
    expect(loginPasswordSchema.safeParse('legacy\u0000pass').success).toBe(false);
  });

  it('applies the current password policy to password reset completion', () => {
    const token = 't'.repeat(32);
    expect(
      passwordResetCompleteCredentialsSchema.safeParse({
        token,
        password: 'new-secure-passphrase',
      }).success,
    ).toBe(true);
    expect(
      passwordResetCompleteCredentialsSchema.safeParse({
        token,
        password: 'short',
      }).success,
    ).toBe(false);
    expect(
      passwordResetCompleteCredentialsSchema.safeParse({
        token: 'short',
        password: 'new-secure-passphrase',
      }).success,
    ).toBe(false);
  });
});
