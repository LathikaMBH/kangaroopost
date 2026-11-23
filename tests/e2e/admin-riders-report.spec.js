// KAN-46: admin riders directory in the app. All API calls are mocked, so no DB or real accounts are used.
const { test, expect } = require('@playwright/test');

const RAUMA = { id: 1, name: 'Rauma', region: 'Satakunta' };
const PORI = { id: 2, name: 'Pori', region: 'Satakunta' };
const RIDERS = [
  { id: 10, name: 'Aino Rider', role: 'rider', created_at: '2026-09-01T10:00:00Z', owner_id: 2, owner_name: 'Leena Owner',
    route_count: 3, cities: [RAUMA, PORI], last_run_at: '2026-11-17T17:05:00Z', last_run_year: 2026, last_run_week: 47 },
  { id: 11, name: 'Ville Rider', role: 'rider', created_at: '2026-10-05T10:00:00Z', owner_id: 3, owner_name: 'Kalle Owner',
    route_count: 0, cities: [], last_run_at: null, last_run_year: null, last_run_week: null },
  { id: 3, name: 'Kalle Owner', role: 'route_owner', created_at: '2026-08-20T10:00:00Z', owner_id: 3, owner_name: 'Kalle Owner',
    route_count: 4, cities: [PORI], last_run_at: '2026-11-18T16:00:00Z', last_run_year: 2026, last_run_week: 47 },
];

async function open(page, { role = 'admin', path = '/admin/reports/riders', viewport } = {}) {
  if (viewport) await page.setViewportSize(viewport);
  await page.addInitScript((r) => {
    localStorage.setItem('kp_token', 'test-token');
    localStorage.setItem('kp_user', JSON.stringify({ id: 1, name: 'Test User', role: r }));
  }, role);
  await page.route('**/api/**', (r) => {
    if (r.request().url().endsWith('/api/admin/reports/riders')) return r.fulfill({ json: RIDERS });
    return r.fulfill({ json: [] });
  });
  await page.goto(path);
}

const rows = (page) => page.getByTestId('rider-row');

test('AC1 lists every rider with owner, cities, routes, last week ran and created date', async ({ page }) => {
  await open(page);
  await expect(rows(page)).toHaveCount(3);
  await expect(page.getByText('3 riders')).toBeVisible();
  const aino = rows(page).filter({ hasText: 'Aino Rider' });
  await expect(aino).toContainText('Leena Owner');
  await expect(aino).toContainText('Rauma, Pori');
  await expect(aino).toContainText('Week 47, 2026');
  await expect(aino).toContainText('17 Nov 2026');
  await expect(aino).toContainText('1 Sept 2026');
});

test('AC2 a rider who never ran shows "Never" and no cities', async ({ page }) => {
  await open(page);
  const ville = rows(page).filter({ hasText: 'Ville Rider' });
  await expect(ville).toContainText('Never');
  await expect(ville).toContainText('—');
});

test('AC3 a route owner with the Rider role is listed and marked', async ({ page }) => {
  await open(page);
  const marked = rows(page).filter({ has: page.locator('.badge') });
  await expect(marked).toHaveCount(1);
  await expect(marked).toContainText('Kalle Owner');
  await expect(marked.locator('.badge')).toHaveText('Route owner');
});

test('AC4 filter by route owner and by city', async ({ page }) => {
  await open(page);
  await page.getByLabel('Route owner').selectOption({ label: 'Kalle Owner' });
  await expect(rows(page)).toHaveCount(2);
  await page.getByLabel('City').selectOption({ label: 'Pori (Satakunta)' });
  await expect(rows(page)).toHaveCount(1);
  await page.getByLabel('Route owner').selectOption({ label: 'All route owners' });
  await expect(rows(page)).toHaveCount(2); // Aino (Rauma + Pori) and Kalle (Pori)
  await page.getByLabel('City').selectOption({ label: 'Rauma (Satakunta)' });
  await expect(rows(page)).toHaveCount(1);
  await page.getByLabel('Route owner').selectOption({ label: 'Kalle Owner' });
  await expect(page.getByText('No riders match these filters')).toBeVisible();
});

test('AC5 no email addresses or phone numbers are shown', async ({ page }) => {
  await open(page);
  await expect(rows(page)).toHaveCount(3);
  const text = await page.locator('.screen').innerText();
  expect(text).not.toMatch(/@/);
  expect(text).not.toMatch(/\+358/);
});

test('AC6 admin reaches the report from the Reports tab', async ({ page }) => {
  await open(page, { path: '/admin' });
  await page.locator('.bottom-nav').getByRole('button', { name: 'Reports' }).click();
  await expect(page).toHaveURL(/\/admin\/reports$/);
  await page.getByRole('button', { name: /Riders directory/ }).click();
  await expect(page).toHaveURL(/\/admin\/reports\/riders$/);
  await expect(rows(page)).toHaveCount(3);
});

test('AC7 on a phone the table scrolls inside its box, not the page', async ({ page }) => {
  await open(page);
  await expect(rows(page)).toHaveCount(3);
  const pageOverflows = await page.evaluate(() => document.querySelector('.screen').scrollWidth > document.querySelector('.screen').clientWidth);
  expect(pageOverflows).toBe(false);
});

test('AC8 a route owner cannot open the report', async ({ page }) => {
  await open(page, { role: 'route_owner' });
  await expect(page).toHaveURL(/\/owner$/);
});

test.describe('desktop', () => {
  test.use({ isMobile: false, hasTouch: false });
  test('AC9 Reports is in the admin sidebar', async ({ page }) => {
    await open(page, { path: '/admin', viewport: { width: 1280, height: 800 } });
    await page.getByRole('complementary', { name: 'Admin menu' }).getByRole('button', { name: 'Reports' }).click();
    await expect(page).toHaveURL(/\/admin\/reports$/);
  });
});
