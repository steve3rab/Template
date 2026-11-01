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
});
