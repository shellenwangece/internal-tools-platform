import { expect, test, type Page } from '@playwright/test';

async function loginAs(page: Page, name: string) {
  await page.context().clearCookies();
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await expect(page.getByRole('link', { name: 'Apps', exact: true })).toBeVisible();
}

test('request → approve → Devin build → preview → merge → publish → use → audit', async ({ page }) => {
  await loginAs(page, 'Priya Shah');
  await page.getByRole('link', { name: 'Request an app' }).first().click();
  await page.getByLabel('App name').fill('Refunds Dashboard');
  await page.getByLabel('What should the app do?').fill('Support agents need to see pending refunds with customer name and amount, and filter by reason.');
  await page.locator('label.chip', { hasText: 'Support' }).click();
  await page.locator('.dataset-card', { hasText: 'Refunds' }).locator('label.chip', { hasText: /^View$/ }).click();
  await page.getByRole('button', { name: 'Send for approval' }).click();
  await expect(page.getByText('Waiting for approval')).toBeVisible();
  const requestUrl = page.url();

  await loginAs(page, 'Marco Rossi');
  await page.goto(requestUrl);
  await page.getByRole('button', { name: 'Approve and start building' }).click();
  await expect(page.getByText('Devin is building your app').first()).toBeVisible();
  await expect(page.getByText('Checkpoint 2 · Review and publish')).toBeVisible({ timeout: 30000 });

  await page.getByRole('button', { name: 'Build preview' }).click();
  const preview = page.frameLocator('iframe.app-frame');
  await expect(preview.locator('#out')).toContainText('Hello Marco Rossi. Refunds: 150 rows');

  await page.getByRole('button', { name: 'Publish to catalog' }).click();
  await expect(page.getByRole('alert')).toContainText('must be merged');
  const id = requestUrl.split('/').pop();
  expect((await page.request.post(`/api/mock/github/merge/${id}`)).ok()).toBe(true);
  await page.getByRole('button', { name: 'Publish to catalog' }).click();
  await expect(page.getByText('This app is published.')).toBeVisible();

  await loginAs(page, 'Sam Okafor');
  await page.locator('a.app-card:not(.external)', { hasText: 'Refunds Dashboard' }).click();
  await expect(page.frameLocator('iframe.app-frame').locator('#out')).toContainText('Hello Sam Okafor. Refunds: 150 rows');

  await loginAs(page, 'Lena Park');
  await expect(page.locator('a.app-card:not(.external)', { hasText: 'Refunds Dashboard' })).toHaveCount(0);

  await loginAs(page, 'Ava Chen');
  await page.getByRole('link', { name: 'Audit log' }).click();
  await page.getByRole('button', { name: 'Verify integrity' }).click();
  await expect(page.getByText('Integrity check passed.')).toBeVisible();
  for (const action of ['request.submitted', 'devin.session_started', 'app.published', 'data.read']) await expect(page.getByText(action).first()).toBeVisible();
});
