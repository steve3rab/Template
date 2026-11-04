import { z } from 'zod';

function containsControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/** Normalize email addresses before persistence and lookup to keep identity comparisons consistent. */
export const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((email) => email.toLowerCase());

/**
 * New credentials require 12–128 characters, with uppercase, lowercase, numeric
 * and special characters. Control characters and whitespace-only passwords are rejected.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters.')
  .max(128, 'Use no more than 128 characters.')
  .refine((password) => password.trim().length > 0, 'Password must not be whitespace only.')
  .refine((password) => /[a-z]/.test(password), 'Add at least one lowercase letter.')
  .refine((password) => /[A-Z]/.test(password), 'Add at least one uppercase letter.')
  .refine((password) => /[0-9]/.test(password), 'Add at least one number.')
  .refine((password) => /[^A-Za-z0-9\s]/.test(password), 'Add at least one special character.')
  .refine(
    (password) => !containsControlCharacters(password),
    'Password contains control characters.',
  );

/** Login keeps compatibility with legacy accounts whose password predates the current minimum. */
export const loginPasswordSchema = z
  .string()
  .min(1)
  .max(128)
  .refine(
    (password) => !containsControlCharacters(password),
    'Password contains control characters.',
  );

export const registrationCredentialsSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const loginCredentialsSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
});

export const passwordResetCompleteCredentialsSchema = z.object({
  token: z.string().min(32).max(256),
  password: passwordSchema,
});

export type RegistrationCredentials = z.infer<typeof registrationCredentialsSchema>;
