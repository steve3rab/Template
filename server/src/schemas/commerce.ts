import { z } from 'zod';

const httpUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  }, 'URL must use HTTP or HTTPS.');

export const productInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(4000).default(''),
  category: z.string().trim().min(2).max(60),
  priceCents: z.number().int().min(1).max(100_000_000),
  stock: z.number().int().min(0).max(1_000_000),
  imageUrl: httpUrlSchema.optional().nullable(),
  active: z.boolean().default(true),
});

export const addressInputSchema = z.object({
  label: z.string().trim().min(1).max(60).default('Domicile'),
  recipient: z.string().trim().min(2).max(120),
  line1: z.string().trim().min(3).max(180),
  line2: z.string().trim().max(180).optional().nullable(),
  postalCode: z.string().trim().min(2).max(20),
  city: z.string().trim().min(2).max(100),
  country: z
    .string()
    .trim()
    .transform((country) => country.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{2}$/))
    .default('FR'),
  isDefault: z.boolean().default(false),
});

export const roleInputSchema = z.object({
  role: z.enum(['CUSTOMER', 'SELLER']),
});

export const cartInputSchema = z
  .object({
    items: z
      .array(
        z.object({
          productId: z.string().trim().min(1).max(128),
          quantity: z.number().int().min(0).max(100),
        }),
      )
      .max(100),
  })
  .refine(
    (value) => new Set(value.items.map((item) => item.productId)).size === value.items.length,
    'Duplicate product ids are not allowed.',
  );

export const productQuerySchema = z.object({
  category: z.string().trim().max(60).optional(),
});

export const resourceIdParamsSchema = z.object({
  id: z.string().trim().min(1).max(128),
});

export const productIdParamsSchema = z.object({
  productId: z.string().trim().min(1).max(128),
});

export const createOrderInputSchema = z.object({
  addressId: z.string().trim().min(1).max(128),
});

export const checkoutInputSchema = z
  .object({
    orderIds: z.array(z.string().trim().min(1).max(128)).min(1).max(15),
  })
  .refine(
    (value) => new Set(value.orderIds).size === value.orderIds.length,
    'Duplicate order ids are not allowed.',
  );

export const sellerOrderStatusSchema = z.object({
  status: z.enum(['PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
});

export const passwordResetRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((email) => email.toLowerCase()),
});

export const passwordResetCompleteSchema = z.object({
  token: z.string().min(32).max(256),
  password: z.string().min(12).max(128),
});
