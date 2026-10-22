// Success criteria: create a simulation from 5 screenshots without code,
// preview it, export standalone HTML, open it offline and complete it.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { clickHotspot, drawHotspot, exampleShot, startPlayer } from './helpers';

const SHOTS = ['01-board.png', '02-summary.png', '03-workup.png', '06-signed.png', '07-dispo.png'].map(exampleShot);
// Hotspot rectangles (percent) roughly over: patient row, Workup tab, New Order, Disposition tab, Accept Disposition.
const RECTS = [
  [8, 30.5, 84, 4],
  [0.5, 23, 11.5, 4.5],
  [15.5, 27, 7.5, 4],
  [0.5, 37, 11.5, 4.5],
  [14.5, 49, 11, 4],
];

test('build, preview, export and complete a simulation offline', async ({ page, context }, testInfo) => {
  await page.goto('/');
  await page.getByTestId('new-simulation').click();
  await page.getByTestId('new-title').fill('My test simulation');
  await page.getByTestId('new-description').fill('Built by an automated test.');
  await page.getByTestId('create-simulation').click();
  await page.waitForURL(/#\/edit\//);
  await expect(page.getByTestId('empty-canvas')).toBeVisible();

  // Upload 5 screenshots.
  await page.getByTestId('upload-input').first().setInputFiles(SHOTS);
  await expect(page.getByTestId('screen-item')).toHaveCount(5);

  // Draw one hotspot per screen. Defaults auto-connect each to the next screen; the last one finishes.
  for (let i = 0; i < 5; i++) {
    await page.getByTestId('screen-item').nth(i).click();
    await drawHotspot(page, ...(RECTS[i] as [number, number, number, number]));
    await expect(page.getByTestId('hotspot')).toHaveCount(1);
    await page.getByTestId('hotspot-instruction').fill(`Step ${i + 1}: click the highlighted area.`);
    if (i < 4) await expect(page.getByTestId('hotspot-action')).toHaveValue('navigate');
    else await expect(page.getByTestId('hotspot-action')).toHaveValue('finish');
  }
  await page.keyboard.press('Escape');
  await page.getByTestId('screen-instruction').fill('Complete the disposition.');
  await expect(page.getByTestId('issues-button')).toHaveText(/Ready/);

  // Autosave + reload persists everything.
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
  await page.reload();
  await expect(page.getByTestId('screen-item')).toHaveCount(5);
  await page.getByTestId('screen-item').nth(4).click();
  await expect(page.getByTestId('screen-instruction')).toHaveValue('Complete the disposition.');

  // Preview.
  await page.getByTestId('preview').click();
  await startPlayer(page, 'guided');
  await expect(page.getByTestId('sim-instruction')).toContainText('Step 1');
  for (let i = 0; i < 5; i++) await page.locator('.simp-hs').first().click();
  await expect(page.getByTestId('sim-summary')).toBeVisible();

  // Export standalone HTML.
  await page.goto(page.url().replace('#/preview/', '#/edit/'));
  await page.getByTestId('export').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-html').click()]);
  const file = testInfo.outputPath('sim.html');
  await download.saveAs(file);
  const html = readFileSync(file, 'utf8');
  expect(html).not.toMatch(/src="https?:|href="https?:/);

  // Open it independently, offline, with every network request blocked.
  const requests: string[] = [];
  await context.setOffline(true);
  const offline = await context.newPage();
  await offline.route(/^https?:/, (r) => (requests.push(r.request().url()), r.abort()));
  await offline.goto('file://' + file);
  await startPlayer(offline, 'independent');
  await offline.getByTestId('sim-stage').click({ position: { x: 5, y: 5 } }); // a wrong click
  for (let i = 0; i < 5; i++) await offline.locator('.simp-hs').first().click();
  await expect(offline.getByTestId('sim-summary')).toBeVisible();
  await expect(offline.getByTestId('sim-incorrect-count')).toHaveText('1');
  expect(requests).toEqual([]);
  await context.setOffline(false);
});

test('undo/redo, duplicate, delete and keyboard nudging of hotspots', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-simulation').click();
  await page.getByTestId('new-title').fill('Hotspot editing');
  await page.getByTestId('create-simulation').click();
  await page.getByTestId('upload-input').first().setInputFiles([exampleShot('01-board.png')]);
  await drawHotspot(page, 10, 10, 20, 10);
  await expect(page.getByTestId('hotspot')).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+d');
  await expect(page.getByTestId('hotspot')).toHaveCount(2);
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('hotspot')).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByTestId('hotspot')).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(page.getByTestId('hotspot')).toHaveCount(1);

  // Move by dragging, then nudge with arrows.
  await page.getByTestId('hotspot').first().click();
  const xInput = page.locator('[data-testid=hotspot-panel] input[inputmode=decimal]').first();
  const before = Number(await xInput.inputValue());
  await page.keyboard.press('Shift+ArrowRight');
  await expect(xInput).toHaveValue(String(before + 2));
  await page.keyboard.press('ControlOrMeta+z');
  await expect(xInput).toHaveValue(String(before));
});

test('deleting a screen clears links to it and validation flags them', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-simulation').click();
  await page.getByTestId('new-title').fill('Broken links');
  await page.getByTestId('create-simulation').click();
  await page.getByTestId('upload-input').first().setInputFiles([exampleShot('01-board.png'), exampleShot('02-summary.png'), exampleShot('03-workup.png')]);
  await page.getByTestId('screen-item').nth(0).click();
  await drawHotspot(page, 10, 30, 30, 5);
  await expect(page.getByTestId('hotspot-target')).not.toHaveValue('');
  // Delete screen 2 (the destination).
  await page.getByTestId('screen-item').nth(1).hover();
  await page.getByTestId('screen-item').nth(1).getByRole('button', { name: 'Delete screen' }).click();
  await expect(page.getByTestId('screen-item')).toHaveCount(2);
  await expect(page.getByRole('status')).toContainText('need a new destination');
  await expect(page.getByTestId('issues-button')).toContainText('problem');
  await page.getByTestId('export').click();
  await expect(page.getByTestId('export-issues')).toContainText('no destination is chosen');
  await expect(page.getByTestId('export-issues')).toContainText('can’t be reached');
  await expect(page.getByTestId('export-html')).toBeDisabled();
  await expect(page.getByTestId('export-json')).toBeEnabled();
});

test('edits made just before closing or reloading the page are not lost', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-simulation').click();
  await page.getByTestId('new-title').fill('Quick close');
  await page.getByTestId('create-simulation').click();
  await page.getByTestId('upload-input').first().setInputFiles([exampleShot('01-board.png'), exampleShot('02-summary.png')]);
  await expect(page.getByTestId('screen-item')).toHaveCount(2);
  await drawHotspot(page, 10, 30, 30, 5);
  await page.keyboard.press('Escape');
  await page.getByTestId('screen-instruction').fill('Typed right before reloading');
  await page.reload(); // immediately, while the autosave is still pending
  await expect(page.getByTestId('screen-item')).toHaveCount(2);
  await expect(page.getByTestId('hotspot')).toHaveCount(1);
  await expect(page.getByTestId('screen-instruction')).toHaveValue('Typed right before reloading');
});
