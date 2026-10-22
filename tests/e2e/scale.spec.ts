// Larger simulations: 40 screenshots, continuous editing, export and offline playthrough.
import { expect, test, type Page } from '@playwright/test';
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { EXAMPLE_DIR } from './helpers';

const COUNT = 40;

const savedHotspotCount = (page: Page) =>
  page.evaluate(async () => {
    const req = indexedDB.open('sim-builder');
    await new Promise((r) => (req.onsuccess = r));
    const get = req.result.transaction('projects').objectStore('projects').getAll();
    await new Promise((r) => (get.onsuccess = r));
    return (get.result as { screens: { hotspots: unknown[] }[] }[]).reduce((n, p) => n + p.screens.reduce((m, s) => m + s.hotspots.length, 0), 0);
  });

test(`${COUNT} screenshots: build, autosave under continuous editing, export, play offline`, async ({ page, context }, testInfo) => {
  test.setTimeout(180_000);
  const dir = testInfo.outputPath('shots');
  mkdirSync(dir, { recursive: true });
  const examples = readdirSync(EXAMPLE_DIR).filter((f) => f.endsWith('.png')).sort();
  const files = Array.from({ length: COUNT }, (_, i) => {
    const f = path.join(dir, `shot-${i + 1}.png`);
    copyFileSync(path.join(EXAMPLE_DIR, examples[i % examples.length]), f);
    return f;
  });

  await page.goto('/');
  await page.getByTestId('new-simulation').click();
  await page.getByTestId('new-title').fill('Scale test');
  await page.getByTestId('create-simulation').click();
  await page.getByTestId('upload-input').first().setInputFiles(files);
  await expect(page.getByTestId('screen-item')).toHaveCount(COUNT, { timeout: 60_000 });
  // Numeric file-name ordering: shot-2 comes before shot-10.
  await expect(page.getByTestId('screen-item').nth(1)).toContainText('shot 2');
  await expect(page.getByTestId('screen-item').nth(COUNT - 1)).toContainText(`shot ${COUNT}`);

  // Draw one hotspot per screen without pausing; autosave must still keep up.
  for (let i = 0; i < COUNT; i++) {
    await page.getByTestId('screen-item').nth(i).click();
    const box = (await page.getByTestId('hotspot-layer').boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 60, { steps: 3 });
    await page.mouse.up();
    if (i === 30) expect(await savedHotspotCount(page)).toBeGreaterThan(0);
  }
  await expect(page.getByTestId('issues-button')).toHaveText(/Ready/);
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
  await page.reload();
  await expect(page.getByTestId('screen-item')).toHaveCount(COUNT);
  expect(await savedHotspotCount(page)).toBe(COUNT);

  await page.getByTestId('export').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-html').click()]);
  const file = testInfo.outputPath('big.html');
  await download.saveAs(file);
  console.log(`${COUNT} screens → ${(statSync(file).size / 1e6).toFixed(1)} MB standalone HTML`);

  await context.setOffline(true);
  const p = await context.newPage();
  await p.goto('file://' + file);
  await p.locator('.simp-mode[data-mode=guided]').click();
  await p.getByTestId('sim-start').click();
  for (let i = 0; i < COUNT; i++) await p.locator('.simp-hs').first().click();
  await expect(p.getByTestId('sim-summary')).toBeVisible();
  await expect(p.getByTestId('sim-summary')).toContainText(String(COUNT));
  await context.setOffline(false);
});
