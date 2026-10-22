import { expect, type Page } from '@playwright/test';
import path from 'node:path';

export const EXAMPLE_DIR = path.resolve('public', 'example');
export const exampleShot = (file: string) => path.join(EXAMPLE_DIR, file);

export async function loadExample(page: Page) {
  await page.goto('/');
  await page.getByTestId('load-example').click();
  await page.waitForURL(/#\/edit\//);
  await expect(page.getByTestId('screen-item')).toHaveCount(9);
}

/** Draw a hotspot on the editor stage using percentages of the screenshot. */
export async function drawHotspot(page: Page, x: number, y: number, w: number, h: number) {
  const box = (await page.getByTestId('hotspot-layer').boundingBox())!;
  const px = (v: number, total: number) => (v / 100) * total;
  await page.mouse.move(box.x + px(x, box.width), box.y + px(y, box.height));
  await page.mouse.down();
  await page.mouse.move(box.x + px(x + w / 2, box.width), box.y + px(y + h / 2, box.height), { steps: 4 });
  await page.mouse.move(box.x + px(x + w, box.width), box.y + px(y + h, box.height), { steps: 4 });
  await page.mouse.up();
}

/** Click a hotspot in the player by its name. */
export async function clickHotspot(page: Page, name: string) {
  await page.locator(`.simp-hs[data-hotspot-name="${name}"]`).click();
}

export async function startPlayer(page: Page, mode: 'demo' | 'guided' | 'independent' | 'assessment') {
  await expect(page.getByTestId('sim-intro')).toBeVisible();
  await page.locator(`.simp-mode[data-mode="${mode}"]`).click();
  await page.getByTestId('sim-start').click();
  await expect(page.getByTestId('sim-intro')).toHaveCount(0);
}

/** Complete the bundled EHR example correctly (guided or independent mode). */
export async function completeExample(page: Page) {
  const stage = page.getByTestId('sim-stage');
  await clickHotspot(page, 'Alex Testpatient row');
  await clickHotspot(page, 'Workup tab');
  await clickHotspot(page, 'New Order button');
  const search = page.locator('.simp-hs[data-hotspot-name="Order search"] input');
  await search.click();
  await search.fill('cbc');
  await page.getByTestId('sim-menu').getByRole('button', { name: /CBC with Differential/ }).click();
  await clickHotspot(page, 'Priority');
  await page.getByTestId('sim-menu').getByRole('button', { name: 'STAT' }).click();
  await clickHotspot(page, 'Sign Order');
  await clickHotspot(page, 'Disposition tab');
  const impression = page.locator('.simp-hs[data-hotspot-name="Clinical impression"] input');
  await impression.click();
  await impression.fill('chest pain');
  await impression.press('Enter');
  await clickHotspot(page, 'Disposition');
  await page.getByTestId('sim-menu').getByRole('button', { name: 'Discharge' }).click();
  await clickHotspot(page, 'Accept Disposition');
  await clickHotspot(page, 'Confirm');
  await expect(page.getByTestId('sim-summary')).toBeVisible();
  return stage;
}
