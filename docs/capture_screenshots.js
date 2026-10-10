// Captures the README screenshots from the running app with a real browser.
//
// Usage (Playwright is not a project dependency, install it ad hoc):
//   npm run seed
//   SESSION_SECRET=dev PORT=3000 npm start &
//   npx -y -p playwright node docs/capture_screenshots.js
//
// Uses the locally installed Chrome (channel: 'chrome'); set
// PLAYWRIGHT_CHANNEL= (empty) to use Playwright's bundled Chromium instead.
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const OUT = path.join(__dirname, 'screenshots');
const channel = process.env.PLAYWRIGHT_CHANNEL ?? 'chrome';

async function login(page, email) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.fill('#login-email', email);
  await page.fill('#login-password', 'Password123');
  await page.click('#login-form button[type=submit]');
  await page.waitForSelector('.sidebar, nav', { timeout: 10000 });
  await page.waitForTimeout(1500);
  // Hide the welcome toast so it does not cover the header.
  await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
}

async function open(page, pageId) {
  await page.evaluate(`App.navigate(${JSON.stringify(pageId)})`);
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
}

(async () => {
  const browser = await chromium.launch(channel ? { channel } : {});
  const context = await browser.newContext({ viewport: { width: 1360, height: 820 } });
  const page = await context.newPage();

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(OUT, 'login.png') });

  await login(page, 'john.doe@email.com');
  await page.screenshot({ path: path.join(OUT, 'patient-dashboard.png') });
  await open(page, 'appointments');
  await page.screenshot({ path: path.join(OUT, 'appointments.png') });
  await open(page, 'prescriptions');
  await page.screenshot({ path: path.join(OUT, 'prescriptions.png') });
  await open(page, 'messages');
  await page.screenshot({ path: path.join(OUT, 'messages.png') });

  await context.clearCookies();
  await login(page, 'dr.chen@healthbridge.com');
  await page.screenshot({ path: path.join(OUT, 'doctor-dashboard.png') });

  await context.clearCookies();
  await login(page, 'admin@healthbridge.com');
  await open(page, 'admin');
  await page.screenshot({ path: path.join(OUT, 'admin-users.png') });

  await browser.close();
  console.log(`Saved screenshots to ${OUT}`);
})();
