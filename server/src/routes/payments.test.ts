// @vitest-environment node

import { createHmac } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
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

function setup() {
  updateMany = vi.fn(async () => ({ count: 1 }));
  productUpdateMany = vi.fn(async () => ({ count: 1 }));
  const transaction = { order: { updateMany }, product: { updateMany: productUpdateMany } };
  const prisma = {
    order: {
      findMany: vi.fn(async () => [order]),
      updateMany,
    },
    product: { updateMany: productUpdateMany },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(transaction),
    ),
  };
  app = Fastify({ logger: false });
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
  registerPaymentRoutes(app, prisma as unknown as PrismaClient, async () => customer);
  return prisma;
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
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/customer/checkout',
      payload: { orderIds: ['order-1'] },
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().error).toMatch(/join the payment service/i);
  });

  it('returns a gateway error when Stripe rejects the checkout request', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_example');
    vi.stubEnv('APP_ORIGIN', 'http://localhost:5173');
    setup();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('rejected', { status: 400 })));
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/customer/checkout',
      payload: { orderIds: ['order-1'] },
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().error).toMatch(/could not prepare/i);
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
    const rawBody = Buffer.from(JSON.stringify({
      id: 'evt_unrelated',
      type: 'customer.updated',
      data: { object: { id: 'cus_123' } },
    }));
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
    const rawBody = Buffer.from(JSON.stringify({
      id: 'evt_bad_session',
      type: 'checkout.session.completed',
      data: { object: { id: '', payment_status: 'paid', metadata: { orderIds: '' } } },
    }));
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
    const rawBody = Buffer.from(JSON.stringify({
      id: 'evt_many_orders',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_many',
          payment_status: 'paid',
          metadata: { orderIds: Array.from({ length: 16 }, (_, index) => `order-${index}`).join(',') },
        },
      },
    }));
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
    const rawBody = Buffer.from(JSON.stringify({
      id: 'evt_unpaid',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_123', payment_status: 'unpaid', metadata: { orderIds: 'order-1' } } },
    }));
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
