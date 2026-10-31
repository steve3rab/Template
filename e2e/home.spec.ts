import { expect, test } from '@playwright/test';

test('storefront renders the Atelier catalogue and filters products', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /le style, en toute simplicité/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /les pièces du moment/i })).toBeVisible();
  await expect(page.locator('.product-card').first()).toBeVisible();

  await page.locator('.category-filters').getByRole('button', { name: 'Chaussures' }).click();
  await expect(page.locator('.product-card')).toHaveCount(2);
  await expect(page.locator('.product-meta h3', { hasText: /sneakers everyday|baskets city/i }).first()).toBeVisible();
});

test('language preference is applied to the account panel and persists', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'The language switcher is intentionally hidden on narrow screens.');
  await page.goto('/');
  await page.getByRole('button', { name: 'Compte client' }).click();
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'User account' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await page.reload();
  await page.getByRole('button', { name: 'Compte client' }).click();
  await expect(page.getByRole('heading', { name: 'User account' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('storefront stays usable without horizontal overflow at common viewport widths', async ({
  page,
}) => {
  const viewportWidths = [320, 360, 375, 390, 430, 540, 640, 768, 820, 1024, 1280, 1440, 1920];

  await page.goto('/');
  for (const width of viewportWidths) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('heading', { name: /le style, en toute simplicité/i })).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));

    expect(
      dimensions.documentWidth,
      `Expected no horizontal overflow at viewport width ${width}px`,
    ).toBeLessThanOrEqual(dimensions.viewportWidth);
    await expect(page.getByRole('button', { name: /panier/i })).toBeVisible();
  }
});
