import { createHmac } from 'node:crypto';

const DEVELOPMENT_TOKEN_SECRET = 'local-development-only-change-this-secret';

/**
 * Produces a one-way, keyed digest for opaque session and recovery tokens.
 * The raw token must never be persisted in the database.
 */
export function hashToken(
  token: string,
  secret = process.env.SESSION_SECRET ?? DEVELOPMENT_TOKEN_SECRET,
): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}
