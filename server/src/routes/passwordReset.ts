import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { createHmac, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { passwordResetCompleteSchema, passwordResetRequestSchema } from '../schemas/commerce.js';

const hashToken = (value: string) =>
  createHmac('sha256', process.env.SESSION_SECRET ?? 'local-development-only-change-this-secret')
    .update(value)
    .digest('hex');

export function registerPasswordResetRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
): void {
  app.post('/api/auth/password-reset/request', {
    config: { rateLimit: { max: 4, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const body = passwordResetRequestSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid email.' });
    const user = await prisma.user.findUnique({ where: { email: body.data.email } });
    if (user) {
      const token = randomBytes(32).toString('base64url');
      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
      });
      const webhook = process.env.PASSWORD_RESET_WEBHOOK_URL;
      if (webhook) {
        const origin = process.env.APP_ORIGIN ?? 'http://localhost:5173';
        const response = await fetch(webhook, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(process.env.PASSWORD_RESET_WEBHOOK_TOKEN ? { authorization: `Bearer ${process.env.PASSWORD_RESET_WEBHOOK_TOKEN}` } : {}) },
          body: JSON.stringify({ email: user.email, resetUrl: `${origin}/reset-password?token=${token}`, expiresInMinutes: 30 }),
          signal: AbortSignal.timeout(5000),
        }).catch(() => null);
        if (!response?.ok) request.log.error('Password reset delivery failed.');
      } else if (process.env.NODE_ENV !== 'production') {
        request.log.info({ resetToken: token }, 'Development-only password reset token');
      } else {
        request.log.error('PASSWORD_RESET_WEBHOOK_URL is missing; password reset email was not delivered.');
      }
    }
    return reply.send({ message: 'Si cette adresse correspond à un compte, un lien de réinitialisation sera envoyé.' });
  });

  app.post('/api/auth/password-reset/complete', async (request, reply) => {
    const body = passwordResetCompleteSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid reset request.' });
    const tokenHash = hashToken(body.data.token);
    const reset = await prisma.passwordResetToken.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!reset || reset.usedAt || reset.expiresAt.getTime() <= Date.now()) return reply.code(400).send({ error: 'Reset token is invalid or expired.' });
    const passwordHash = await argon2.hash(body.data.password, { type: argon2.argon2id });
    const completed = await prisma.$transaction(async (tx) => {
      const usedAt = new Date();
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: reset.id, usedAt: null, expiresAt: { gt: usedAt } },
        data: { usedAt },
      });
      if (claimed.count !== 1) return false;

      await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
      await tx.passwordResetToken.deleteMany({ where: { userId: reset.userId, id: { not: reset.id } } });
      await tx.session.deleteMany({ where: { userId: reset.userId } });
      return true;
    });
    if (!completed) return reply.code(400).send({ error: 'Reset token is invalid or expired.' });
    return reply.send({ message: 'Mot de passe modifié. Connectez-vous avec votre nouveau mot de passe.' });
  });
}
