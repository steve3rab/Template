import { expect, test } from '@playwright/test';

test('a customer can register, sign out, sign in again and keep the session', async ({ page }) => {
  const email = `auth-e2e-${Date.now()}@example.test`;
  const password = 'Correct-horse-battery-2026!';

  await page.goto('/');
  await page.getByRole('button', { name: 'Compte client' }).click();
  await expect(page.getByRole('heading', { name: /bonjour, bienvenue/i })).toBeVisible();

  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Créer un compte' }).click();
  const verificationToast = await page.locator('.toast').textContent();
  const code = verificationToast?.match(/(\\d{10})/)?.[1];
  expect(code).toBeTruthy();
  await page.getByLabel('Code de vérification').fill(code!);
  await page.getByRole('button', { name: 'Vérifier mon adresse e-mail' }).click();
  await expect(page.getByText(email)).toBeVisible();

  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByLabel('Adresse e-mail')).toBeVisible();

  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Déjà inscrit ? Connectez-vous' }).click();
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await expect(page.getByText(email)).toBeVisible();
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/auth/me');
      if (!response.ok()) return response.status();
      const payload = (await response.json()) as { user?: { email?: string } };
      return payload.user?.email;
    })
    .toBe(email);
});
