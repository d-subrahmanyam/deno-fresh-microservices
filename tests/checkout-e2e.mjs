/**
 * End-to-end checkout flow test using Playwright.
 * Run: node tests/checkout-e2e.mjs
 */

import { chromium } from 'playwright';

const BASE = 'http://localhost:8000';
const KIBANA = 'http://localhost:5601';
const ES = 'http://localhost:9200';

const USER_EMAIL = 'john@example.com';
const USER_PASSWORD = 'password123';
const TEST_CARD = '4242424242424242'; // success card

let browser, page;
const results = [];

function pass(step, detail = '') { console.log(`✅ [${step}] ${detail}`); results.push({ step, ok: true }); }
function fail(step, detail = '') { console.log(`❌ [${step}] ${detail}`); results.push({ step, ok: false, detail }); }
function info(msg) { console.log(`   ${msg}`); }

async function shot(name) {
  await page.screenshot({ path: `tests/screenshots/${name}.png`, fullPage: true });
}

async function run() {
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await ctx.newPage();

  // ── 1. Homepage ──────────────────────────────────────────────────────────────
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const title = await page.title();
  info(`Page title: "${title}"`);
  title.includes('ShopHub') ? pass('homepage', title) : fail('homepage', title);
  await shot('01-homepage');

  // ── 2. Login ─────────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill(USER_EMAIL);
  await page.locator('input[name="password"]').fill(USER_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(u => !u.includes('/login'), { timeout: 8000 }).catch(() => {});
  const afterLogin = page.url();
  if (!afterLogin.includes('/login')) {
    pass('login', `redirected to ${afterLogin}`);
  } else {
    const err = await page.locator('.text-red-700').textContent().catch(() => '');
    fail('login', `still on login — error: "${err.trim()}"`);
  }
  await shot('02-post-login');

  // ── 3. Products page ─────────────────────────────────────────────────────────
  await page.goto(`${BASE}/products`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  // Product cards are rendered as <article> or contain product names
  const productCount = await page.locator('article, [class*="product-card"], h2, h3').count();
  info(`Product elements found: ${productCount}`);
  productCount > 0 ? pass('products-page', `${productCount} elements`) : fail('products-page', 'no products rendered');
  await shot('03-products');

  // ── 4. Add to cart (first product) ───────────────────────────────────────────
  const addBtn = page.getByRole('button', { name: /add to cart/i }).first();
  if (await addBtn.count() > 0) {
    await addBtn.click();
    await page.waitForTimeout(1500);
    const feedback = await page.getByText(/added to cart/i).count();
    pass('add-to-cart', feedback > 0 ? '"Added to cart." shown' : 'button clicked');
  } else {
    fail('add-to-cart', 'no "Add to Cart" button found');
  }
  await shot('04-add-to-cart');

  // ── 5. Checkout page ─────────────────────────────────────────────────────────
  await page.goto(`${BASE}/checkout`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  const hasForm = await page.locator('form[method="POST"]').count();
  const emptyCart = await page.getByText(/your cart is empty/i).count();
  if (emptyCart > 0) {
    fail('checkout-page', 'cart is empty — add products first');
  } else if (hasForm > 0) {
    pass('checkout-page', 'checkout form present');
  } else {
    fail('checkout-page', `unexpected state at ${page.url()}`);
  }
  await shot('05-checkout');

  // ── 6. Fill shipping ─────────────────────────────────────────────────────────
  if (await page.locator('form[method="POST"]').count() > 0) {
    await page.locator('input[name="fullName"]').fill('John Doe');
    await page.locator('input[name="email"]').fill(USER_EMAIL);
    await page.locator('input[name="street"]').fill('123 Market Street');
    await page.locator('input[name="city"]').fill('San Francisco');
    await page.locator('input[name="state"]').fill('CA');
    await page.locator('input[name="postalCode"]').fill('94105');
    pass('fill-shipping', 'all shipping fields filled');

    // ── 7. Fill payment ───────────────────────────────────────────────────────
    await page.locator('input[name="cardHolder"]').fill('John Doe');
    await page.locator('input[name="cardNumber"]').fill(TEST_CARD);
    await page.locator('input[name="cardExpiry"]').fill('12/28');
    await page.locator('input[name="cardCvv"]').fill('123');
    pass('fill-payment', `card ${TEST_CARD} (success)`);
    await shot('06-checkout-filled');

    // ── 8. Submit ─────────────────────────────────────────────────────────────
    info('Submitting checkout form...');
    await Promise.all([
      page.waitForNavigation({ timeout: 20000 }),
      page.locator('button[type="submit"]').click(),
    ]).catch(async (err) => {
      fail('checkout-submit', err.message);
      await shot('06b-error');
    });

    const finalUrl = page.url();
    info(`Final URL: ${finalUrl}`);
    if (finalUrl.includes('/order-confirmation')) {
      pass('checkout-submit', `order confirmed → ${finalUrl}`);
      const orderId = finalUrl.split('/').pop();
      info(`Order ID: ${orderId}`);
    } else {
      const errMsg = await page.locator('.text-red-700, .text-red-600').first().textContent().catch(() => '');
      fail('checkout-submit', `stayed at ${finalUrl} — "${errMsg.trim()}"`);
    }
    await shot('07-confirmation');
  }

  // ── 9. Kibana: verify logs flowing ───────────────────────────────────────────
  info('\nChecking Kibana / Elasticsearch for logs...');
  try {
    const esResp = await fetch(`${ES}/shophub-*/_count`);
    if (esResp.ok) {
      const { count } = await esResp.json();
      count > 0 ? pass('kibana-log-count', `${count} documents in shophub-* index`)
                : fail('kibana-log-count', 'index empty — Filebeat may not have shipped yet');
    } else {
      fail('kibana-log-count', `ES returned ${esResp.status}`);
    }
  } catch (e) {
    fail('kibana-log-count', `ES unreachable: ${e.message}`);
  }

  // Check for domain events specifically
  try {
    const evResp = await fetch(`${ES}/shophub-*/_search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: { terms: { 'event.keyword': ['order_created', 'payment_charged', 'payment_declined'] } },
        size: 5,
        sort: [{ '@timestamp': { order: 'desc' } }],
      }),
    });
    if (evResp.ok) {
      const body = await evResp.json();
      const hits = body.hits?.total?.value ?? body.hits?.hits?.length ?? 0;
      const events = body.hits?.hits?.map(h => h._source?.event).join(', ') || '';
      hits > 0 ? pass('kibana-domain-events', `${hits} domain events: ${events}`)
               : info('No domain events indexed yet (logs take ~30s to flow)');
    }
  } catch (e) {
    info(`Domain event query skipped: ${e.message}`);
  }

  // Open Kibana in browser and screenshot
  const kibanaPage = await ctx.newPage();
  try {
    await kibanaPage.goto(`${KIBANA}/app/discover`, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await kibanaPage.waitForTimeout(3000);
    pass('kibana-ui', `Kibana accessible at ${KIBANA}`);
    await kibanaPage.screenshot({ path: 'tests/screenshots/08-kibana-discover.png', fullPage: true });
  } catch (e) {
    fail('kibana-ui', e.message);
  } finally {
    await kibanaPage.close();
  }

  // ── Summary ───────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════');
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailed steps:');
    results.filter(r => !r.ok).forEach(r => console.log(`  ❌ ${r.step}: ${r.detail}`));
  }
  console.log(`\nScreenshots saved to tests/screenshots/`);
  console.log('══════════════════════════════════════════');

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(async err => {
  console.error('\nTest runner crashed:', err.message);
  if (page) await page.screenshot({ path: 'tests/screenshots/crash.png' }).catch(() => {});
  if (browser) await browser.close().catch(() => {});
  process.exit(1);
});
