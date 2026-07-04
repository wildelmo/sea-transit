// Headless smoke test: boots the app, waits for the engine + 3D layer,
// verifies trains exist, and saves a screenshot to ./smoke.png.
//
//   node scripts/smoke.mjs
//
// Set CHROMIUM_PATH if Playwright's managed browsers aren't installed
// (e.g. CHROMIUM_PATH=/opt/pw-browsers/chromium in sandboxed CI).

import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ root: new URL('..', import.meta.url).pathname, server: { port: 5199 } });
await server.listen();

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));

await page.goto('http://localhost:5199/?screenshot', { waitUntil: 'load' });
await page.waitForFunction(() => window.__app?.map?.getLayer?.('trains-3d'), null, {
  timeout: 45000,
});
// pump frames (headless browsers only run rAF while producing frames)
for (let i = 0; i < 10; i++) {
  await page.screenshot({ path: 'smoke.png' });
  await new Promise((r) => setTimeout(r, 200));
}
const state = await page.evaluate(() => ({
  mode: window.__app.engine.mode,
  trains: window.__app.engine.trains.size,
  sections: window.__app.layer.cabSolid.count + window.__app.layer.midSolid.count,
}));
console.log('smoke:', JSON.stringify(state));
await browser.close();
await server.close();

if (state.trains === 0) {
  console.error('FAIL: no trains');
  process.exit(1);
}
console.log('OK — screenshot saved to smoke.png');
process.exit(0);
