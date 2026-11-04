import { z } from 'zod';
import { emailSchema, passwordResetCompleteCredentialsSchema } from './auth.js';

const httpUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  }, 'URL must use HTTP or HTTPS.');

function hasValidImageSignature(value: string): boolean {
  const match = value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match?.[1] || !match[2]) return false;

  const bytes = Buffer.from(match[2], 'base64');
  if (
    bytes.length === 0 ||
    bytes.toString('base64').replace(/=+$/, '') !== match[2].replace(/=+$/, '')
  ) {
    return false;
  }

  const format = match[1].toLowerCase();
  if (format === 'png') {
    return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (format === 'jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  );
}

const productImageSchema = z
  .string()
  .max(4_500_000)
  .refine((value) => {
    if (/^https?:\/\//i.test(value)) return httpUrlSchema.safeParse(value).success;
    return hasValidImageSignature(value);
  }, 'Product images must be valid HTTP(S) URLs or PNG/JPEG/WebP image uploads.');

const productDimensionsSchema = z
  .object({
    length: z.number().positive().max(100_000).optional(),
    width: z.number().positive().max(100_000).optional(),
    height: z.number().positive().max(100_000).optional(),
    unit: z.enum(['mm', 'cm', 'm', 'in']).default('cm'),
  })
  .strict();

export const productInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(4000).default(''),
  category: z.string().trim().min(2).max(60),
  priceCents: z.number().int().min(1).max(100_000_000),
  stock: z.number().int().min(0).max(1_000_000),
  imageUrl: httpUrlSchema.optional().nullable(),
  imageUrls: z
    .array(productImageSchema)
    .max(5)
    .optional()
    .transform((value) => (value ? JSON.stringify(value) : undefined)),
  sizes: z
    .array(z.string().trim().min(1).max(40))
    .max(30)
    .optional()
    .transform((value) => (value ? JSON.stringify([...new Set(value)]) : undefined)),
  dimensions: productDimensionsSchema
    .optional()
    .transform((value) => (value ? JSON.stringify(value) : undefined)),
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

export const passwordResetRequestSchema = z.object({ email: emailSchema });

export const passwordResetCompleteSchema = passwordResetCompleteCredentialsSchema;
