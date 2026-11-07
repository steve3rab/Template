import { expect, test } from '@playwright/test';

test('customer can register and persist a real unpaid order', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: /ajouter au panier/i })
    .first()
    .click();
  await page.getByRole('button', { name: /passer à la commande/i }).click();

  await expect(page.getByRole('heading', { name: /bonjour, bienvenue/i })).toBeVisible();
  await page.getByRole('button', { name: 'Pas encore de compte ? Inscrivez-vous' }).click();
  const email = `e2e-${Date.now()}@example.test`;
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel(/mot de passe/i).fill('Correct-horse-battery-2026!');
  const registrationResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/auth/register') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Créer un compte' }).click();
  const registrationResponse = await registrationResponsePromise;
  expect(registrationResponse.status()).toBe(202);
  const registrationPayload = (await registrationResponse.json()) as {
    verificationRequired: boolean;
    developmentCode?: string;
  };
  expect(registrationPayload.verificationRequired).toBe(true);
  const code = registrationPayload.developmentCode;
  if (!code || !/^\d{10}$/.test(code)) {
    throw new Error('The test registration response did not include a valid verification code.');
  }
  await page.getByLabel('Code de vérification').fill(code);
  await page.getByRole('button', { name: 'Vérifier mon adresse e-mail' }).click();

  await expect(page.getByRole('heading', { name: /finaliser ma commande/i })).toBeVisible();
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'Complete your order' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Delivery information' })).toBeVisible();
  await page.getByRole('button', { name: 'Français' }).click();
  await expect(page.getByRole('heading', { name: /finaliser ma commande/i })).toBeVisible();
  await expect(page.getByLabel('Adresse e-mail du compte')).toHaveValue(email);
  await page.getByLabel(/destinataire/i).fill('Test Client');
  await page.getByLabel('Adresse', { exact: true }).fill('10 rue du Test');
  await page.getByLabel('Code postal').fill('75001');
  await page.getByLabel('Ville').fill('Paris');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /enregistrer la commande et continuer/i }).click();

  await expect(page.getByRole('heading', { name: /merci pour votre commande/i })).toBeVisible();
  await expect(page.getByText(/aucun paiement n’a été effectué/i)).toBeVisible();

  await page.getByRole('button', { name: /retour à la boutique/i }).click();
  await page.getByRole('button', { name: /compte client/i }).click();
  await expect(page.getByText(/Commande [a-z0-9]{8}/i)).toBeVisible();
  await expect(page.getByText(/En attente de paiement/i)).toBeVisible();
  await expect(page.getByText(/Paiement : À régler/i)).toBeVisible();
  await page.getByRole('button', { name: /payer mes commandes en attente/i }).click();
  await expect(page.locator('.toast[role="status"]')).toContainText(
    /paiement en ligne n’est pas encore configuré/i,
  );
});

test('legal pages are accessible from the storefront footer', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Conditions générales de vente' }).click();
  await expect(page.getByRole('heading', { name: /conditions générales de vente/i })).toBeVisible();
  await page
    .getByRole('button', { name: /retour à la boutique/i })
    .first()
    .click();
  await page.getByRole('button', { name: 'Confidentialité' }).click();
  await expect(page.getByRole('heading', { name: /politique de confidentialité/i })).toBeVisible();
  await page
    .getByRole('button', { name: /retour à la boutique/i })
    .first()
    .click();
  await page.getByRole('button', { name: 'Retours et remboursements' }).click();
  await expect(
    page.getByRole('heading', { name: /livraison, retours et remboursements/i }),
  ).toBeVisible();
});
