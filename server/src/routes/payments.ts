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

const stripeRefundSessionSchema = z.object({
  id: z.string().min(1),
  payment_intent: z.string().min(1).nullable(),
});

const stripeReconciliationSessionSchema = z.object({
  id: z.string().min(1),
  payment_status: z.string(),
  amount_total: z.number().int().nullable(),
  currency: z.string().nullable(),
  payment_intent: z.string().nullable(),
});

const stripeRefundListSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      amount: z.number().int(),
      currency: z.string(),
      status: z.string(),
      metadata: z.object({ orderId: z.string().optional() }).passthrough().optional(),
    }),
  ),
});

const stripeRefundSchema = z.object({
  id: z.string().min(1),
  amount: z.number().int().positive(),
  currency: z.string().length(3),
  status: z.string().min(1),
});

const stripeRefundEventSchema = z.object({
  id: z.string().min(1),
  amount: z.number().int().positive(),
  currency: z.string().length(3),
  status: z.string().min(1),
  metadata: z.object({ orderId: z.string().min(1) }).passthrough().optional(),
});

const stripeEventSchema = z
  .object({
    id: z.string().min(1),
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
      const params = new URLSearchParams({
        mode: 'payment',
        client_reference_id: orderIds[0] ?? '',
        success_url: `${origin}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?payment=cancelled`,
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
        .update(orderIds.join(':'))
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

  app.get('/api/admin/payments/reconciliation', async (request, reply) => {
    const admin = await requireUser(request, reply, prisma, resolveUser, ['ADMIN']);
    if (!admin) return;
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) return reply.code(503).send({ error: 'Stripe is not configured.' });

    const orders = await prisma.order.findMany({
      where: {
        paymentReference: { not: null },
        paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
      },
      include: {
        financialTransactions: {
          where: { status: 'SUCCEEDED' },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    const results = await Promise.all(
      orders.map(async (order) => {
        try {
          const sessionResponse = await fetch(
            `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(order.paymentReference ?? '')}`,
            {
              headers: { Authorization: `Bearer ${secretKey}` },
              signal: AbortSignal.timeout(10000),
            },
          );
          if (!sessionResponse.ok) {
            return {
              orderId: order.id,
              state: 'UNVERIFIED',
              issues: [`Stripe session lookup returned HTTP ${sessionResponse.status}.`],
            };
          }
          const session = stripeReconciliationSessionSchema.safeParse(
            await sessionResponse.json().catch(() => null),
          );
          if (!session.success || !session.data.payment_intent) {
            return {
              orderId: order.id,
              state: 'UNVERIFIED',
              issues: ['Stripe session response is incomplete.'],
            };
          }

          const refundsUrl = new URL('https://api.stripe.com/v1/refunds');
          refundsUrl.searchParams.set('payment_intent', session.data.payment_intent);
          refundsUrl.searchParams.set('limit', '100');
          const refundsResponse = await fetch(refundsUrl, {
            headers: { Authorization: `Bearer ${secretKey}` },
            signal: AbortSignal.timeout(10000),
          });
          if (!refundsResponse.ok) {
            return {
              orderId: order.id,
              state: 'UNVERIFIED',
              issues: [`Stripe refund lookup returned HTTP ${refundsResponse.status}.`],
            };
          }
          const refunds = stripeRefundListSchema.safeParse(
            await refundsResponse.json().catch(() => null),
          );
          if (!refunds.success) {
            return {
              orderId: order.id,
              state: 'UNVERIFIED',
              issues: ['Stripe refund response is invalid.'],
            };
          }

          const localPayments = order.financialTransactions
            .filter((transaction) => transaction.type === 'PAYMENT')
            .reduce((sum, transaction) => sum + transaction.amountCents, 0);
          const localRefunds = order.financialTransactions
            .filter((transaction) => transaction.type === 'REFUND')
            .reduce((sum, transaction) => sum + transaction.amountCents, 0);
          const stripeRefunds = refunds.data
            .filter(
              (refund) =>
                refund.status === 'succeeded' && refund.metadata?.orderId === order.id,
            )
            .reduce((sum, refund) => sum + refund.amount, 0);
          const issues: string[] = [];
          if (session.data.payment_status !== 'paid')
            issues.push('Stripe does not report this Checkout Session as paid.');
          if (session.data.amount_total !== order.totalCents)
            issues.push('Stripe captured amount differs from the order total.');
          if (session.data.currency?.toUpperCase() !== order.currency.toUpperCase())
            issues.push('Stripe currency differs from the order currency.');
          if (localPayments !== order.totalCents)
            issues.push('Financial payment ledger differs from the order total.');
          if (localRefunds !== order.refundedCents)
            issues.push('Financial refund ledger differs from the order refund balance.');
          if (stripeRefunds !== order.refundedCents)
            issues.push('Stripe refund total differs from the order refund balance.');

          return {
            orderId: order.id,
            state: issues.length === 0 ? 'MATCHED' : 'DISCREPANCY',
            issues,
            orderTotalCents: order.totalCents,
            stripeCapturedCents: session.data.amount_total,
            refundedCents: order.refundedCents,
            stripeRefundedCents: stripeRefunds,
            currency: order.currency,
          };
        } catch {
          return {
            orderId: order.id,
            state: 'UNVERIFIED',
            issues: ['Stripe could not be reached to verify this order.'],
          };
        }
      }),
    );

    return {
      checkedAt: new Date().toISOString(),
      checkedOrders: results.length,
      matched: results.filter((result) => result.state === 'MATCHED').length,
      discrepancies: results.filter((result) => result.state === 'DISCREPANCY').length,
      unverified: results.filter((result) => result.state === 'UNVERIFIED').length,
      results,
    };
  });

  app.get('/api/admin/financial-transactions', async (request, reply) => {
    const admin = await requireUser(request, reply, prisma, resolveUser, ['ADMIN']);
    if (!admin) return;
    const transactions = await prisma.financialTransaction.findMany({
      include: {
        order: {
          select: {
            id: true,
            userId: true,
            sellerId: true,
            totalCents: true,
            currency: true,
            paymentStatus: true,
            refundedCents: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return { transactions };
  });

  app.post('/api/admin/orders/:id/refund', async (request, reply) => {
    const admin = await requireUser(request, reply, prisma, resolveUser, ['ADMIN']);
    if (!admin) return;

    const params = z.object({ id: z.string().min(1).max(128) }).safeParse(request.params);
    const body = z
      .object({ amountCents: z.number().int().positive().optional(), requestKey: z.string().uuid() })
      .strict()
      .safeParse(request.body ?? {});
    if (!params.success || !body.success)
      return reply.code(400).send({ error: 'Invalid refund request.' });

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) return reply.code(503).send({ error: 'Stripe is not configured.' });

    const order = await prisma.order.findUnique({ where: { id: params.data.id } });
    if (!order) return reply.code(404).send({ error: 'Order not found.' });
    const existingRefund = await prisma.financialTransaction.findFirst({
      where: { orderId: order.id, type: 'REFUND', requestKey: body.data.requestKey },
      orderBy: { createdAt: 'asc' },
    });
    if (existingRefund?.status === 'SUCCEEDED') {
      return reply.send({
        refund: {
          id: existingRefund.stripeObjectId,
          amountCents: existingRefund.amountCents,
          currency: existingRefund.currency,
          status: 'succeeded',
        },
        refundedCents: order.refundedCents,
        remainingRefundableCents: order.totalCents - order.refundedCents,
        paymentStatus: order.paymentStatus,
      });
    }
    if (
      !['PAID', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus) ||
      !order.paymentReference
    ) {
      return reply.code(409).send({ error: 'Only paid orders can be refunded.' });
    }
    if (existingRefund && existingRefund.status !== 'PENDING') {
      return reply.code(409).send({ error: 'This refund request cannot be retried.' });
    }
    const isRetry = Boolean(existingRefund);
    if (!isRetry) {
      const otherPendingRefund = await prisma.financialTransaction.findFirst({
        where: {
          orderId: order.id,
          type: 'REFUND',
          status: 'PENDING',
        },
        orderBy: { createdAt: 'asc' },
      });
      if (otherPendingRefund) {
        return reply.code(409).send({
          error: 'Another refund is still being processed. Reconcile or retry that request first.',
        });
      }
    }
    const remainingCents = order.totalCents - order.refundedCents;
    const amountCents = existingRefund?.amountCents ?? body.data.amountCents ?? remainingCents;
    if (
      !Number.isSafeInteger(amountCents) ||
      amountCents < 1 ||
      (!isRetry && amountCents > remainingCents)
    ) {
      return reply.code(400).send({ error: 'Refund amount exceeds the remaining refundable amount.' });
    }

    const reservedCents = order.refundedCents + (isRetry ? 0 : amountCents);
    const idempotencyKey =
      existingRefund?.stripeObjectId ??
      createHmac('sha256', secretKey)
        .update(`refund:${order.id}:${body.data.requestKey}`)
        .digest('hex');

    if (!isRetry) {
      const reservation = await prisma.$transaction(async (tx) => {
        const changed = await tx.order.updateMany({
          where: {
            id: order.id,
            paymentStatus: order.paymentStatus,
            refundedCents: order.refundedCents,
          },
          data: { refundedCents: { increment: amountCents } },
        });
        if (changed.count !== 1) return false;
        await tx.financialTransaction.create({
          data: {
            orderId: order.id,
            stripeObjectId: idempotencyKey,
            type: 'REFUND',
            requestKey: body.data.requestKey,
            status: 'PENDING',
            amountCents,
            currency: order.currency,
          },
        });
        return true;
      });
      if (!reservation)
        return reply.code(409).send({ error: 'Order refund state changed. Refresh and retry.' });
    }

    let checkoutResponse: Response;
    try {
      checkoutResponse = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(order.paymentReference)}`,
        {
          headers: { Authorization: `Bearer ${secretKey}` },
          signal: AbortSignal.timeout(10000),
        },
      );
    } catch {
      request.log.error({ orderId: order.id }, 'Stripe payment lookup failed; refund intent retained.');
      return reply.code(202).send({
        pending: true,
        message: 'Refund is reserved and will be retried with the same idempotency key.',
      });
    }

    const checkout = stripeRefundSessionSchema.safeParse(
      await checkoutResponse.json().catch(() => null),
    );
    if (!checkoutResponse.ok || !checkout.success || !checkout.data.payment_intent) {
      if (!isRetry) {
        await prisma.$transaction(async (tx) => {
          await tx.financialTransaction.deleteMany({ where: { stripeObjectId: idempotencyKey } });
          await tx.order.updateMany({
            where: { id: order.id, refundedCents: reservedCents },
            data: { refundedCents: { decrement: amountCents } },
          });
        });
      }
      return reply.code(502).send({ error: 'Stripe payment reference could not be verified.' });
    }

    let refundResponse: Response;
    try {
      refundResponse = await fetch('https://api.stripe.com/v1/refunds', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key': idempotencyKey,
        },
        body: new URLSearchParams({
          payment_intent: checkout.data.payment_intent,
          amount: String(amountCents),
          'metadata[orderId]': order.id,
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      // Keep the durable pending intent and repeat the exact Stripe idempotency key on retry.
      request.log.error({ orderId: order.id }, 'Stripe refund outcome is unknown; refund intent retained.');
      return reply.code(202).send({
        pending: true,
        message: 'Refund outcome is being reconciled. Retry will reuse the same Stripe request.',
      });
    }

    const refund = stripeRefundSchema.safeParse(await refundResponse.json().catch(() => null));
    if (!refundResponse.ok || !refund.success) {
      if (!isRetry) {
        await prisma.$transaction(async (tx) => {
          await tx.financialTransaction.deleteMany({ where: { stripeObjectId: idempotencyKey } });
          await tx.order.updateMany({
            where: { id: order.id, refundedCents: reservedCents },
            data: { refundedCents: { decrement: amountCents } },
          });
        });
      }
      request.log.error({ statusCode: refundResponse.status }, 'Stripe refund request failed.');
      return reply.code(502).send({ error: 'Stripe could not process this refund.' });
    }

    if (refund.data.status !== 'succeeded') {
      if (refund.data.status === 'failed' || refund.data.status === 'canceled') {
        if (!isRetry) {
          await prisma.$transaction(async (tx) => {
            await tx.financialTransaction.deleteMany({ where: { stripeObjectId: idempotencyKey } });
            await tx.order.updateMany({
              where: { id: order.id, refundedCents: reservedCents },
              data: { refundedCents: { decrement: amountCents } },
            });
          });
        }
        return reply.code(502).send({ error: 'Stripe did not complete the refund.' });
      }
      return reply.code(202).send({
        pending: true,
        refundId: refund.data.id,
        message: 'Stripe is still processing this refund. The ledger will be updated by webhook.',
      });
    }

    const nextPaymentStatus =
      reservedCents === order.totalCents ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    try {
      await prisma.$transaction(async (tx) => {
        const finalized = await tx.order.updateMany({
          where: {
            id: order.id,
            refundedCents: reservedCents,
            paymentStatus: order.paymentStatus,
          },
          data: { paymentStatus: nextPaymentStatus },
        });
        if (finalized.count !== 1) throw new Error('REFUND_FINALIZATION_CONFLICT');
        await tx.financialTransaction.update({
          where: { stripeObjectId: idempotencyKey },
          data: {
            stripeObjectId: refund.data.id,
            status: 'SUCCEEDED',
            amountCents: refund.data.amount,
            currency: refund.data.currency.toUpperCase(),
          },
        });
      });
    } catch (error) {
      // Stripe has already refunded the payment. Keep the pending reservation for safe retry.
      request.log.error(
        { err: error, orderId: order.id, stripeRefundId: refund.data.id },
        'Refund ledger finalization failed.',
      );
      return reply.code(202).send({
        pending: true,
        refundId: refund.data.id,
        message: 'Stripe accepted the refund; financial reconciliation is required.',
      });
    }

    return reply.send({
      refund: {
        id: refund.data.id,
        amountCents: refund.data.amount,
        currency: refund.data.currency.toUpperCase(),
        status: refund.data.status,
      },
      refundedCents: reservedCents,
      remainingRefundableCents: order.totalCents - reservedCents,
      paymentStatus: nextPaymentStatus,
    });
  });

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

    const session =
      event.data.data.object && typeof event.data.data.object === 'object'
        ? stripeCheckoutCompletedSchema.safeParse(event.data.data.object)
        : null;
    const sessionId = session?.success ? session.data.id : null;
    const orderIds =
      session?.success && session.data.metadata?.orderIds
        ? [...new Set(session.data.metadata.orderIds.split(',').filter(Boolean))]
        : [];

    if (orderIds.length > 15) return reply.code(400).send({ error: 'Invalid order metadata.' });

    try {
      await prisma.$transaction(async (tx) => {
        // The unique Stripe event ID is the durable idempotency boundary. A duplicate
        // delivery fails here and the whole transaction (including side effects) is skipped.
        await tx.stripeWebhookEvent.create({
          data: {
            stripeEventId: event.data.id,
            type: event.data.type,
            objectId: sessionId,
          },
        });

        const refundEvent =
          ['refund.created', 'refund.updated'].includes(event.data.type)
            ? stripeRefundEventSchema.safeParse(event.data.data.object)
            : null;
        if (refundEvent?.success && refundEvent.data.metadata?.orderId) {
          const orderId = refundEvent.data.metadata.orderId;
          const pending = await tx.financialTransaction.findFirst({
            where: { orderId, type: 'REFUND', status: 'PENDING' },
            orderBy: { createdAt: 'asc' },
          });
          const refundOrder = pending
            ? await tx.order.findUnique({ where: { id: orderId } })
            : null;
          if (pending && refundOrder) {
            if (refundEvent.data.status === 'succeeded') {
              const finalized = await tx.financialTransaction.updateMany({
                where: { id: pending.id, status: 'PENDING' },
                data: {
                  stripeObjectId: refundEvent.data.id,
                  status: 'SUCCEEDED',
                  amountCents: refundEvent.data.amount,
                  currency: refundEvent.data.currency.toUpperCase(),
                },
              });
              if (finalized.count === 1) {
                await tx.order.updateMany({
                  where: { id: orderId, refundedCents: { gte: refundEvent.data.amount } },
                  data: {
                    paymentStatus:
                      refundOrder.refundedCents >= refundOrder.totalCents
                        ? 'REFUNDED'
                        : 'PARTIALLY_REFUNDED',
                  },
                });
              }
            } else if (
              refundEvent.data.status === 'failed' ||
              refundEvent.data.status === 'canceled'
            ) {
              const failed = await tx.financialTransaction.updateMany({
                where: { id: pending.id, status: 'PENDING' },
                data: { status: 'FAILED' },
              });
              if (failed.count === 1) {
                await tx.order.updateMany({
                  where: {
                    id: orderId,
                    refundedCents: { gte: pending.amountCents },
                  },
                  data: { refundedCents: { decrement: pending.amountCents } },
                });
              }
            }
          }
        } else if (
          session?.success &&
          orderIds.length > 0 &&
          session.data.payment_status === 'paid' &&
          ['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(
            event.data.type,
          )
        ) {
          const eligibleOrders = await tx.order.findMany({
            where: {
              id: { in: orderIds },
              paymentReference: session.data.id,
              paymentStatus: 'UNPAID',
              status: 'PENDING',
            },
          });
          for (const order of eligibleOrders) {
            const changed = await tx.order.updateMany({
              where: {
                id: order.id,
                paymentReference: session.data.id,
                paymentStatus: 'UNPAID',
                status: 'PENDING',
              },
              data: { paymentStatus: 'PAID' },
            });
            if (changed.count !== 1) continue;
            await tx.financialTransaction.create({
              data: {
                orderId: order.id,
                stripeObjectId: `${event.data.id}:${order.id}`,
                type: 'PAYMENT',
                amountCents: order.totalCents,
                currency: order.currency,
              },
            });
          }
        } else if (
          session?.success &&
          orderIds.length > 0 &&
          event.data.type === 'checkout.session.expired'
        ) {
          const expiredOrders = await tx.order.findMany({
            where: {
              id: { in: orderIds },
              paymentReference: session.data.id,
              paymentStatus: 'UNPAID',
              status: 'PENDING',
            },
            include: { items: true },
          });
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
        }

        await tx.stripeWebhookEvent.update({
          where: { stripeEventId: event.data.id },
          data: { processedAt: new Date() },
        });
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'P2002'
      ) {
        return reply.send({ received: true, duplicate: true });
      }
      throw error;
    }

    return reply.send({ received: true });
  });
}
