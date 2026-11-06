// @vitest-environment node

import { createHmac } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import type { PrismaClient, User } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerPaymentRoutes, verifyStripeSignature } from './payments.js';

const customer = { id: 'customer-1', role: 'CUSTOMER' } as User;
const order = {
  id: 'order-1',
  userId: customer.id,
  status: 'PENDING',
  paymentStatus: 'UNPAID',
  totalCents: 5000,
  currency: 'EUR',
  items: [
    { productId: 'product-1', productName: 'Test product', unitPriceCents: 2500, quantity: 2 },
  ],
};

let app: FastifyInstance;
let updateMany: ReturnType<typeof vi.fn>;
let productUpdateMany: ReturnType<typeof vi.fn>;

function setup(
  rateLimitMax = 1000,
  resolveUser: () => Promise<User | null> = async () => customer,
) {
  updateMany = vi.fn(async () => ({ count: 1 }));
  productUpdateMany = vi.fn(async () => ({ count: 1 }));
  const webhookEventCreate = vi.fn(async () => ({ id: 'webhook-event-1' }));
  const webhookEventUpdate = vi.fn(async () => ({ id: 'webhook-event-1' }));
  const financialTransactionCreate = vi.fn(async (args: unknown) => {
    void args;
    return { id: 'financial-transaction-1' };
  });
  const financialTransactionFindFirst = vi.fn(async () => null);
  const financialTransactionDeleteMany = vi.fn(async () => ({ count: 1 }));
  const financialTransactionUpdate = vi.fn(async () => ({ id: 'financial-transaction-1' }));
  const financialTransactionUpdateMany = vi.fn(async () => ({ count: 1 }));
  const transaction = {
    order: {
      updateMany,
      findMany: vi.fn(async () => [order]),
      findUnique: vi.fn(async () => ({
        ...order,
        paymentStatus: 'PAID',
        paymentReference: 'cs_test_123',
        refundedCents: 1200,
      })),
    },
    product: { updateMany: productUpdateMany },
    stripeWebhookEvent: { create: webhookEventCreate, update: webhookEventUpdate },
    financialTransaction: {
      create: financialTransactionCreate,
      deleteMany: financialTransactionDeleteMany,
      update: financialTransactionUpdate,
      updateMany: financialTransactionUpdateMany,
      findFirst: financialTransactionFindFirst,
    },
  };
  const prisma = {
    order: {
      findMany: vi.fn(async () => [order]),
      findUnique: vi.fn(async () => ({
        ...order,
        paymentStatus: 'PAID',
        paymentReference: 'cs_test_123',
        refundedCents: 0,
      })),
      updateMany,
    },
    product: { updateMany: productUpdateMany },
    financialTransaction: { findFirst: financialTransactionFindFirst },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(transaction),
    ),
  };
  app = Fastify({ logger: false });
  app.register(rateLimit, {
    global: true,
    max: rateLimitMax,
    timeWindow: '1 minute',
    keyGenerator: () => 'test-client',
  });
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    const rawBody = Buffer.isBuffer(body) ? body : Buffer.from(body);
    request.rawBody = rawBody;
    try {
      done(null, JSON.parse(rawBody.toString('utf8')));
    } catch (error) {
      done(error instanceof Error ? error : new Error('Invalid JSON body'));
    }
  });
  app.after(() => {
    registerPaymentRoutes(app, prisma as unknown as PrismaClient, resolveUser);
  });
  return Object.assign(prisma, {
    webhookEventCreate,
    webhookEventUpdate,
    financialTransactionCreate,
    financialTransactionFindFirst,
    financialTransactionDeleteMany,
    financialTransactionUpdate,
    financialTransactionUpdateMany,
  });
}

function signatureFor(rawBody: Buffer, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const digest = createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

afterEach(async () => {
  if (app) await app.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Stripe payment routes', () => {
  it('rate-limits repeated checkout attempts per client IP', async () => {
    setup(10);
    await app.ready();

    const responses = [];
    for (let index = 0; index < 11; index += 1) {
      responses.push(
        await app.inject({
          method: 'POST',
          url: '/api/customer/checkout',
          payload: { orderIds: ['order-1'] },
        }),
      );
    }

    expect(responses.slice(0, 10).every((response) => response.statusCode === 503)).toBe(true);
    expect(responses[10]?.statusCode).toBe(429);
  });

  it('creates a server-priced Checkout Session and records its reference', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_example');
    vi.stubEnv('APP_ORIGIN', 'http://localhost:5173');
    const prisma = setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id: 'cs_test_123',
              url: 'https://checkout.stripe.com/c/pay/cs_test_123',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/customer/checkout',
      headers: { 'content-type': 'application/json' },
      payload: { orderIds: ['order-1'] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().checkoutUrl).toBe('https://checkout.stripe.com/c/pay/cs_test_123');
    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['order-1'] }, userId: customer.id },
      include: { items: true },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['order-1'] },
        userId: customer.id,
        paymentStatus: 'UNPAID',
        status: 'PENDING',
        paymentReference: null,
      },
      data: { paymentReference: 'cs_test_123' },
    });
    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(String(request?.body)).toContain(
      'line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=2500',
    );
  });

  it('rejects refund requests from non-admin users before accessing Stripe', async () => {
    const prisma = setup();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/orders/order-1/refund',
      payload: {},
    });

    expect(response.statusCode).toBe(403);
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });

  it('reconciles captured payments and refunds with live Stripe records', async () => {
    const admin = { id: 'admin-1', role: 'ADMIN' } as User;
    const prisma = setup(1000, async () => admin);
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_example');
    vi.mocked(prisma.order.findMany).mockResolvedValueOnce([
      {
        ...order,
        paymentStatus: 'PAID',
        paymentReference: 'cs_test_123',
        refundedCents: 0,
        financialTransactions: [
          {
            id: 'payment-ledger-1',
            orderId: 'order-1',
            stripeObjectId: 'evt_test_123:order-1',
            type: 'PAYMENT',
            status: 'SUCCEEDED',
            amountCents: 5000,
            currency: 'EUR',
            createdAt: new Date(),
          },
        ],
      },
    ] as never);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'cs_test_123',
              payment_status: 'paid',
              amount_total: 5000,
              currency: 'eur',
              payment_intent: 'pi_test_123',
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: [] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
    );
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/payments/reconciliation',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      checkedOrders: 1,
      matched: 1,
      discrepancies: 0,
      unverified: 0,
      results: [{ orderId: 'order-1', state: 'MATCHED', issues: [] }],
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it('processes a partial refund and records it in the financial ledger', async () => {
    const admin = { id: 'admin-1', role: 'ADMIN' } as User;
    const prisma = setup(1000, async () => admin);
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_example');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'cs_test_123',
              payment_intent: 'pi_test_123',
              amount_total: 5000,
              currency: 'eur',
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 're_test_123',
              amount: 1200,
              currency: 'eur',
              status: 'succeeded',
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          ),
        ),
    );
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/orders/order-1/refund',
      payload: {
        amountCents: 1200,
        requestKey: '00000000-0000-4000-8000-000000000001',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      refund: { id: 're_test_123', amountCents: 1200, currency: 'EUR' },
      refundedCents: 1200,
      remainingRefundableCents: 3800,
      paymentStatus: 'PARTIALLY_REFUNDED',
    });
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'order-1', paymentStatus: 'PAID', refundedCents: 0 },
      data: { refundedCents: { increment: 1200 } },
    });
    expect(prisma.financialTransactionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order-1',
        stripeObjectId: expect.any(String),
        type: 'REFUND',
        status: 'PENDING',
        amountCents: 1200,
        currency: 'EUR',
      }),
    });
    expect(prisma.financialTransactionUpdate).toHaveBeenCalledWith({
      where: { stripeObjectId: expect.any(String) },
      data: {
        stripeObjectId: 're_test_123',
        status: 'SUCCEEDED',
        amountCents: 1200,
        currency: 'EUR',
      },
    });
  });

  it('retries an uncertain refund with the same durable Stripe idempotency key', async () => {
    const admin = { id: 'admin-1', role: 'ADMIN' } as User;
    const prisma = setup(1000, async () => admin);
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_example');
    const fetchMock = vi
      .fn(async (...args: [string | URL, RequestInit?]) => {
        void args;
        return new Response(null, { status: 500 });
      })
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'cs_test_123',
            payment_intent: 'pi_test_123',
            amount_total: 5000,
            currency: 'eur',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      )
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'cs_test_123',
            payment_intent: 'pi_test_123',
            amount_total: 5000,
            currency: 'eur',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 're_retry_123',
            amount: 1200,
            currency: 'eur',
            status: 'succeeded',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    await app.ready();

    const first = await app.inject({
      method: 'POST',
      url: '/api/admin/orders/order-1/refund',
      payload: {
        amountCents: 1200,
        requestKey: '00000000-0000-4000-8000-000000000003',
      },
    });
    expect(first.statusCode).toBe(202);
    const pendingCall = vi.mocked(prisma.financialTransactionCreate).mock.calls[0]?.[0] as {
      data: { stripeObjectId: string };
    };
    const idempotencyKey = pendingCall.data.stripeObjectId;

    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce({
      ...order,
      paymentStatus: 'PAID',
      paymentReference: 'cs_test_123',
      refundedCents: 1200,
    } as never);
    vi.mocked(prisma.financialTransactionFindFirst).mockResolvedValueOnce({
      id: 'financial-transaction-1',
      stripeObjectId: idempotencyKey,
      amountCents: 1200,
      createdAt: new Date(),
    } as never);

    const second = await app.inject({
      method: 'POST',
      url: '/api/admin/orders/order-1/refund',
      payload: {
        amountCents: 1200,
        requestKey: '00000000-0000-4000-8000-000000000003',
      },
    });
    expect(second.statusCode).toBe(200);
    const retryHeaders = fetchMock.mock.calls[3]?.[1]?.headers as Record<string, string>;
    expect(retryHeaders['Idempotency-Key']).toBe(idempotencyKey);
    expect(second.json().refund.id).toBe('re_retry_123');
  });

  it('returns the recorded result for a repeated completed full-refund request', async () => {
    const admin = { id: 'admin-1', role: 'ADMIN' } as User;
    const prisma = setup(1000, async () => admin);
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce({
      ...order,
      paymentStatus: 'REFUNDED',
      paymentReference: 'cs_test_123',
      refundedCents: 5000,
    } as never);
    vi.mocked(prisma.financialTransactionFindFirst).mockResolvedValueOnce({
      id: 'refund-ledger-1',
      stripeObjectId: 're_full_123',
      requestKey: '00000000-0000-4000-8000-000000000011',
      status: 'SUCCEEDED',
      amountCents: 5000,
      currency: 'EUR',
    } as never);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/orders/order-1/refund',
      payload: { requestKey: '00000000-0000-4000-8000-000000000011' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      refund: { id: 're_full_123', amountCents: 5000, currency: 'EUR', status: 'succeeded' },
      refundedCents: 5000,
      remainingRefundableCents: 0,
      paymentStatus: 'REFUNDED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('blocks a different refund request while an earlier refund is pending', async () => {
    const admin = { id: 'admin-1', role: 'ADMIN' } as User;
    const prisma = setup(1000, async () => admin);
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_example');
    vi.mocked(prisma.financialTransactionFindFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'pending-refund-1',
        stripeObjectId: 'pending-stripe-key',
        requestKey: '00000000-0000-4000-8000-000000000009',
        status: 'PENDING',
        amountCents: 1200,
      } as never);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/orders/order-1/refund',
      payload: {
        amountCents: 800,
        requestKey: '00000000-0000-4000-8000-000000000010',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/another refund is still being processed/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not call Stripe when another concurrent refund already changed the refund balance', async () => {
    const admin = { id: 'admin-1', role: 'ADMIN' } as User;
    setup(1000, async () => admin);
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_example');
    updateMany.mockResolvedValueOnce({ count: 0 });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/orders/order-1/refund',
      payload: { amountCents: 1000, requestKey: '00000000-0000-4000-8000-000000000002' },
    });

    expect(response.statusCode).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts only signed Stripe events and marks the matching unpaid order as paid', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_example');
    const prisma = setup();
    await app.ready();
    const rawBody = Buffer.from(
      JSON.stringify({
        id: 'evt_test_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            payment_status: 'paid',
            metadata: { orderIds: 'order-1' },
          },
        },
      }),
    );
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signatureFor(rawBody, 'whsec_test_example'),
      },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: true });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['order-1'] },
        paymentReference: 'cs_test_123',
        paymentStatus: 'UNPAID',
        status: 'PENDING',
      },
      data: { paymentStatus: 'PAID' },
    });
    expect(prisma.order.findMany).not.toHaveBeenCalled();
    expect(prisma.webhookEventCreate).toHaveBeenCalledWith({
      data: {
        stripeEventId: 'evt_test_123',
        type: 'checkout.session.completed',
        objectId: 'cs_test_123',
      },
    });
    expect(prisma.financialTransactionCreate).toHaveBeenCalledWith({
      data: {
        orderId: 'order-1',
        stripeObjectId: 'evt_test_123:order-1',
        type: 'PAYMENT',
        amountCents: 5000,
        currency: 'EUR',
      },
    });
    expect(prisma.webhookEventUpdate).toHaveBeenCalledWith({
      where: { stripeEventId: 'evt_test_123' },
      data: { processedAt: expect.any(Date) },
    });
  });

  it('acknowledges a previously recorded Stripe event without replaying side effects', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_example');
    const prisma = setup();
    vi.mocked(prisma.webhookEventCreate).mockRejectedValueOnce({ code: 'P2002' });
    await app.ready();
    const rawBody = Buffer.from(
      JSON.stringify({
        id: 'evt_duplicate_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            payment_status: 'paid',
            metadata: { orderIds: 'order-1' },
          },
        },
      }),
    );
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signatureFor(rawBody, 'whsec_test_example'),
      },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: true, duplicate: true });
    expect(updateMany).not.toHaveBeenCalled();
    expect(prisma.financialTransactionCreate).not.toHaveBeenCalled();
  });

  it('reconciles an asynchronous successful refund webhook into the ledger', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_example');
    const prisma = setup();
    vi.mocked(prisma.financialTransactionFindFirst).mockResolvedValueOnce({
      id: 'financial-transaction-1',
      stripeObjectId: 'pending-idempotency-key',
      amountCents: 1200,
      createdAt: new Date(),
    } as never);
    await app.ready();

    const rawBody = Buffer.from(
      JSON.stringify({
        id: 'evt_refund_updated_123',
        type: 'refund.updated',
        data: {
          object: {
            id: 're_async_123',
            amount: 1200,
            currency: 'eur',
            status: 'succeeded',
            metadata: { orderId: 'order-1' },
          },
        },
      }),
    );
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signatureFor(rawBody, 'whsec_test_example'),
      },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.financialTransactionUpdateMany).toHaveBeenCalledWith({
      where: { id: 'financial-transaction-1', status: 'PENDING' },
      data: {
        stripeObjectId: 're_async_123',
        status: 'SUCCEEDED',
        amountCents: 1200,
        currency: 'EUR',
      },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', refundedCents: { gte: 1200 } },
      data: { paymentStatus: 'PARTIALLY_REFUNDED' },
    });
  });

  it('cancels an expired unpaid checkout and restores reserved stock once', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_example');
    setup();
    await app.ready();
    const rawBody = Buffer.from(
      JSON.stringify({
        id: 'evt_expired_123',
        type: 'checkout.session.expired',
        data: {
          object: {
            id: 'cs_test_123',
            payment_status: 'unpaid',
            metadata: { orderIds: 'order-1' },
          },
        },
      }),
    );
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signatureFor(rawBody, 'whsec_test_example'),
      },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(200);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'order-1',
        paymentReference: 'cs_test_123',
        paymentStatus: 'UNPAID',
        status: 'PENDING',
      },
      data: { status: 'CANCELLED' },
    });
    expect(productUpdateMany).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: { stock: { increment: 2 } },
    });
  });

  it('does not restore stock twice when Stripe concurrently replays an expiration webhook', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_example');
    const prisma = setup();
    updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await app.ready();

    const rawBody = Buffer.from(
      JSON.stringify({
        id: 'evt_expired_replayed',
        type: 'checkout.session.expired',
        data: {
          object: {
            id: 'cs_test_123',
            payment_status: 'unpaid',
            metadata: { orderIds: 'order-1' },
          },
        },
      }),
    );
    const headers = {
      'content-type': 'application/json',
      'stripe-signature': signatureFor(rawBody, 'whsec_test_example'),
    };

    const [first, replay] = await Promise.all([
      app.inject({ method: 'POST', url: '/api/webhooks/stripe', headers, payload: rawBody }),
      app.inject({ method: 'POST', url: '/api/webhooks/stripe', headers, payload: rawBody }),
    ]);

    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(prisma.order.findMany).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(productUpdateMany).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid and stale webhook signatures', async () => {
    setup();
    const rawBody = Buffer.from('{"type":"checkout.session.completed"}');
    expect(verifyStripeSignature(rawBody, 't=1,v1=deadbeef', 'whsec_test_example')).toBe(false);
    expect(
      verifyStripeSignature(
        rawBody,
        signatureFor(rawBody, 'whsec_test_example', Math.floor(Date.now() / 1000) - 600),
        'whsec_test_example',
      ),
    ).toBe(false);
  });

  it('does not create a payment session when Stripe is not configured', async () => {
    vi.stubEnv('APP_ORIGIN', 'http://localhost:5173');
    const prisma = setup();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/customer/checkout',
      headers: { 'content-type': 'application/json' },
      payload: { orderIds: ['order-1'] },
    });

    expect(response.statusCode).toBe(503);
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('rejects invalid checkout payloads before querying orders', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_example');
    const prisma = setup();
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/customer/checkout',
      payload: { orderIds: ['order-1', 'order-1'] },
    });
    expect(response.statusCode).toBe(400);
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('returns not found when an order does not belong to the customer', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_example');
    const prisma = setup();
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(prisma.order.findMany).mockResolvedValueOnce([] as never);
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/customer/checkout',
      payload: { orderIds: ['foreign-order'] },
    });
    expect(response.statusCode).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['already paid', { ...order, paymentStatus: 'PAID' }],
    ['cancelled', { ...order, status: 'CANCELLED' }],
    ['empty', { ...order, items: [] }],
  ])('refuses checkout for an order that is %s', async (_description, invalidOrder) => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_example');
    const prisma = setup();
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(prisma.order.findMany).mockResolvedValueOnce([invalidOrder] as never);
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/customer/checkout',
      payload: { orderIds: ['order-1'] },
    });
    expect(response.statusCode).toBe(409);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects orders with inconsistent currencies', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_example');
    const prisma = setup();
    vi.mocked(prisma.order.findMany).mockResolvedValueOnce([
      order,
      { ...order, id: 'order-2', currency: 'USD' },
    ] as never);
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/customer/checkout',
      payload: { orderIds: ['order-1', 'order-2'] },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/same supported currency/i);
  });

  it('requires a configured application origin before calling Stripe', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_example');
    vi.stubEnv('APP_ORIGIN', '');
    const prisma = setup();
    vi.stubGlobal('fetch', vi.fn());
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/customer/checkout',
      payload: { orderIds: ['order-1'] },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toMatch(/origin is not configured/i);
    expect(fetch).not.toHaveBeenCalled();
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('rejects unsafe item prices and totals before creating a Stripe session', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_example');
    vi.stubEnv('APP_ORIGIN', 'http://localhost:5173');
    const prisma = setup();
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(prisma.order.findMany).mockResolvedValueOnce([
      { ...order, items: [{ ...order.items[0], unitPriceCents: 0 }] },
    ] as never);
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/customer/checkout',
      payload: { orderIds: ['order-1'] },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/invalid item pricing/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns a gateway error when the Stripe request throws', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_example');
    vi.stubEnv('APP_ORIGIN', 'http://localhost:5173');
    setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/customer/checkout',
      payload: { orderIds: ['order-1'] },
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().error).toMatch(/joindre le service de paiement/i);
  });

  it('returns a gateway error when Stripe rejects the checkout request', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_example');
    vi.stubEnv('APP_ORIGIN', 'http://localhost:5173');
    setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('rejected', { status: 400 })),
    );
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/customer/checkout',
      payload: { orderIds: ['order-1'] },
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().error).toMatch(/n’a pas pu préparer/i);
  });

  it('expires a Stripe session if the order changes before its reference is saved', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_example');
    vi.stubEnv('APP_ORIGIN', 'http://localhost:5173');
    const prisma = setup();
    updateMany.mockResolvedValueOnce({ count: 0 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).endsWith('/expire')) return new Response('{}', { status: 200 });
        return new Response(
          JSON.stringify({ id: 'cs_orphan', url: 'https://checkout.stripe.com/c/pay/cs_orphan' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/customer/checkout',
      payload: { orderIds: ['order-1'] },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/changed while checkout/i);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(fetch).mock.calls[1]?.[0])).toContain('/cs_orphan/expire');
    expect(prisma.order.updateMany).toHaveBeenCalledTimes(1);
  });

  it('returns 503 when webhook processing is not configured', async () => {
    setup();
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      payload: { type: 'checkout.session.completed', data: { object: {} } },
    });
    expect(response.statusCode).toBe(503);
  });

  it('rejects webhook requests without a valid signature', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_example');
    const prisma = setup();
    await app.ready();
    const rawBody = Buffer.from(JSON.stringify({ type: 'checkout.session.completed' }));
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=bad' },
      payload: rawBody,
    });
    expect(response.statusCode).toBe(400);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('acknowledges unrelated Stripe event types without mutating orders', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_example');
    const prisma = setup();
    await app.ready();
    const rawBody = Buffer.from(
      JSON.stringify({
        id: 'evt_unrelated',
        type: 'customer.updated',
        data: { object: { id: 'cus_123' } },
      }),
    );
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signatureFor(rawBody, 'whsec_test_example'),
      },
      payload: rawBody,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: true });
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('acknowledges malformed checkout session objects without mutating orders', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_example');
    const prisma = setup();
    await app.ready();
    const rawBody = Buffer.from(
      JSON.stringify({
        id: 'evt_bad_session',
        type: 'checkout.session.completed',
        data: { object: { id: '', payment_status: 'paid', metadata: { orderIds: '' } } },
      }),
    );
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signatureFor(rawBody, 'whsec_test_example'),
      },
      payload: rawBody,
    });
    expect(response.statusCode).toBe(200);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('rejects webhook metadata containing too many order ids', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_example');
    const prisma = setup();
    await app.ready();
    const rawBody = Buffer.from(
      JSON.stringify({
        id: 'evt_many_orders',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_many',
            payment_status: 'paid',
            metadata: {
              orderIds: Array.from({ length: 16 }, (_, index) => `order-${index}`).join(','),
            },
          },
        },
      }),
    );
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signatureFor(rawBody, 'whsec_test_example'),
      },
      payload: rawBody,
    });
    expect(response.statusCode).toBe(400);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('does not mark an order paid when a signed event reports an unpaid session', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_example');
    const prisma = setup();
    await app.ready();
    const rawBody = Buffer.from(
      JSON.stringify({
        id: 'evt_unpaid',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            payment_status: 'unpaid',
            metadata: { orderIds: 'order-1' },
          },
        },
      }),
    );
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signatureFor(rawBody, 'whsec_test_example'),
      },
      payload: rawBody,
    });
    expect(response.statusCode).toBe(200);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });
});
