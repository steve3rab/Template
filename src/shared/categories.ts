/** Canonical product categories shared by the storefront and seller workspace. */
export const PRODUCT_CATEGORIES = [
  'Vêtements',
  'Chaussures',
  'Accessoires',
  'Maison',
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];
