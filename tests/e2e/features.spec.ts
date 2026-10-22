// Built-in mistakes, assessment mode, mode selection, redaction, replace screenshot,
// copy-to-screens, image optimization, SCORM, and backups.
import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { clickHotspot, completeExample, exampleShot, loadExample, startPlayer } from './helpers';

const imageInfo = async (page: Page, screenIndex = 0) => {
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
  return page.evaluate(async (i) => {
    const open = indexedDB.open('sim-builder');
    await new Promise((r) => (open.onsuccess = r));
    const db = open.result;
    const all = <T,>(store: string) =>
      new Promise<T[]>((r) => {
        const q = db.transaction(store).objectStore(store).getAll();
        q.onsuccess = () => r(q.result);
      });
    const projects = await all<{ updatedAt: number; screens: { imageId: string; width: number; height: number; hotspots: unknown[] }[] }>('projects');
    const p = projects.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const images = await all<{ id: string; data: ArrayBuffer; type: string }>('images');
    const s = p.screens[i];
    const img = images.find((x) => x.id === s.imageId)!;
    return { imageId: s.imageId, width: s.width, height: s.height, hotspots: s.hotspots.length, type: img.type, size: img.data.byteLength, imageIds: images.map((x) => x.id) };
  }, screenIndex);
};

test('built-in mistake: wrong patient opens silently, learner recovers', async ({ page }) => {
  await loadExample(page);
  await page.getByTestId('preview').click();
  await startPlayer(page, 'guided');
  await clickHotspot(page, 'Wrong patient (Sample)');
  await expect(page.getByTestId('sim-toast-bad')).toHaveCount(0); // no message
  await expect(page.getByTestId('sim-instruction')).toContainText('right patient');
  await expect(page.locator('.simp-hs.simp-hl')).toHaveAttribute('data-hotspot-name', 'Back to Track Board');
  await clickHotspot(page, 'Back to Track Board');
  await completeExample(page);
  await expect(page.getByTestId('sim-incorrect-count')).toHaveText('1');
  await expect(page.getByTestId('sim-screen-table')).toContainText('Wrong patient’s chart');
});

test('assessment mode: no instructions, hints or feedback; time and mistakes recorded', async ({ page }) => {
  await loadExample(page);
  await page.getByTestId('preview').click();
  await expect(page.getByTestId('sim-intro')).toBeVisible();
  await page.getByTestId('sim-learner-name').fill('Pat Learner');
  await startPlayer(page, 'assessment');
  await expect(page.getByTestId('sim-instruction')).toBeHidden();
  await expect(page.locator('.simp-hs.simp-hl')).toHaveCount(0);
  await page.getByTestId('sim-stage').click({ position: { x: 10, y: 600 } });
  await clickHotspot(page, 'Wrong patient (Mock)');
  await expect(page.locator('.simp-toast')).toHaveCount(0);
  await expect(page.locator('.simp-ripple')).toHaveCount(0);
  await completeExample(page);
  await expect(page.locator('.simp-toast')).toHaveCount(0);
  await expect(page.getByTestId('sim-incorrect-count')).toHaveText('2');
  await expect(page.getByTestId('sim-summary')).toContainText('Pat Learner');
  await expect(page.getByTestId('sim-screen-table').locator('tr')).toHaveCount(9); // header + 8 visited screens
  await expect(page.getByTestId('sim-print')).toBeVisible();
});

test('author can limit the modes offered to learners', async ({ page }) => {
  await loadExample(page);
  await page.getByRole('button', { name: 'Details' }).click();
  for (const m of ['demo', 'guided', 'independent']) await page.getByTestId(`mode-${m}`).uncheck();
  await expect(page.getByTestId('mode-assessment')).toBeDisabled(); // can't remove the last one
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByTestId('preview').click();
  await expect(page.locator('.simp-mode')).toHaveCount(1);
  await page.getByTestId('sim-start').click();
  await expect(page.getByTestId('sim-mode')).toHaveText('Assessment');
});

test('redaction permanently paints over the screenshot and deletes the original', async ({ page }) => {
  await loadExample(page);
  const before = await imageInfo(page);
  await page.getByTestId('redact-mode').click();
  const box = (await page.getByTestId('hotspot-layer').boundingBox())!;
  // Cover the patient-name column of the track board.
  await page.mouse.move(box.x + box.width * 0.16, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.33, box.y + box.height * 0.5, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId('redaction')).toHaveCount(1);
  await page.getByTestId('apply-redaction').click();
  await page.getByTestId('confirm-redaction').click();
  await expect(page.getByRole('status')).toContainText('original screenshot was permanently deleted');
  const after = await imageInfo(page);
  expect(after.imageId).not.toBe(before.imageId);
  expect(after.imageIds).not.toContain(before.imageId);
  expect(after.hotspots).toBe(before.hotspots);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  // The redacted pixels are black.
  const px = await page.evaluate(async (id) => {
    const open = indexedDB.open('sim-builder');
    await new Promise((r) => (open.onsuccess = r));
    const q = open.result.transaction('images').objectStore('images').get(id);
    await new Promise((r) => (q.onsuccess = r));
    const bmp = await createImageBitmap(new Blob([q.result.data], { type: q.result.type }));
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    return [...ctx.getImageData(Math.round(bmp.width * 0.25), Math.round(bmp.height * 0.3), 1, 1).data];
  }, after.imageId);
  expect(px[0] + px[1] + px[2]).toBeLessThan(80);
});

test('replace screenshot keeps hotspots; copy an area to other screens', async ({ page }) => {
  await loadExample(page);
  await page.getByTestId('screen-item').nth(1).click();
  const before = await imageInfo(page, 1);
  await page.getByTestId('replace-input').setInputFiles(exampleShot('03-workup.png'));
  await expect(page.getByRole('status')).toContainText('Clickable areas and connections were kept');
  const after = await imageInfo(page, 1);
  expect(after.imageId).not.toBe(before.imageId);
  expect(after.hotspots).toBe(before.hotspots);

  await page.locator('[data-testid=hotspot][data-name="Workup tab"]').click();
  await page.getByTestId('copy-to-screens').click();
  await page.getByText('Select all').click();
  await page.getByTestId('confirm-copy').click();
  await page.getByTestId('screen-item').nth(5).click();
  await expect(page.locator('[data-testid=hotspot][data-name="Workup tab"]')).toHaveCount(1);
});

test('large screenshots are downscaled and compressed on upload', async ({ page, browserName }) => {
  await page.goto('/');
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 2880;
    c.height = 1800;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#123';
    ctx.font = '28px sans-serif';
    for (let y = 40; y < 1800; y += 40) ctx.fillText('Synthetic row of EHR text '.repeat(6) + y, 20, y);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('new-simulation').click();
  await page.getByTestId('new-title').fill('Optimize');
  await page.getByTestId('create-simulation').click();
  const buffer = Buffer.from(png, 'base64');
  await page.getByTestId('upload-input').first().setInputFiles({ name: 'retina.png', mimeType: 'image/png', buffer });
  await expect(page.getByTestId('screen-item')).toHaveCount(1);
  const info = await imageInfo(page);
  expect(info.size).toBeLessThanOrEqual(buffer.length); // never bigger than the original
  // Safari's encoders can't beat the original on this text-heavy image, so it keeps the original.
  if (browserName === 'webkit') return;
  expect(info.width).toBe(1920);
  expect(info.height).toBe(1200);
  expect(['image/webp', 'image/jpeg', 'image/png']).toContain(info.type); // smallest format wins; Safari can't encode WebP
  expect(info.size).toBeLessThan(buffer.length * 0.75);
});

test('SCORM package reports completion and score to the LMS', async ({ page, context }, testInfo) => {
  await loadExample(page);
  await page.getByTestId('export').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-scorm').click()]);
  const zip = testInfo.outputPath('scorm.zip');
  await download.saveAs(zip);
  const dir = testInfo.outputPath('scorm');
  execFileSync('unzip', ['-q', '-o', zip, '-d', dir]);
  const manifest = readFileSync(path.join(dir, 'imsmanifest.xml'), 'utf8');
  expect(manifest).toContain('<schemaversion>1.2</schemaversion>');
  expect(manifest).toContain('href="index.html"');

  const p = await context.newPage();
  await p.addInitScript(() => {
    const calls: [string, ...string[]][] = [];
    const store: Record<string, string> = { 'cmi.core.student_name': 'Learner, Pat', 'cmi.core.lesson_status': 'not attempted' };
    (window as any).__scorm = { calls, store };
    (window as any).API = {
      LMSInitialize: () => (calls.push(['init']), 'true'),
      LMSGetValue: (k: string) => store[k] ?? '',
      LMSSetValue: (k: string, v: string) => (calls.push(['set', k, v]), (store[k] = v), 'true'),
      LMSCommit: () => 'true',
      LMSFinish: () => (calls.push(['finish']), 'true'),
      LMSGetLastError: () => '0',
    };
  });
  await p.goto('file://' + path.join(dir, 'index.html'));
  await expect(p.getByTestId('sim-learner-name')).toHaveValue('Pat Learner');
  expect(await p.evaluate(() => (window as any).__scorm.store['cmi.core.lesson_status'])).toBe('incomplete');
  await startPlayer(p, 'guided');
  await completeExample(p);
  const store = await p.evaluate(() => (window as any).__scorm.store);
  expect(store['cmi.core.lesson_status']).toBe('completed');
  expect(store['cmi.core.score.raw']).toBe('100');
});

test('backup reminder, back up all, and restore from the backup ZIP', async ({ page }, testInfo) => {
  await loadExample(page);
  await page.goto('/');
  await expect(page.getByTestId('backup-banner')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-all').click()]);
  const file = testInfo.outputPath('backup.zip');
  await download.saveAs(file);
  await expect(page.getByTestId('backup-banner')).toHaveCount(0);

  await page.getByTestId('project-card').getByRole('button', { name: 'Delete' }).click();
  await page.getByTestId('confirm-delete').click();
  await expect(page.getByTestId('project-card')).toHaveCount(0);
  await page.getByTestId('import-input').setInputFiles(file);
  await expect(page.getByTestId('project-card')).toHaveCount(1);
  await page.getByTestId('project-card').getByRole('button', { name: 'Preview' }).click();
  await startPlayer(page, 'guided');
  await completeExample(page);
});
