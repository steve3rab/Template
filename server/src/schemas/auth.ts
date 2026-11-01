import { z } from 'zod';

/** Normalize email addresses before persistence and lookup to keep identity comparisons consistent. */
export const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((email) => email.toLowerCase());

/**
 * Password policy for new credentials: 12–128 characters.
 * Passphrases are allowed; complexity rules must not force arbitrary character classes.
 * Control characters and whitespace-only passwords are rejected.
 */
export const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .refine((password) => password.trim().length > 0, 'Password must not be whitespace only.')
  .refine((password) => !/[\u0000-\u001F\u007F]/.test(password), 'Password contains control characters.');

/** Login keeps compatibility with legacy accounts whose password predates the current minimum. */
export const loginPasswordSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((password) => !/[\u0000-\u001F\u007F]/.test(password), 'Password contains control characters.');

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
