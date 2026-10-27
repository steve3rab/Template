import { expect, test } from '@playwright/test';

test('home page renders and counter works in a real browser', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /une base solide/i })).toBeVisible();
  await expect(page.getByTestId('counter-value')).toHaveText('0');
  await page.getByRole('button', { name: /incrémenter/i }).click();
  await expect(page.getByTestId('counter-value')).toHaveText('1');
});
