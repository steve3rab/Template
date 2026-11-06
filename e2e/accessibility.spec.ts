import { expect, test } from '@playwright/test';

test.describe('accessibility smoke checks', () => {
  test('storefront exposes landmarks, a single primary heading and named controls', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

    const unnamedButtons = await page.locator('button').evaluateAll((buttons) =>
      buttons
        .filter((button) => {
          const label = button.getAttribute('aria-label')?.trim();
          const text = button.textContent?.trim();
          return !label && !text;
        })
        .map((button) => button.outerHTML.slice(0, 180)),
    );
    expect(unnamedButtons, 'Every visible button should have an accessible name').toEqual([]);

    const imagesWithoutAlt = await page.locator('img:not([alt])').count();
    expect(imagesWithoutAlt, 'Images must declare an alt attribute (empty is valid for decoration)').toBe(0);
  });

  test('cart can be opened and closed using the keyboard', async ({ page }) => {
    await page.goto('/');
    const cartButton = page.getByRole('button', { name: /panier/i });
    await cartButton.focus();
    await expect(cartButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('complementary', { name: 'Votre panier' })).toBeVisible();
    const closeButton = page.getByRole('button', { name: 'Fermer le panier' });
    await closeButton.focus();
    await expect(closeButton).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('complementary', { name: 'Votre panier' })).toBeHidden();
  });
});
