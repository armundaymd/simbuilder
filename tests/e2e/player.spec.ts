// Training modes, incorrect-click handling, interactive elements and hotspot alignment.
import { expect, test } from '@playwright/test';
import { clickHotspot, completeExample, loadExample, startPlayer } from './helpers';

test.beforeEach(async ({ page }) => {
  await loadExample(page);
  await page.getByTestId('preview').click();
});

test('guided practice: full EHR workflow with search, dropdown and text entry', async ({ page }) => {
  await startPlayer(page, 'guided');
  await expect(page.getByTestId('sim-mode')).toHaveText('Guided practice');
  // The expected hotspot is highlighted.
  await expect(page.locator('.simp-hs.simp-hl')).toHaveAttribute('data-hotspot-name', 'Alex Testpatient row');
  await completeExample(page);
  await expect(page.getByTestId('sim-incorrect-count')).toHaveText('0');
});

test('guided practice: incorrect clicks show feedback and are counted', async ({ page }) => {
  await startPlayer(page, 'guided');
  await clickHotspot(page, 'Wrong patient (Mock)');
  await expect(page.getByTestId('sim-toast-bad')).toContainText('different patient');
  // Clicking empty space is also incorrect.
  await page.getByTestId('sim-stage').click({ position: { x: 10, y: 500 } });
  await expect(page.getByTestId('sim-toast-bad')).toContainText('isn’t part of this step');
  await clickHotspot(page, 'Alex Testpatient row');
  await clickHotspot(page, 'Results tab');
  await expect(page.getByTestId('sim-toast-bad')).toContainText('Results shows completed tests');
  // Doing a later step first is rejected (Sign Order before Priority).
  await clickHotspot(page, 'Workup tab');
  await clickHotspot(page, 'New Order button');
  const search = page.locator('.simp-hs[data-hotspot-name="Order search"] input');
  await search.fill('xyz');
  await expect(page.getByTestId('sim-menu')).toContainText('No results');
  await search.fill('CBC');
  await page.getByTestId('sim-menu').getByRole('button', { name: /CBC without/ }).click();
  await expect(page.getByTestId('sim-toast-bad')).toContainText('isn’t the right result');
  await page.getByTestId('sim-menu').getByRole('button', { name: /CBC with Differential/ }).click();
  await clickHotspot(page, 'Sign Order');
  await expect(page.getByTestId('sim-toast-bad')).toContainText('another step to do first');
  await clickHotspot(page, 'Priority');
  await page.getByTestId('sim-menu').getByRole('button', { name: 'Routine' }).click();
  await expect(page.getByTestId('sim-toast-bad')).toContainText('isn’t the right choice');
  await clickHotspot(page, 'Priority');
  await page.getByTestId('sim-menu').getByRole('button', { name: 'STAT' }).click();
  await expect(page.locator('.simp-hs[data-hotspot-name="Priority"]')).toContainText('STAT');
  await expect(page.locator('.simp-hs.simp-hl')).toHaveAttribute('data-hotspot-name', 'Sign Order');
});

test('independent practice: no highlights, mistakes tracked, summary at end', async ({ page }) => {
  await startPlayer(page, 'independent');
  await expect(page.locator('.simp-hs.simp-hl')).toHaveCount(0);
  await clickHotspot(page, 'Wrong patient (Mock)');
  await page.getByTestId('sim-stage').click({ position: { x: 20, y: 600 } });
  await clickHotspot(page, 'Alex Testpatient row');
  await clickHotspot(page, 'Workup tab');
  await clickHotspot(page, 'New Order button');
  const search = page.locator('.simp-hs[data-hotspot-name="Order search"] input');
  await search.fill('cbc');
  await page.getByTestId('sim-menu').getByRole('button', { name: /CBC with Differential/ }).click();
  await clickHotspot(page, 'Priority');
  await page.getByTestId('sim-menu').getByRole('button', { name: 'STAT' }).click();
  await clickHotspot(page, 'Sign Order');
  await clickHotspot(page, 'Disposition tab');
  const impression = page.locator('.simp-hs[data-hotspot-name="Clinical impression"] input');
  await impression.fill('broken arm');
  await impression.press('Enter');
  await impression.fill('Chest   Pain');
  await impression.press('Enter');
  await clickHotspot(page, 'Disposition');
  await page.getByTestId('sim-menu').getByRole('button', { name: 'Discharge' }).click();
  await clickHotspot(page, 'Accept Disposition');
  await clickHotspot(page, 'Confirm');
  await expect(page.getByTestId('sim-summary')).toBeVisible();
  await expect(page.getByTestId('sim-incorrect-count')).toHaveText('3');
  await expect(page.getByTestId('sim-summary')).toContainText('Track Board');
  await expect(page.getByTestId('sim-summary')).toContainText('Disposition');
});

test('demonstration mode: Next walks through the entire workflow', async ({ page }) => {
  await startPlayer(page, 'demo');
  for (let i = 0; i < 20 && (await page.getByTestId('sim-summary').count()) === 0; i++) {
    await page.getByTestId('sim-next').click();
    await page.waitForTimeout(700);
  }
  await expect(page.getByTestId('sim-summary')).toBeVisible();
  await expect(page.getByTestId('sim-incorrect-count')).toHaveText('0');
});

for (const vp of [
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 800, height: 1100 },
]) {
  test(`hotspots stay aligned at ${vp.width}×${vp.height}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await startPlayer(page, 'guided');
    const stage = (await page.getByTestId('sim-stage').boundingBox())!;
    // Aspect ratio of the screenshot (1440×900) is preserved.
    expect(stage.width / stage.height).toBeCloseTo(1440 / 900, 2);
    const img = (await page.locator('.simp-stage img').boundingBox())!;
    expect(img.width).toBeCloseTo(stage.width, 0);
    // Every hotspot's box matches its stored percentages of the rendered image.
    const hs = page.locator('.simp-hs');
    const style = await hs.evaluateAll((els) => els.map((e) => (e as HTMLElement).style.cssText));
    for (let i = 0; i < style.length; i++) {
      const [x, y, w, h] = ['left', 'top', 'width', 'height'].map((k) => parseFloat(style[i].match(new RegExp(`(?:^|;)\\s*${k}:\\s*([\\d.]+)%`))![1]));
      const b = (await hs.nth(i).boundingBox())!;
      expect(Math.abs(b.x - (img.x + (x / 100) * img.width))).toBeLessThan(1);
      expect(Math.abs(b.y - (img.y + (y / 100) * img.height))).toBeLessThan(1);
      expect(Math.abs(b.width - (w / 100) * img.width)).toBeLessThan(1);
      expect(Math.abs(b.height - (h / 100) * img.height)).toBeLessThan(1);
    }
    // Clicking the centre of the patient row as drawn in the screenshot (y = 20.05%–25.05%) navigates.
    await page.mouse.click(img.x + img.width * 0.5, img.y + img.height * 0.2255);
    await expect(page.getByTestId('sim-instruction')).toContainText('Workup');
  });
}
