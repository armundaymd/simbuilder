// Captures screenshots of the builder for the in-app Help guide (public/help).
// Requires the dev server: npm run dev, then npm run help-images
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'help');
const URL = process.env.APP_URL ?? 'http://localhost:5173/';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 1 });
const shot = (name, opts = {}) => p.screenshot({ path: path.join(OUT, name), ...opts });

await p.goto(URL);
await p.addStyleTag({ content: '[data-testid=getting-started]{display:none!important}' });
await p.getByTestId('load-example').click();
await p.waitForURL(/edit/);
await p.addStyleTag({ content: '[data-testid=getting-started]{display:none!important}' });
await p.waitForTimeout(600);
await shot('editor.png');

await p.getByTestId('screen-item').nth(4).click();
await p.locator('[data-testid=hotspot][data-name="Priority"]').click();
await p.waitForTimeout(300);
await shot('area-settings.png', { clip: { x: 1120, y: 50, width: 320, height: 810 } });

await p.getByTestId('screen-item').nth(0).click();
await p.locator('[data-testid=hotspot][data-name="Wrong patient (Sample)"]').click();
await p.getByTestId('inspector').evaluate((e) => (e.scrollTop = 520));
await p.waitForTimeout(300);
await shot('mistake.png', { clip: { x: 1120, y: 50, width: 320, height: 810 } });
await p.keyboard.press('Escape');

await p.getByTestId('redact-mode').click();
const box = await p.getByTestId('hotspot-layer').boundingBox();
await p.mouse.move(box.x + box.width * 0.11, box.y + box.height * 0.19);
await p.mouse.down();
await p.mouse.move(box.x + box.width * 0.33, box.y + box.height * 0.42, { steps: 4 });
await p.mouse.up();
await p.waitForTimeout(200);
await shot('redact.png', { clip: { x: 240, y: 50, width: 880, height: 560 } });
await p.getByRole('button', { name: 'Cancel' }).click();

await p.getByTestId('view-flow').click();
await p.waitForTimeout(300);
await shot('workflow-list.png', { clip: { x: 0, y: 50, width: 1440, height: 560 } });
await p.getByRole('button', { name: 'Diagram' }).click();
await p.waitForTimeout(300);
await shot('workflow-diagram.png', { clip: { x: 0, y: 50, width: 1440, height: 420 } });

await p.getByTestId('export').click();
await p.waitForTimeout(300);
await shot('export.png', { clip: { x: 360, y: 40, width: 720, height: 780 } });
await p.keyboard.press('Escape');

await p.getByTestId('preview').click();
await p.waitForTimeout(500);
await shot('modes.png');
await b.close();
console.log('Help images written to', OUT);
