import { z } from 'zod';

const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  priceCents: z.number().int(),
  stock: z.number().int(),
  active: z.boolean(),
});

const orderItemSchema = z.object({
  id: z.string(),
  productName: z.string(),
  quantity: z.number().int(),
  unitPriceCents: z.number().int().optional(),
});

export const orderStatusSchema = z.enum(['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']);

const orderSchema = z.object({
  id: z.string(),
  status: orderStatusSchema,
  paymentStatus: z.string(),
  totalCents: z.number().int(),
  createdAt: z.string(),
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
  products: z.object({ products: z.array(productSchema) }),
  customerCart: z.object({ items: z.array(z.object({ productId: z.string(), quantity: z.number().int(), product: productSchema.optional() })) }),
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

/** Performs a same-origin API request and validates untrusted response JSON. */
export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
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

  const payload: unknown = await response.json();
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError('The server returned an unexpected response.', response.status);
  }
  return parsed.data;
}

/** Performs a successful request with no response body (for example, HTTP 204). */
export async function apiRequestVoid(path: string, init: RequestInit = {}): Promise<void> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: init.credentials ?? 'include',
  });
  if (!response.ok) throw new ApiError(await readErrorMessage(response), response.status);
}
