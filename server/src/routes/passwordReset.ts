import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { passwordResetCompleteSchema, passwordResetRequestSchema } from '../schemas/commerce.js';
import { hashToken } from '../auth/tokenHash.js';

function isSecureWebhook(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    return (
      (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') &&
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

export function registerPasswordResetRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.post(
    '/api/auth/password-reset/request',
    {
      config: { rateLimit: { max: 3, timeWindow: '1 hour' } },
    },
    async (request, reply) => {
      const body = passwordResetRequestSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Invalid email.' });
      const user = await prisma.user.findUnique({ where: { email: body.data.email } });
      let developmentResetUrl: string | undefined;
      if (user) {
        const token = randomBytes(32).toString('base64url');
        const resetToken = await prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          },
        });
        const webhook = process.env.PASSWORD_RESET_WEBHOOK_URL;
        const webhookToken = process.env.PASSWORD_RESET_WEBHOOK_TOKEN;
        if (webhook && webhookToken) {
          if (!isSecureWebhook(webhook)) {
            await prisma.passwordResetToken.deleteMany({ where: { id: resetToken.id } });
            request.log.error('Password reset webhook must use HTTPS outside local development.');
          } else {
            const origin = process.env.APP_ORIGIN ?? 'http://localhost:5173';
            const response = await fetch(webhook, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${webhookToken}`,
              },
              body: JSON.stringify({
                email: user.email,
                resetUrl: `${origin}/reset-password?token=${token}`,
                expiresInMinutes: 30,
              }),
              signal: AbortSignal.timeout(5000),
            }).catch(() => null);
            if (!response?.ok) {
              await prisma.passwordResetToken.deleteMany({ where: { id: resetToken.id } });
              request.log.error('Password reset delivery failed.');
            }
          }
        } else if (webhook) {
          await prisma.passwordResetToken.deleteMany({ where: { id: resetToken.id } });
          request.log.error('Password reset webhook credentials are incomplete.');
        } else if (process.env.NODE_ENV === 'development') {
          const origin = process.env.APP_ORIGIN ?? 'http://localhost:5173';
          let localOrigin = false;
          try {
            const parsedOrigin = new URL(origin);
            localOrigin =
              parsedOrigin.protocol === 'http:' &&
              ['localhost', '127.0.0.1', '[::1]'].includes(parsedOrigin.hostname);
          } catch {
            localOrigin = false;
          }
          // Return the token only to an explicitly local development frontend; never log it.
          if (localOrigin) developmentResetUrl = `${origin}/reset-password?token=${token}`;
        } else {
          request.log.error(
            'PASSWORD_RESET_WEBHOOK_URL is missing; password reset email was not delivered.',
          );
        }
      }
      return reply.send({
        message:
          'Si cette adresse correspond à un compte, un lien de réinitialisation sera envoyé.',
        ...(developmentResetUrl ? { developmentResetUrl } : {}),
      });
    },
  );

  app.post(
    '/api/auth/password-reset/complete',
    {
      config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    },
    async (request, reply) => {
      const body = passwordResetCompleteSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Invalid reset request.' });
      const tokenHash = hashToken(body.data.token);
      const reset = await prisma.passwordResetToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      if (!reset || reset.usedAt || reset.expiresAt.getTime() <= Date.now())
        return reply.code(400).send({ error: 'Reset token is invalid or expired.' });
      const passwordHash = await argon2.hash(body.data.password, { type: argon2.argon2id });
      const completed = await prisma.$transaction(async (tx) => {
        const usedAt = new Date();
        const claimed = await tx.passwordResetToken.updateMany({
          where: { id: reset.id, usedAt: null, expiresAt: { gt: usedAt } },
          data: { usedAt },
        });
        if (claimed.count !== 1) return false;

        await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
        await tx.passwordResetToken.deleteMany({
          where: { userId: reset.userId, id: { not: reset.id } },
        });
        await tx.session.deleteMany({ where: { userId: reset.userId } });
        return true;
      });
      if (!completed) return reply.code(400).send({ error: 'Reset token is invalid or expired.' });
      return reply.send({
        message: 'Mot de passe modifié. Connectez-vous avec votre nouveau mot de passe.',
      });
    },
  );
}
