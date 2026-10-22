// Dashboard, persistence, duplicate/delete, folders, and export/import round-trips.
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { completeExample, loadExample, startPlayer } from './helpers';

test('dashboard: saved projects, duplicate, folders, delete', async ({ page }) => {
  await loadExample(page);
  await page.goto('/');
  const card = page.getByTestId('project-card');
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId('screen-count')).toHaveText('9');
  await expect(page.getByRole('button', { name: /^Emergency Department/ })).toHaveCount(1);

  await card.getByRole('button', { name: 'Duplicate' }).click();
  await expect(page.getByTestId('project-card')).toHaveCount(2);
  await expect(page.getByText('(copy)')).toBeVisible();

  // Move the copy to Radiology and filter.
  const copy = page.getByTestId('project-card').filter({ hasText: '(copy)' });
  await copy.getByLabel('Folder').selectOption({ label: 'Radiology' });
  await page.getByRole('button', { name: /^Radiology/ }).click();
  await expect(page.getByTestId('project-card')).toHaveCount(1);

  // Delete it; the original keeps its screenshots.
  await page.getByTestId('project-card').getByRole('button', { name: 'Delete' }).click();
  await page.getByTestId('confirm-delete').click();
  await expect(page.getByTestId('project-card')).toHaveCount(0);
  await page.getByRole('button', { name: /^All simulations/ }).click();
  await expect(page.getByTestId('project-card')).toHaveCount(1);
  await page.getByTestId('project-card').getByRole('button', { name: 'Preview' }).click();
  await startPlayer(page, 'guided');
  await expect(page.locator('.simp-stage img')).toHaveJSProperty('complete', true);
  expect(await page.locator('.simp-stage img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1440);
});

test('project JSON export → import round-trip', async ({ page }, testInfo) => {
  await loadExample(page);
  await page.getByTestId('export').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-json').click()]);
  const file = testInfo.outputPath('project.json');
  await download.saveAs(file);
  const json = JSON.parse(readFileSync(file, 'utf8'));
  expect(json.format).toBe('simbuilder-project');
  expect(json.project.screens).toHaveLength(9);
  expect(Object.keys(json.images)).toHaveLength(9);

  await page.goto('/');
  await page.getByTestId('import-input').setInputFiles(file);
  await expect(page.getByTestId('project-card')).toHaveCount(2);
  await page.getByTestId('project-card').first().getByRole('button', { name: 'Preview' }).click();
  await startPlayer(page, 'guided');
  await completeExample(page);

  // Invalid files are rejected with a clear message.
  await page.goto('/');
  await page.getByTestId('import-input').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(page.getByRole('status')).toContainText('not a SimBuilder project');
});

test('ZIP export works offline from the unzipped folder', async ({ page, context }, testInfo) => {
  await loadExample(page);
  await page.getByTestId('export').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-zip').click()]);
  const zip = testInfo.outputPath('sim.zip');
  await download.saveAs(zip);
  const dir = testInfo.outputPath('unzipped');
  execFileSync('unzip', ['-q', '-o', zip, '-d', dir]);
  for (const f of ['index.html', 'player.js', 'data.js', 'project.json']) expect(existsSync(path.join(dir, f))).toBe(true);

  await context.setOffline(true);
  const p = await context.newPage();
  const requests: string[] = [];
  await p.route(/^https?:/, (r) => (requests.push(r.request().url()), r.abort()));
  await p.goto('file://' + path.join(dir, 'index.html'));
  await startPlayer(p, 'guided');
  await completeExample(p);
  expect(requests).toEqual([]);
  await context.setOffline(false);
});

test('standalone HTML of the EHR example completes offline in every mode', async ({ page, context }, testInfo) => {
  await loadExample(page);
  await page.getByTestId('export').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-html').click()]);
  const file = testInfo.outputPath('ehr.html');
  await download.saveAs(file);
  await context.setOffline(true);
  const p = await context.newPage();
  await p.goto('file://' + file);
  await startPlayer(p, 'independent');
  await completeExample(p);
  await expect(p.getByTestId('sim-incorrect-count')).toHaveText('0');
  await p.getByRole('button', { name: 'Choose another mode' }).click();
  await startPlayer(p, 'demo');
  for (let i = 0; i < 20 && (await p.getByTestId('sim-summary').count()) === 0; i++) {
    await p.getByTestId('sim-next').click();
    await p.waitForTimeout(700);
  }
  await expect(p.getByTestId('sim-summary')).toBeVisible();
  await context.setOffline(false);
});
