import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname.replace(/^\/(.:)/, '$1');
const target = process.env.HY_LIVE_URL || 'https://hukkle-hub.github.io/hukkle/';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
const context = await browser.newContext({
  viewport: { width: 1279, height: 599 },
  userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36',
  serviceWorkers: 'block',
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('response', (response) => {
  if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`);
});

await page.goto(`${target}?liveqa=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(3000);
const before = await page.evaluate(() => ({
  title: document.title,
  version: document.querySelector('meta[name="hy-version"]')?.content || null,
  readyState: document.readyState,
  startVisible: !!document.querySelector('#titleStart') && getComputedStyle(document.querySelector('#titleStart')).display !== 'none',
  active: document.querySelector('.screen.active')?.dataset.screen || null,
  bodyText: document.body.innerText.slice(0, 300),
}));
let clicked = false;
if (await page.locator('#titleStart').isVisible()) {
  await page.locator('#titleStart').click();
  clicked = true;
  await page.waitForTimeout(2500);
}
const after = await page.evaluate(() => ({
  active: document.querySelector('.screen.active')?.dataset.screen || null,
  route: location.hash,
  loadingHidden: document.querySelector('#startupRecovery')?.classList.contains('hidden') ?? null,
  bodyText: document.body.innerText.slice(0, 300),
}));
await mkdir(join(root, 'qa-live'), { recursive: true });
await page.screenshot({ path: join(root, 'qa-live', 'live-startup.png'), fullPage: false });
const report = { target, before, clicked, after, errors };
await writeFile(join(root, 'qa-live', 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (!clicked || after.active !== 'home' || errors.length) process.exit(1);
