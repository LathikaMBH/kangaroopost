// KAN-43: admin weekly network summary. All API calls are mocked, so no DB or real accounts are used.
const { test, expect } = require('@playwright/test');

const WEEKS = [
  { iso_year: 2026, iso_week: 48, window_start: '2026-11-24T16:00:00Z', window_end: '2026-11-26T21:00:00Z', finished: false },
  { iso_year: 2026, iso_week: 47, window_start: '2026-11-17T16:00:00Z', window_end: '2026-11-19T21:00:00Z', finished: true },
];
const OWNERS = [{ id: 2, name: 'Leena Owner' }, { id: 3, name: 'Kalle Owner' }, { id: 4, name: 'Nora Owner' }]; // Nora has no routes
const route = (o) => ({
  run_id: 1, rider_id: 5, rider_name: 'Aino Rider', started_at: '2026-11-17T17:05:00Z', finished_at: '2026-11-17T19:40:00Z',
  ended_by_name: 'Aino Rider', outside_window: false, attempt: 1, attempt_count: 1, outcome: 'completed',
  stops: 10, delivered: 10, on_time: 10, missed: 0, complaints_open: 0, complaints_resolved: 0,
  region_id: 1, region_name: 'Satakunta', ...o,
});
const ROUTES = [
  route({ route_id: 1, route_name: 'Kortela', owner_id: 2, owner_name: 'Leena Owner', city_id: 10, city_name: 'Rauma', complaints_open: 1 }),
  route({ route_id: 2, route_name: 'Unaja', owner_id: 2, owner_name: 'Leena Owner', city_id: 10, city_name: 'Rauma', outcome: 'force_ended',
          ended_by_name: 'Leena Owner', delivered: 6, on_time: 3, outside_window: true, attempt: 2, attempt_count: 2, complaints_resolved: 2 }),
  route({ route_id: 3, route_name: 'Pori 1', owner_id: 3, owner_name: 'Kalle Owner', city_id: 20, city_name: 'Pori', run_id: null, rider_name: null,
          started_at: null, finished_at: null, outcome: 'not_run', stops: 0, delivered: 0, on_time: 0 }),
  route({ route_id: 4, route_name: 'Tampere 1', owner_id: 3, owner_name: 'Kalle Owner', city_id: 30, city_name: 'Tampere', region_id: 2,
          region_name: 'Pirkanmaa', outcome: 'in_progress', finished_at: null, delivered: 5, on_time: 5 }),
];

async function open(page, { path = '/admin/reports/network', viewport } = {}) {
  const requested = [];
  if (viewport) await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    localStorage.setItem('kp_token', 'test-token');
    localStorage.setItem('kp_user', JSON.stringify({ id: 1, name: 'Admin', role: 'admin' }));
  });
  await page.route('**/api/**', (r) => {
    const url = new URL(r.request().url());
    if (url.pathname === '/api/admin/reports/network') {
      const wk = url.searchParams.get('week');
      requested.push(wk);
      const week = wk === '2026-48' ? WEEKS[0] : WEEKS[1]; // default: the latest finished week
      return r.fulfill({ json: { weeks: WEEKS, week, owners: OWNERS, routes: wk === '2026-48' ? [] : ROUTES } });
    }
    return r.fulfill({ json: [] });
  });
  await page.goto(path);
  return requested;
}

const ownerRow = (page, name) => page.getByTestId('owner-row').filter({ hasText: name });
const cells = async (row) => (await row.locator(':scope > span').allInnerTexts()).map(s => s.trim());

test('AC1 defaults to the latest finished week, one row per route owner with the counts', async ({ page }) => {
  const requested = await open(page);
  await expect.poll(() => requested.length).toBeGreaterThan(0);
  expect(requested[0]).toBeNull(); // no week asked for: the server picks the latest finished one
  await expect(page.getByLabel('Week')).toHaveValue('2026-47');
  await expect(page.getByTestId('owner-row')).toHaveCount(3);
  // Route owner, Cities, Routes, Completed, Force-ended, In progress, Not run, Outside window, Restarted, Delivered, On time, Missed,
  // Open complaints, Resolved complaints
  expect(await cells(ownerRow(page, 'Leena Owner'))).toEqual(
    ['Leena Owner', 'Rauma', '2', '1', '1', '0', '0', '1', '1', '80%', '81%', '—', '1', '2']);
  expect(await cells(ownerRow(page, 'Kalle Owner'))).toEqual(
    ['Kalle Owner', 'Pori, Tampere', '2', '0', '0', '1', '1', '0', '0', '50%', '100%', '—', '0', '0']);
});

test('AC2 an owner with no routes shows with zeros', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('owner-row')).toHaveCount(3);
  expect(await cells(ownerRow(page, 'Nora Owner'))).toEqual(
    ['Nora Owner', '—', '0', '0', '0', '0', '0', '0', '0', '—', '—', '—', '0', '0']);
});

test('AC3 the total row adds up the owners shown', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('owner-row')).toHaveCount(3);
  expect(await cells(page.getByTestId('total-row'))).toEqual(
    ['Total', '', '4', '1', '1', '1', '1', '1', '1', '70%', '86%', '—', '1', '2']);
});

test('AC4 filters by region, city and owner update the rows and the total', async ({ page }) => {
  await open(page);
  await page.getByLabel('Region').selectOption({ label: 'Pirkanmaa' });
  await expect(page.getByTestId('owner-row')).toHaveCount(1);
  expect((await cells(page.getByTestId('total-row'))).slice(0, 3)).toEqual(['Total', '', '1']);
  await page.getByLabel('Region').selectOption({ label: 'All regions' });
  await page.getByLabel('City').selectOption({ label: 'Rauma' });
  await expect(page.getByTestId('owner-row')).toHaveCount(1);
  await expect(page.getByTestId('owner-row')).toContainText('Leena Owner');
  await page.getByLabel('City').selectOption({ label: 'All cities' });
  await page.getByLabel('Route owner').selectOption({ label: 'Kalle Owner' });
  await expect(page.getByTestId('owner-row')).toHaveCount(1);
  expect((await cells(page.getByTestId('total-row'))).slice(0, 3)).toEqual(['Total', '', '2']);
});

test('AC5 clicking an owner shows their routes with rider, start, finish and outcome', async ({ page }) => {
  await open(page);
  await ownerRow(page, 'Leena Owner').click();
  await expect(page).toHaveURL(/owner=2/);
  await expect(page.locator('.page-header h3')).toHaveText('Leena Owner');
  await expect(page.getByTestId('route-row')).toHaveCount(2);
  const unaja = page.getByTestId('route-row').filter({ hasText: 'Unaja' });
  await expect(unaja).toContainText('Aino Rider');
  await expect(unaja).toContainText('Tue 17 Nov, 19:05');
  await expect(unaja).toContainText('Tue 17 Nov, 21:40');
  await expect(unaja).toContainText('6/10 · 60%');
  await expect(unaja).toContainText('Completed (force-ended)');
  await expect(unaja).toContainText('by Leena Owner');
  await expect(unaja).toContainText('Outside window');
  await expect(unaja).toContainText('Attempt 2 of 2');
  await page.locator('.page-header .back-btn').click();
  await expect(page.getByTestId('owner-row')).toHaveCount(3);
});

test('AC6 a route not run shows Not run with no times', async ({ page }) => {
  await open(page, { path: '/admin/reports/network?owner=3' });
  const pori = page.getByTestId('route-row').filter({ hasText: 'Pori 1' });
  await expect(pori).toContainText('Not run');
  expect((await cells(pori)).slice(2, 5)).toEqual(['—', '—', '—']);
});

test('AC7 picking a week loads it, and an open window is flagged', async ({ page }) => {
  const requested = await open(page);
  await page.getByLabel('Week').selectOption('2026-48');
  await expect(page).toHaveURL(/week=2026-48/);
  await expect.poll(() => requested.at(-1)).toBe('2026-48');
  await expect(page.getByText("This week's delivery window is still open")).toBeVisible();
});

test('AC8 Weekly network is in the Reports switcher', async ({ page }) => {
  await open(page, { path: '/admin/reports' });
  await page.getByRole('tab', { name: 'Weekly network' }).click();
  await expect(page).toHaveURL(/\/admin\/reports\/network$/);
  await expect(page.getByRole('tab', { name: 'Weekly network' })).toHaveAttribute('aria-selected', 'true');
});

test('AC9 on a phone the table scrolls inside its box, not the page', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('owner-row')).toHaveCount(3);
  const overflows = await page.evaluate(() => { const s = document.querySelector('.screen'); return s.scrollWidth > s.clientWidth; });
  expect(overflows).toBe(false);
});
