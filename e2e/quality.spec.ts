import { expect, test, type Page } from '@playwright/test';

const TEST_PASSWORD = 'Local-Test-Password-2026!';

async function signInAs(page: Page, email: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Compte client' }).click();
  await expect(page.getByRole('heading', { name: /bonjour, bienvenue/i })).toBeVisible();
  await page.getByRole('button', { name: /déjà inscrit/i }).click();
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

test('French and English storefront labels stay in sync when switching languages', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('heading', { name: 'Le style, en toute simplicité.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Compte client' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Panier, 0 article(s)' })).toBeVisible();

  await page.getByRole('button', { name: 'English' }).click();

  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { name: 'Effortless style.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Customer account' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cart, 0 item(s)' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();

  await page.getByRole('button', { name: 'Customer account' }).click();
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();

  await page.getByRole('button', { name: 'Français' }).click();
  await expect(page.getByRole('heading', { name: 'Votre compte' })).toBeVisible();
  await page.getByRole('button', { name: 'Collection', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('heading', { name: 'Le style, en toute simplicité.' })).toBeVisible();
});

test('legal pages retain the selected language and expose a way back', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'English' }).click();
  await page.getByRole('button', { name: 'Privacy', exact: true }).click();

  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('button', { name: /back to shop/i })).toBeVisible();

  await page.getByRole('button', { name: /back to shop/i }).click();
  await expect(page.getByRole('heading', { name: 'Effortless style.' })).toBeVisible();
});

test('password reset page follows the selected language', async ({ page }) => {
  await page.goto('/reset-password');

  await expect(page.getByRole('heading', { name: 'Réinitialiser le mot de passe' })).toBeVisible();
  await expect(page.getByText(/ce lien de réinitialisation est incomplet/i)).toBeVisible();

  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await expect(page.getByText(/this password reset link is incomplete/i)).toBeVisible();
  await expect(page.getByLabel('New password')).toBeVisible();
});

test('browser geolocation and device sensors are denied by security policy', async ({ page }) => {
  const response = await page.goto('/');
  expect(response).not.toBeNull();
  expect(response?.headers()['permissions-policy']).toContain('geolocation=()');
  expect(response?.headers()['permissions-policy']).toContain('accelerometer=()');

  const geolocationPermission = await page.evaluate(async () => {
    const permission = await navigator.permissions.query({ name: 'geolocation' });
    return permission.state;
  });
  expect(geolocationPermission).toBe('denied');
});

test('storefront exposes semantic landmarks and accessible control names', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.locator('header.store-header')).toBeVisible();
  await expect(page.locator('footer.store-footer')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

  const unnamedButtons = await page.locator('button').evaluateAll((buttons) =>
    buttons
      .filter((button) => {
        const label =
          button.getAttribute('aria-label') ??
          button.getAttribute('title') ??
          button.textContent ??
          '';
        return label.trim().length === 0;
      })
      .map((button) => button.outerHTML),
  );
  expect(unnamedButtons, 'Every visible button should have an accessible name').toEqual([]);

  const imagesWithoutAlt = await page.locator('img:not([alt])').count();
  expect(imagesWithoutAlt, 'Every image must declare an alt attribute').toBe(0);
});

test('mobile layout remains readable and the cart can be operated by keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);

  await page.getByRole('button', { name: 'Panier, 0 article(s)' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Votre panier' })).toBeVisible();

  await page.locator('.close-drawer').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Votre panier' })).toBeHidden();
});

test('seller workspace is available and translated in French and English', async ({ page }) => {
  await signInAs(page, 'test.seller@example.com');
  await expect(page.getByRole('button', { name: 'Espace vendeur' })).toBeVisible();
  await page.getByRole('button', { name: 'Espace vendeur' }).click();
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();

  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.getByRole('button', { name: 'Français' }).click();
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
});

test('administrator workspace is available and translated in French and English', async ({
  page,
}) => {
  await signInAs(page, 'test.admin@example.com');
  await expect(page.getByRole('button', { name: 'Administration' })).toBeVisible();
  await page.getByRole('button', { name: 'Administration' }).click();
  await expect(page.getByRole('heading', { name: 'Centre de gestion' })).toBeVisible();

  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'Management centre' })).toBeVisible();
  await page.getByRole('button', { name: 'Français' }).click();
  await expect(page.getByRole('heading', { name: 'Centre de gestion' })).toBeVisible();
});
