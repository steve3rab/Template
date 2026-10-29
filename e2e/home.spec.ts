import { expect, test } from '@playwright/test';

test('home page renders and counter works in a real browser', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /une base solide|a solid foundation/i }),
  ).toBeVisible();
  await expect(page.getByTestId('counter-value')).toHaveText('0');
  await page.getByRole('button', { name: /incrémenter|increment/i }).click();
  await expect(page.getByTestId('counter-value')).toHaveText('1');
});

test('language can be switched and is persisted', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: /a solid foundation/i })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.reload();
  await expect(page.getByRole('heading', { name: /a solid foundation/i })).toBeVisible();
});

test('layout remains usable without horizontal overflow at common viewport widths', async ({
  page,
}) => {
  const viewportWidths = [320, 360, 375, 390, 430, 540, 640, 768, 820, 1024, 1280, 1440, 1920];

  for (const width of viewportWidths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /une base solide|a solid foundation/i }),
    ).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));

    expect(
      dimensions.documentWidth,
      `Expected no horizontal overflow at viewport width ${width}px`,
    ).toBeLessThanOrEqual(dimensions.viewportWidth);
    await expect(page.getByRole('button', { name: /incrémenter|increment/i })).toBeVisible();
  }
});
