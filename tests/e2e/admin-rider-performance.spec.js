// KAN-47: admin rider performance across all owners. All API calls are mocked, so no DB or real accounts are used.
const { test, expect } = require('@playwright/test');

const WEEKS = [
  { iso_year: 2026, iso_week: 48, window_start: '2026-11-24T16:00:00Z', window_end: '2026-11-26T21:00:00Z', finished: false },
  { iso_year: 2026, iso_week: 47, window_start: '2026-11-17T16:00:00Z', window_end: '2026-11-19T21:00:00Z', finished: true },
  { iso_year: 2026, iso_week: 46, window_start: '2026-11-10T16:00:00Z', window_end: '2026-11-12T21:00:00Z', finished: true },
];
const OWNERS = [{ id: 2, name: 'Leena Owner' }, { id: 3, name: 'Kalle Owner' }];
const RIDERS = [
  { id: 5, name: 'Aino Rider', owner_id: 2, owner_name: 'Leena Owner' },
  { id: 6, name: 'Bea Rider', owner_id: 3, owner_name: 'Kalle Owner' },
  { id: 7, name: 'Cai Rider', owner_id: 2, owner_name: 'Leena Owner' }, // no runs
];
const run = (o) => ({
  iso_year: 2026, iso_week: 47, outcome: 'completed', outside_window: false, attempt: 1, attempt_count: 1,
  owner_id: 2, owner_name: 'Leena Owner', city_id: 10, city_name: 'Rauma', region_id: 1, region_name: 'Satakunta', complaints: 0, ...o,
});
const RUNS = [
  run({ run_id: 1, rider_id: 5, rider_name: 'Aino Rider', started_at: '2026-11-17T17:00:00Z', finished_at: '2026-11-17T19:00:00Z', stops: 10, delivered: 10, on_time: 8 }),
  run({ run_id: 2, rider_id: 5, rider_name: 'Aino Rider', outcome: 'force_ended', started_at: '2026-11-18T17:00:00Z', finished_at: '2026-11-18T20:00:00Z', stops: 10, delivered: 6, on_time: 6 }),
  run({ run_id: 3, rider_id: 6, rider_name: 'Bea Rider', owner_id: 3, owner_name: 'Kalle Owner', city_id: 30, city_name: 'Tampere', region_id: 2, region_name: 'Pirkanmaa',
        started_at: '2026-11-17T17:00:00Z', finished_at: '2026-11-17T18:30:00Z', stops: 20, delivered: 18, on_time: 18 }),
  // a rider since deleted: the name comes from the run
  run({ run_id: 4, rider_id: 9, rider_name: 'Old Rider', owner_id: 3, owner_name: 'Kalle Owner', city_id: 30, city_name: 'Tampere', region_id: 2, region_name: 'Pirkanmaa',
        started_at: '2026-11-17T17:00:00Z', finished_at: '2026-11-17T18:00:00Z', stops: 4, delivered: 4, on_time: 2 }),
];
const COMPLAINTS = [
  { id: 1, rider_id: 5, owner_id: 2, city_id: 10, region_id: 1, status: 'open' },
  { id: 2, rider_id: 6, owner_id: 3, city_id: null, region_id: null, status: 'resolved' }, // filed before complaints had a route
];

async function open(page, path = '/admin/reports/rider-performance') {
  const requested = [];
  await page.addInitScript(() => {
    localStorage.setItem('kp_token', 'test-token');
    localStorage.setItem('kp_user', JSON.stringify({ id: 1, name: 'Admin', role: 'admin' }));
  });
  await page.route('**/api/**', (r) => {
    const url = new URL(r.request().url());
    if (url.pathname === '/api/admin/reports/rider-performance') {
      requested.push([url.searchParams.get('from'), url.searchParams.get('to')]);
      const find = s => WEEKS.find(w => `${w.iso_year}-${w.iso_week}` === s) || WEEKS[1];
      return r.fulfill({ json: { weeks: WEEKS, from: find(url.searchParams.get('from')), to: find(url.searchParams.get('to')),
        riders: RIDERS, owners: OWNERS, runs: RUNS, complaints: COMPLAINTS } });
    }
    return r.fulfill({ json: [] });
  });
  await page.goto(path);
  return requested;
}

const riderRow = (page, name) => page.getByTestId('rider-row').filter({ hasText: name });
const cells = async (row) => (await row.locator(':scope > span').allInnerTexts()).map(s => s.trim());

test('AC1 one row per rider with owner, runs, delivered %, on-time %, average run time and complaints', async ({ page }) => {
  const requested = await open(page);
  await expect.poll(() => requested.length).toBeGreaterThan(0);
  expect(requested[0]).toEqual([null, null]); // the server picks the latest finished week
  await expect(page.getByLabel('From week')).toHaveValue('2026-47');
  await expect(page.getByLabel('To week')).toHaveValue('2026-47');
  await expect(page.getByTestId('rider-row')).toHaveCount(4);
  // Rider, Route owner, Runs, Delivered, On time, Avg run time (rider-finished runs only), Complaints
  expect(await cells(riderRow(page, 'Aino Rider'))).toEqual(['Aino Rider', 'Leena Owner', '2', '80%', '88%', '2 h', '1']);
  expect(await cells(riderRow(page, 'Bea Rider'))).toEqual(['Bea Rider', 'Kalle Owner', '1', '90%', '100%', '1 h 30 min', '1']);
});

test('AC2 a rider with no runs shows zeros, and a deleted rider keeps their name', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('rider-row')).toHaveCount(4);
  expect(await cells(riderRow(page, 'Cai Rider'))).toEqual(['Cai Rider', 'Leena Owner', '0', '—', '—', '—', '0']);
  expect(await cells(riderRow(page, 'Old Rider'))).toEqual(['Old Rider', 'Kalle Owner', '1', '100%', '50%', '1 h', '0']);
});

test('AC3 the total row adds up the riders shown', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('rider-row')).toHaveCount(4);
  expect(await cells(page.getByTestId('total-row'))).toEqual(['Total', '', '4', '86%', '89%', '1 h 30 min', '2']);
});

test('AC4 owner, region, city and rider filters update the rows and the total', async ({ page }) => {
  await open(page);
  await page.getByLabel('Region').selectOption({ label: 'Pirkanmaa' });
  await expect(page.getByTestId('rider-row')).toHaveCount(2); // Bea and Old Rider; a complaint without a city is left out
  expect(await cells(page.getByTestId('total-row'))).toEqual(['Total', '', '2', '92%', '91%', '1 h 15 min', '0']);
  await page.getByLabel('Region').selectOption({ label: 'All regions' });
  await page.getByLabel('City').selectOption({ label: 'Rauma' });
  await expect(page.getByTestId('rider-row')).toHaveCount(1);
  await page.getByLabel('City').selectOption({ label: 'All cities' });
  await page.getByLabel('Route owner').selectOption({ label: 'Leena Owner' });
  await expect(page.getByTestId('rider-row')).toHaveCount(2); // Aino, and Cai with no runs
  await page.getByLabel('Rider').selectOption({ label: 'Aino Rider' });
  await expect(page.getByTestId('rider-row')).toHaveCount(1);
  expect((await cells(page.getByTestId('total-row'))).slice(0, 3)).toEqual(['Total', '', '2']);
});

test('AC5 picking a range of weeks asks for those weeks', async ({ page }) => {
  const requested = await open(page);
  await page.getByLabel('From week').selectOption('2026-46');
  await expect(page).toHaveURL(/from=2026-46&to=2026-47/);
  await expect.poll(() => requested.at(-1)).toEqual(['2026-46', '2026-47']);
  await expect(page.getByText('Week 46, 2026 – Week 47, 2026')).toBeVisible();
});

test('AC6 Rider performance is in the Reports switcher, and the table scrolls inside its box on a phone', async ({ page }) => {
  await open(page, '/admin/reports');
  await page.getByRole('tab', { name: 'Rider performance' }).click();
  await expect(page).toHaveURL(/\/admin\/reports\/rider-performance$/);
  await expect(page.getByTestId('rider-row')).toHaveCount(4);
  const overflows = await page.evaluate(() => { const s = document.querySelector('.screen'); return s.scrollWidth > s.clientWidth; });
  expect(overflows).toBe(false);
});
