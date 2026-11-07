import { z } from 'zod';

const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  priceCents: z.number().int(),
  stock: z.number().int(),
  active: z.boolean(),
  imageUrl: z.string().nullable().optional(),
  imageUrls: z.string().optional(),
  sizes: z.string().optional(),
  dimensions: z.string().optional(),
});

const orderItemSchema = z.object({
  id: z.string(),
  productName: z.string(),
  quantity: z.number().int(),
  unitPriceCents: z.number().int().optional(),
});

export const orderStatusSchema = z.enum([
  'PENDING',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
]);

const financialTransactionSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  stripeObjectId: z.string(),
  requestKey: z.string().nullable().optional(),
  type: z.string(),
  status: z.string(),
  amountCents: z.number().int(),
  currency: z.string(),
  createdAt: z.string(),
});

const orderSchema = z.object({
  id: z.string(),
  status: orderStatusSchema,
  paymentStatus: z.string(),
  totalCents: z.number().int(),
  refundedCents: z.number().int().optional(),
  createdAt: z.string(),
  financialTransactions: z.array(financialTransactionSchema).optional(),
  customer: z.object({ email: z.string().email() }).optional(),
  items: z.array(orderItemSchema),
});

const addressSchema = z.object({
  id: z.string(),
  label: z.string(),
  recipient: z.string(),
  line1: z.string(),
  postalCode: z.string(),
  city: z.string(),
  country: z.string(),
  isDefault: z.boolean(),
});

export const apiSchemas = {
  products: z.object({
    products: z.array(productSchema),
    pagination: z
      .object({
        page: z.number().int(),
        pageSize: z.number().int(),
        total: z.number().int(),
        totalPages: z.number().int(),
      })
      .optional(),
  }),
  customerCart: z.object({
    items: z.array(
      z.object({
        productId: z.string(),
        quantity: z.number().int(),
        product: productSchema.optional(),
      }),
    ),
  }),
  customerFavorites: z.object({ favorites: z.array(z.object({ productId: z.string() })) }),
  productResult: z.object({ product: productSchema }),
  sellerDashboard: z.object({
    periodDays: z.number().int(),
    revenueCents: z.number().int(),
    orders: z.number().int(),
    paidOrders: z.number().int(),
    unitsSold: z.number().int(),
    products: z.number().int(),
    lowStockProducts: z.number().int(),
    currency: z.string(),
  }),
  sellerOrders: z.object({ orders: z.array(orderSchema) }),
  orderResult: z.object({ order: orderSchema }),
  customerOrders: z.object({ orders: z.array(orderSchema) }),
  customerAddresses: z.object({ addresses: z.array(addressSchema) }),
  addressCreated: z.object({ address: addressSchema }),
  adminDashboard: z.object({
    users: z.number().int(),
    sellers: z.number().int(),
    products: z.number().int(),
    activeProducts: z.number().int(),
    orders: z.number().int(),
    paidOrders: z.number().int(),
    revenueCents: z.number().int(),
  }),
  adminUsers: z.object({
    users: z.array(
      z.object({
        id: z.string(),
        publicId: z.string(),
        email: z.string().email(),
        role: z.string(),
        createdAt: z.string(),
      }),
    ),
  }),
  adminProducts: z.object({
    products: z.array(
      productSchema.extend({
        seller: z
          .object({ id: z.string(), publicId: z.string(), email: z.string().email() })
          .nullable()
          .optional(),
      }),
    ),
  }),
  adminOrders: z.object({ orders: z.array(orderSchema) }),
  adminFinancialTransactions: z.object({
    transactions: z.array(
      financialTransactionSchema.extend({
        order: z.object({
          id: z.string(),
          userId: z.string(),
          sellerId: z.string().nullable(),
          totalCents: z.number().int(),
          currency: z.string(),
          paymentStatus: z.string(),
          refundedCents: z.number().int(),
          createdAt: z.string(),
        }),
      }),
    ),
  }),
  reconciliationResult: z.object({
    checkedAt: z.string(),
    checkedOrders: z.number().int(),
    matched: z.number().int(),
    discrepancies: z.number().int(),
    unverified: z.number().int(),
    results: z.array(
      z.object({
        orderId: z.string(),
        state: z.enum(['MATCHED', 'DISCREPANCY', 'UNVERIFIED']),
        issues: z.array(z.string()),
        orderTotalCents: z.number().int().optional(),
        stripeCapturedCents: z.number().int().nullable().optional(),
        refundedCents: z.number().int().optional(),
        stripeRefundedCents: z.number().int().optional(),
        currency: z.string().optional(),
      }),
    ),
  }),
  refundResult: z.union([
    z.object({
      refund: z.object({
        id: z.string(),
        amountCents: z.number().int(),
        currency: z.string(),
        status: z.string(),
      }),
      refundedCents: z.number().int(),
      remainingRefundableCents: z.number().int(),
      paymentStatus: z.string(),
    }),
    z.object({ pending: z.literal(true), message: z.string(), refundId: z.string().optional() }),
  ]),
  checkoutSession: z.object({ checkoutUrl: z.string().url() }),
};

export type SellerProduct = z.infer<typeof productSchema>;
export type SellerOrder = z.infer<typeof orderSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type CustomerAddress = z.infer<typeof addressSchema>;
export type SellerDashboard = z.infer<typeof apiSchemas.sellerDashboard>;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'error' in payload &&
      typeof payload.error === 'string'
    ) {
      return payload.error;
    }
  } catch {
    // Non-JSON errors are reported using the HTTP status.
  }
  return `Request failed (${response.status}).`;
}

/** Applies the common transport policy to every API request. */
async function performApiRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: init.credentials ?? 'include',
  });

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status);
  }
  return response;
}

/** Performs a same-origin API request and validates untrusted response JSON. */
export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const response = await performApiRequest(path, init);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError('The server returned an unexpected response.', response.status);
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError('The server returned an unexpected response.', response.status);
  }
  return parsed.data;
}

/** Performs a successful request with no response body (for example, HTTP 204). */
export async function apiRequestVoid(path: string, init: RequestInit = {}): Promise<void> {
  await performApiRequest(path, init);
}
