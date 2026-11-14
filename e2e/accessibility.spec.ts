import { expect, test } from '@playwright/test';

test.describe('accessibility smoke checks', () => {
  test('storefront exposes landmarks, a single primary heading and named controls', async ({
    page,
  }) => {
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
    expect(
      imagesWithoutAlt,
      'Images must declare an alt attribute (empty is valid for decoration)',
    ).toBe(0);
  });

  test('skip link moves keyboard users directly to the main content', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');

    const skipLink = page.getByRole('link', { name: 'Aller au contenu principal' });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/#main-content$/);
    await expect(page.locator('#main-content')).toBeFocused();
  });

  test('quick-add action is revealed when a product card receives keyboard focus', async ({
    page,
  }) => {
    await page.goto('/');
    const firstCard = page.locator('.product-card').first();
    const title = firstCard.locator('.product-title-button');
    const quickAdd = firstCard.locator('.quick-add');

    await title.focus();
    await expect
      .poll(() => quickAdd.evaluate((element) => getComputedStyle(element).opacity))
      .toBe('1');
  });

  test('reduced-motion preference disables non-essential transitions', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const duration = await page
      .getByRole('button', { name: 'Compte client' })
      .evaluate((element) => getComputedStyle(element).transitionDuration);
    const durations = duration.split(',').map((value) => Number.parseFloat(value));

    expect(durations.length).toBeGreaterThan(0);
    expect(durations.every((value) => value <= 0.001)).toBe(true);
  });

  test('cart can be opened and closed using the keyboard', async ({ page }) => {
    await page.goto('/');
    const cartButton = page.getByRole('button', { name: /^Panier, \d+ article\(s\)$/ });
    await cartButton.focus();
    await expect(cartButton).toBeFocused();
    await page.keyboard.press('Enter');

    const drawer = page.getByRole('complementary', { name: 'Votre panier' });
    await expect(drawer).toBeVisible();
    const closeButton = drawer.getByRole('button', { name: 'Fermer le panier' });
    await closeButton.focus();
    await expect(closeButton).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(drawer).toBeHidden();
  });
});
