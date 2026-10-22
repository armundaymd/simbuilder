// The author's guide and the in-editor Getting started checklist.
import { expect, test } from '@playwright/test';
import { drawHotspot, exampleShot } from './helpers';

test('guide opens from the dashboard and all its screenshots load', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-guide').click();
  await expect(page.getByRole('heading', { name: 'How to build a training simulation' })).toBeVisible();
  for (const s of ['Quick start', 'Building in mistakes', 'Training modes', 'Patient privacy', 'Exporting and sharing', 'Troubleshooting'])
    await expect(page.getByRole('heading', { name: new RegExp(s) })).toBeVisible();
  const imgs = page.locator('.help img');
  expect(await imgs.count()).toBeGreaterThanOrEqual(8);
  for (const img of await imgs.all()) {
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  }
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByTestId('new-simulation')).toBeVisible();
});

test('getting started checklist ticks itself off and can be hidden', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-simulation').click();
  await page.getByTestId('new-title').fill('Checklist');
  await page.getByTestId('create-simulation').click();
  const list = page.getByTestId('getting-started');
  await expect(list).toContainText('0/6');
  await page.getByTestId('upload-input').first().setInputFiles([exampleShot('01-board.png')]);
  await expect(list).toContainText('1/6');
  await drawHotspot(page, 10, 30, 30, 5); // first area on the only screen = finish → no problems either
  await expect(list).toContainText('3/6');
  await page.keyboard.press('Escape');
  await page.getByTestId('screen-instruction').fill('Click the row.');
  await expect(list).toContainText('4/6');
  await list.getByRole('button', { name: 'Hide checklist' }).click();
  await expect(list).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('screen-item')).toHaveCount(1);
  await expect(page.getByTestId('getting-started')).toHaveCount(0);
});
