import { expect, test } from '@playwright/test';

test('seller can sign in, create a product and receive a translated notification', async ({
  page,
}) => {
  const productName = `E2E Seller Product ${Date.now()}`;

  await page.goto('/');
  await page.getByRole('button', { name: 'Compte client' }).click();
  await page.getByRole('button', { name: 'Déjà inscrit ? Connectez-vous' }).click();
  await page.getByLabel('Adresse e-mail').fill('test.seller@example.com');
  await page.getByLabel('Mot de passe').fill('Local-Test-Password-2026!');
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await expect(page.getByText('test.seller@example.com')).toBeVisible();
  await page.getByRole('button', { name: 'English' }).click();
  await page.getByRole('button', { name: 'Seller area' }).click();

  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Add a product' })).toBeVisible();
  await page.getByLabel('Product name').fill(productName);
  await page.getByLabel('Description').fill('Product created by the seller end-to-end journey.');
  await page.getByLabel('Price (€)').fill('34.90');
  await page.getByLabel('Initial stock').fill('8');
  await page.getByRole('button', { name: 'Create product' }).click();

  await expect(page.locator('.toast[role="status"]')).toContainText('Product created.');
  await expect(page.getByText(productName)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'My products' })).toBeVisible();
});
