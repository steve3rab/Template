import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { ResolveUser } from '../auth/requireUser.js';
import { requireUser } from '../auth/requireUser.js';
import { checkoutInputSchema } from '../schemas/commerce.js';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

const stripeSessionSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
});

const stripeSessionLookupSchema = z.object({
  id: z.string().min(1),
  url: z.string().url().nullable().optional(),
  status: z.enum(['open', 'complete', 'expired']),
});

const stripeEventSchema = z
  .object({
    type: z.string(),
    data: z.object({ object: z.unknown() }),
  })
  .passthrough();

const stripeCheckoutCompletedSchema = z
  .object({
    id: z.string().min(1),
    payment_status: z.string(),
    metadata: z
      .object({ orderIds: z.string().min(1) })
      .nullable()
      .optional(),
  })
  .passthrough();

export function verifyStripeSignature(
  rawBody: Buffer,
  signatureHeader: string,
  secret: string,
  nowMs = Date.now(),
): boolean {
  const parts = signatureHeader.split(',').map((part) => part.split('=', 2));
  const timestampText = parts.find(([key]) => key === 't')?.[1];
  const timestamp = Number(timestampText);
  if (!timestampText || !Number.isInteger(timestamp) || Math.abs(nowMs / 1000 - timestamp) > 300) {
    return false;
  }

  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest();
  return parts
    .filter(([key]) => key === 'v1')
    .some(([, value]) => {
      if (!value || !/^[a-f0-9]{64}$/i.test(value)) return false;
      const actual = Buffer.from(value, 'hex');
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    });
}

export function registerPaymentRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  resolveUser: ResolveUser,
): void {
  app.post(
    '/api/customer/checkout',
    {
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    },
    async (request, reply) => {
      const user = await requireUser(request, reply, prisma, resolveUser);
      if (!user) return;

      const body = checkoutInputSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Invalid checkout request.' });

      const secretKey = process.env.STRIPE_SECRET_KEY;
      if (!secretKey) {
        return reply.code(503).send({ error: 'Le paiement en ligne n’est pas encore configuré.' });
      }

      const orders = await prisma.order.findMany({
        where: { id: { in: body.data.orderIds }, userId: user.id },
        include: { items: true },
      });
      if (orders.length !== body.data.orderIds.length) {
        return reply.code(404).send({ error: 'One or more orders were not found.' });
      }
      if (
        orders.some(
          (order) =>
            order.paymentStatus !== 'UNPAID' ||
            order.status !== 'PENDING' ||
            order.items.length === 0,
        )
      ) {
        return reply.code(409).send({ error: 'One or more orders cannot be paid.' });
      }

      const existingReferences = orders
        .map((order) => order.paymentReference)
        .filter((value): value is string => Boolean(value));
      if (existingReferences.length > 0) {
        if (existingReferences.length !== orders.length || new Set(existingReferences).size !== 1) {
          return reply
            .code(409)
            .send({ error: 'Orders are linked to different payment sessions.' });
        }
        let existingResponse: Response;
        try {
          existingResponse = await fetch(
            `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(existingReferences[0] ?? '')}`,
            {
              headers: { Authorization: `Bearer ${secretKey}` },
              signal: AbortSignal.timeout(10000),
            },
          );
        } catch {
          request.log.error('Stripe Checkout session lookup failed.');
          return reply
            .code(502)
            .send({ error: 'Impossible de vérifier la session de paiement. Réessayez.' });
        }
        if (!existingResponse.ok) {
          request.log.error(
            { statusCode: existingResponse.status },
            'Stripe Checkout session lookup was rejected.',
          );
          return reply.code(502).send({ error: 'Impossible de vérifier la session de paiement.' });
        }
        const existingSession = stripeSessionLookupSchema.safeParse(
          await existingResponse.json().catch(() => null),
        );
        if (!existingSession.success) {
          return reply.code(502).send({ error: 'Réponse invalide du service de paiement.' });
        }
        if (existingSession.data.status === 'open' && existingSession.data.url) {
          return reply.send({ checkoutUrl: existingSession.data.url });
        }
        if (existingSession.data.status === 'complete') {
          return reply.code(409).send({
            error:
              'Le paiement est en cours de confirmation. Actualisez votre compte dans quelques instants.',
          });
        }
        return reply.code(409).send({
          error: 'Cette session de paiement a expiré. Créez une nouvelle commande pour réessayer.',
        });
      }

      const currency = orders[0]?.currency.toLowerCase();
      if (
        !currency ||
        !/^[a-z]{3}$/.test(currency) ||
        orders.some((order) => order.currency.toLowerCase() !== currency)
      ) {
        return reply.code(409).send({ error: 'Orders must use the same supported currency.' });
      }

      const origin = process.env.APP_ORIGIN;
      if (!origin) return reply.code(503).send({ error: 'Checkout origin is not configured.' });

      const totalLineItems = orders.reduce((sum, order) => sum + order.items.length, 0);
      if (totalLineItems > 100)
        return reply.code(400).send({ error: 'Too many line items for one checkout.' });

      for (const order of orders) {
        let itemsTotal = 0;
        for (const item of order.items) {
          if (
            !Number.isSafeInteger(item.unitPriceCents) ||
            item.unitPriceCents < 1 ||
            !Number.isSafeInteger(item.quantity) ||
            item.quantity < 1
          ) {
            return reply.code(409).send({ error: 'Order contains invalid item pricing.' });
          }
          itemsTotal += item.unitPriceCents * item.quantity;
        }
        if (!Number.isSafeInteger(itemsTotal) || itemsTotal !== order.totalCents) {
          return reply.code(409).send({ error: 'Order total does not match its items.' });
        }
      }

      const orderIds = orders.map((order) => order.id).sort();
      // Round expiry to a minute so retries with the same idempotency key use identical parameters.
      const expiresAt = Math.floor(Date.now() / 60_000) * 60 + 60 * 60;
      const params = new URLSearchParams({
        mode: 'payment',
        client_reference_id: orderIds[0] ?? '',
        success_url: `${origin}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?payment=cancelled`,
        expires_at: String(expiresAt),
        'payment_method_types[0]': 'card',
        'metadata[orderIds]': orderIds.join(','),
      });
      let lineIndex = 0;
      for (const order of orders) {
        for (const item of order.items) {
          params.set(`line_items[${lineIndex}][price_data][currency]`, currency);
          params.set(
            `line_items[${lineIndex}][price_data][unit_amount]`,
            String(item.unitPriceCents),
          );
          params.set(
            `line_items[${lineIndex}][price_data][product_data][name]`,
            item.productName.slice(0, 250),
          );
          params.set(`line_items[${lineIndex}][quantity]`, String(item.quantity));
          lineIndex += 1;
        }
      }

      const idempotencyKey = createHmac('sha256', secretKey)
        .update(`${orderIds.join(':')}:${expiresAt}`)
        .digest('hex');
      let response: Response;
      try {
        response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Idempotency-Key': idempotencyKey,
          },
          body: params,
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        request.log.error('Stripe Checkout request failed.');
        return reply
          .code(502)
          .send({ error: 'Impossible de joindre le service de paiement. Réessayez.' });
      }

      if (!response.ok) {
        request.log.error(
          { statusCode: response.status },
          'Stripe Checkout rejected the session request.',
        );
        return reply
          .code(502)
          .send({ error: 'Le service de paiement n’a pas pu préparer la transaction.' });
      }

      const session = stripeSessionSchema.safeParse(await response.json().catch(() => null));
      if (!session.success) {
        request.log.error('Stripe Checkout returned an invalid session response.');
        return reply.code(502).send({ error: 'Réponse invalide du service de paiement.' });
      }

      const saved = await prisma.order.updateMany({
        where: {
          id: { in: orderIds },
          userId: user.id,
          paymentStatus: 'UNPAID',
          status: 'PENDING',
          paymentReference: null,
        },
        data: { paymentReference: session.data.id },
      });
      if (saved.count !== orderIds.length) {
        try {
          await fetch(
            `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(session.data.id)}/expire`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${secretKey}` },
              signal: AbortSignal.timeout(10000),
            },
          );
        } catch {
          request.log.error('Unable to expire an unlinked Stripe Checkout session.');
        }
        return reply.code(409).send({ error: 'Orders changed while checkout was being prepared.' });
      }

      return reply.send({ checkoutUrl: session.data.url });
    },
  );

  app.post('/api/webhooks/stripe', async (request, reply) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret)
      return reply.code(503).send({ error: 'Payment webhook is not configured.' });

    const rawBody = request.rawBody;
    const signature = request.headers['stripe-signature'];
    if (
      !rawBody ||
      typeof signature !== 'string' ||
      !verifyStripeSignature(rawBody, signature, webhookSecret)
    ) {
      return reply.code(400).send({ error: 'Invalid webhook signature.' });
    }

    const event = stripeEventSchema.safeParse(request.body);
    if (!event.success) return reply.code(400).send({ error: 'Invalid webhook payload.' });
    if (
      ![
        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
        'checkout.session.expired',
      ].includes(event.data.type)
    ) {
      return reply.send({ received: true });
    }

    const session = stripeCheckoutCompletedSchema.safeParse(event.data.data.object);
    if (!session.success || !session.data.metadata?.orderIds) {
      return reply.send({ received: true });
    }

    const orderIds = [...new Set(session.data.metadata.orderIds.split(',').filter(Boolean))];
    if (orderIds.length === 0 || orderIds.length > 15) {
      return reply.code(400).send({ error: 'Invalid order metadata.' });
    }

    if (session.data.payment_status === 'paid') {
      // Updating only pending orders linked to this exact Checkout Session makes
      // repeated delivery of a successful event harmless.
      await prisma.order.updateMany({
        where: {
          id: { in: orderIds },
          paymentReference: session.data.id,
          paymentStatus: 'UNPAID',
          status: 'PENDING',
        },
        data: { paymentStatus: 'PAID' },
      });
      return reply.send({ received: true });
    }

    if (event.data.type === 'checkout.session.expired') {
      const expiredOrders = await prisma.order.findMany({
        where: {
          id: { in: orderIds },
          paymentReference: session.data.id,
          paymentStatus: 'UNPAID',
          status: 'PENDING',
        },
        include: { items: true },
      });
      await prisma.$transaction(async (tx) => {
        for (const order of expiredOrders) {
          const cancelled = await tx.order.updateMany({
            where: {
              id: order.id,
              paymentReference: session.data.id,
              paymentStatus: 'UNPAID',
              status: 'PENDING',
            },
            data: { status: 'CANCELLED' },
          });
          if (cancelled.count !== 1) continue;
          for (const item of order.items) {
            if (item.productId) {
              await tx.product.updateMany({
                where: { id: item.productId },
                data: { stock: { increment: item.quantity } },
              });
            }
          }
        }
      });
    }
    return reply.send({ received: true });
  });
}
