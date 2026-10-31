import { expect, test } from '@playwright/test';

test('customer can register and persist a real unpaid order', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /ajouter au panier/i }).first().click();
  await page.getByRole('button', { name: /passer à la commande/i }).click();

  await expect(page.getByRole('heading', { name: /bonjour, bienvenue/i })).toBeVisible();
  const email = `e2e-${Date.now()}@example.test`;
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel(/mot de passe/i).fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Créer un compte' }).click();

  await expect(page.getByRole('heading', { name: /finaliser ma commande/i })).toBeVisible();
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel(/prénom et nom du destinataire/i).fill('Test Client');
  await page.getByLabel('Adresse', { exact: true }).fill('10 rue du Test');
  await page.getByLabel('Code postal').fill('75001');
  await page.getByLabel('Ville').fill('Paris');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /enregistrer la commande/i }).click();

  await expect(page.getByRole('heading', { name: /merci pour votre commande/i })).toBeVisible();
  await expect(page.getByText(/aucun paiement n’a été effectué/i)).toBeVisible();

  await page.getByRole('button', { name: /retour à la boutique/i }).click();
  await page.getByRole('button', { name: /compte client/i }).click();
  await expect(page.getByText(/commande/i).first()).toBeVisible();
});

test('legal pages are accessible from the storefront footer', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Conditions générales de vente' }).click();
  await expect(page.getByRole('heading', { name: /conditions générales de vente/i })).toBeVisible();
  await page.getByRole('button', { name: /retour à la boutique/i }).first().click();
  await page.getByRole('button', { name: 'Confidentialité' }).click();
  await expect(page.getByRole('heading', { name: /politique de confidentialité/i })).toBeVisible();
  await page.getByRole('button', { name: /retour à la boutique/i }).first().click();
  await page.getByRole('button', { name: 'Retours et remboursements' }).click();
  await expect(page.getByRole('heading', { name: /livraison, retours et remboursements/i })).toBeVisible();
});
