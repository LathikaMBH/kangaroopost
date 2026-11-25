// KAN-42, KAN-44, KAN-45: route owner reports on the phone. All API calls are mocked, so no DB or real accounts are used.
const { test, expect } = require('@playwright/test');

const WEEKS = [
  { iso_year: 2026, iso_week: 48, window_start: '2026-11-24T16:00:00Z', window_end: '2026-11-26T21:00:00Z', finished: false },
  { iso_year: 2026, iso_week: 47, window_start: '2026-11-17T16:00:00Z', window_end: '2026-11-19T21:00:00Z', finished: true },
];
const OWNER = { id: 2, name: 'Leena Owner', role: 'route_owner', roles: ['route_owner'] };
const route = (o) => ({
  owner_id: 2, owner_name: 'Leena Owner', city_id: 10, city_name: 'Rauma', run_id: 1, rider_id: 5, rider_name: 'Aino Rider',
  started_at: '2026-11-17T17:05:00Z', finished_at: '2026-11-17T19:40:00Z', ended_by_name: 'Aino Rider', outside_window: false,
  attempt: 1, attempt_count: 1, outcome: 'completed', stops: 10, delivered: 10, on_time: 10, missed: 0, time_adjusted: 0,
  complaints_open: 0, complaints_resolved: 0, ...o,
});
const ROUTES = [
  route({ route_id: 1, route_name: 'Kortela', complaints_open: 1 }),
  route({ route_id: 2, route_name: 'Unaja', run_id: 2, outcome: 'force_ended', ended_by_name: 'Leena Owner', delivered: 6, on_time: 3,
          outside_window: true, attempt: 2, attempt_count: 2, time_adjusted: 1, complaints_resolved: 2 }),
  route({ route_id: 3, route_name: 'Lappi 1', run_id: null, rider_id: null, rider_name: null, started_at: null, finished_at: null,
          outcome: 'not_run', stops: 0, delivered: 0, on_time: 0 }),
];
const MISSED = [
  { route_id: 2, route_name: 'Unaja', run_id: 2, rider_id: 5, rider_name: 'Aino Rider', stop_id: 100, order_num: 3,
    address: 'Unajantie 3', type: 'mailbox', missed: false, missed_at: null, delivered_later: false },
  { route_id: 2, route_name: 'Unaja', run_id: 2, rider_id: 5, rider_name: 'Aino Rider', stop_id: 101, order_num: 7,
    address: 'Unajantie 7 B', type: 'apartment', missed: true, missed_at: '2026-11-17T18:10:00Z', delivered_later: true },
];
const RIDERS = [{ id: 5, name: 'Aino Rider' }, { id: 6, name: 'Bea Rider' }];
const RUNS = [
  { run_id: 1, rider_id: 5, rider_name: 'Aino Rider', outcome: 'completed', started_at: '2026-11-17T17:00:00Z', finished_at: '2026-11-17T19:30:00Z', stops: 10, delivered: 9, on_time: 9 },
  { run_id: 7, rider_id: 9, rider_name: 'Old Rider', outcome: 'completed', started_at: '2026-11-17T17:00:00Z', finished_at: '2026-11-17T18:00:00Z', stops: 5, delivered: 5, on_time: 5 },
];
const c = (o) => ({ rider_id: 5, rider_name: 'Aino Rider', route_name: 'Kortela', iso_week: 47, address: 'Kortelankatu 1',
  created_at: '2026-11-18T08:00:00Z', hours_to_resolve: null, withdrawn_at: null, withdrawn_by_name: null, ...o });
const COMPLAINTS = [
  c({ id: 1, status: 'open' }),
  c({ id: 2, status: 'resolved', hours_to_resolve: 2.5 }),
  c({ id: 3, status: 'withdrawn', rider_id: 6, rider_name: 'Bea Rider', withdrawn_at: '2026-11-18T10:00:00Z', withdrawn_by_name: 'Leena Owner' }),
];

async function open(page, path) {
  const requested = [];
  await page.addInitScript((u) => {
    localStorage.setItem('kp_token', 'test-token');
    localStorage.setItem('kp_user', JSON.stringify(u));
  }, OWNER);
  await page.route('**/api/**', (r) => {
    const url = new URL(r.request().url());
    const find = s => WEEKS.find(w => `${w.iso_year}-${w.iso_week}` === s) || WEEKS[1];
    requested.push(url.pathname + url.search);
    if (url.pathname === '/api/owner/reports/weekly') {
      const week = find(url.searchParams.get('week'));
      const empty = week === WEEKS[0];
      return r.fulfill({ json: { weeks: WEEKS, week, routes: empty ? [] : ROUTES, missed: empty ? [] : MISSED } });
    }
    const range = { weeks: WEEKS, from: find(url.searchParams.get('from')), to: find(url.searchParams.get('to')) };
    if (url.pathname === '/api/owner/reports/rider-performance') return r.fulfill({ json: { ...range, riders: RIDERS, runs: RUNS, complaints: COMPLAINTS.slice(0, 2) } });
    if (url.pathname === '/api/owner/reports/complaints') return r.fulfill({ json: { ...range, complaints: COMPLAINTS } });
    return r.fulfill({ json: [] });
  });
  await page.goto(path);
  return requested;
}

const card = (page, testid, text) => page.getByTestId(testid).filter({ hasText: text });

test('KAN-42 AC1 the weekly summary defaults to the latest finished week, one card per route, with totals', async ({ page }) => {
  const requested = await open(page, '/owner/reports');
  await expect(page.getByLabel('Week')).toHaveValue('2026-47');
  expect(requested).toContain('/api/owner/reports/weekly'); // no week asked for: the server picks it
  await expect(page.getByTestId('route-card')).toHaveCount(3);
  await expect(page.getByTestId('tile-completed')).toContainText('2');
  await expect(page.getByTestId('tile-not-run')).toContainText('1');
  await expect(page.getByTestId('tile-delivered')).toContainText('80%');
  await expect(page.getByTestId('tile-on-time')).toContainText('81%');
  await expect(page.getByTestId('tile-complaints')).toContainText('3');
  const kortela = card(page, 'route-card', 'Kortela');
  await expect(kortela).toContainText('Aino Rider');
  await expect(kortela).toContainText('Tue 17 Nov, 19:05');
  await expect(kortela).toContainText('10/10 · 100%');
  await expect(kortela).toContainText('1 open · 0 resolved');
});

test('KAN-42 AC2 a force-ended route counts as completed, with who ended it, the flags and the time adjusted marker', async ({ page }) => {
  await open(page, '/owner/reports');
  const unaja = card(page, 'route-card', 'Unaja');
  await expect(unaja).toContainText('Completed (force-ended)');
  await expect(unaja).toContainText('by Leena Owner');
  await expect(unaja).toContainText('Outside window');
  await expect(unaja).toContainText('Attempt 2 of 2');
  await expect(unaja).toContainText('Time adjusted');
  await expect(card(page, 'route-card', 'Lappi 1')).toContainText('Not run');
});

test('KAN-42 AC3 filtering by route or rider updates the cards and totals, and an open week is flagged', async ({ page }) => {
  const requested = await open(page, '/owner/reports');
  await page.getByLabel('Rider').selectOption({ label: 'Aino Rider' });
  await expect(page.getByTestId('route-card')).toHaveCount(2);
  await expect(page.getByTestId('tile-not-run')).toContainText('0');
  await page.getByLabel('Rider').selectOption({ label: 'All riders' });
  await page.getByLabel('Route', { exact: true }).selectOption({ label: 'Unaja' });
  await expect(page.getByTestId('route-card')).toHaveCount(1);
  await page.getByLabel('Week').selectOption('2026-48');
  await expect(page).toHaveURL(/week=2026-48/);
  await expect.poll(() => requested.at(-1)).toContain('week=2026-48');
  await expect(page.getByText("This week's delivery window is still open")).toBeVisible();
});

test('KAN-42 AC4 missed stops lists route, stop number, address, type and whether it was delivered later', async ({ page }) => {
  await open(page, '/owner/reports');
  await page.getByRole('tab', { name: 'Missed stops' }).click();
  await expect(page).toHaveURL(/\/owner\/reports\/missed$/);
  await expect(page.getByTestId('missed-stop')).toHaveCount(2);
  const s3 = card(page, 'missed-stop', 'Stop 3');
  await expect(s3).toContainText('Unaja · Stop 3');
  await expect(s3).toContainText('Unajantie 3');
  await expect(s3).toContainText('Mailbox');
  await expect(s3).toContainText('Not delivered');
  const s7 = card(page, 'missed-stop', 'Stop 7');
  await expect(s7).toContainText('Apartment');
  await expect(s7).toContainText('Missed Tue 17 Nov, 20:10');
  await expect(s7).toContainText('delivered later');
});

test('KAN-44 one card per rider: runs, delivered, on time, average run time and complaints; a deleted rider keeps their name', async ({ page }) => {
  await open(page, '/owner/reports/riders');
  await expect(page.getByTestId('rider-card')).toHaveCount(3);
  const aino = card(page, 'rider-card', 'Aino Rider');
  await expect(aino).toContainText('90%');
  await expect(aino).toContainText('2 h 30 min');
  await expect(aino.getByText('Complaints')).toBeVisible();
  await expect(card(page, 'rider-card', 'Bea Rider')).toContainText('—'); // no runs
  await expect(card(page, 'rider-card', 'Old Rider')).toContainText('1 h');
});

test('KAN-45 the complaints log shows every complaint, filtered by status (including withdrawn) and rider', async ({ page }) => {
  const requested = await open(page, '/owner/reports/complaints');
  await expect(page.getByTestId('complaint-row')).toHaveCount(3);
  await expect(card(page, 'complaint-row', 'Resolved')).toContainText('2 h 30 min');
  await page.getByLabel('Status').selectOption({ label: 'Withdrawn' });
  await expect(page.getByTestId('complaint-row')).toHaveCount(1);
  await expect(page.getByTestId('complaint-row')).toContainText('by Leena Owner');
  await page.getByLabel('Status').selectOption({ label: 'All statuses' });
  await page.getByLabel('Rider').selectOption({ label: 'Aino Rider' });
  await expect(page.getByTestId('complaint-row')).toHaveCount(2);
  await page.getByLabel('To week').selectOption('2026-48');
  await expect.poll(() => requested.at(-1)).toContain('to=2026-48');
});

test('Reports is in the owner bottom bar, and no report scrolls the page sideways', async ({ page }) => {
  await open(page, '/owner');
  await page.locator('.bottom-nav').getByRole('button', { name: 'Reports' }).click();
  await expect(page).toHaveURL(/\/owner\/reports$/);
  for (const tab of ['Weekly summary', 'Missed stops', 'Riders', 'Complaints']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await expect(page.getByRole('tab', { name: tab, exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.spinner')).toHaveCount(0);
    const overflows = await page.evaluate(() => { const s = document.querySelector('.screen'); return s.scrollWidth > s.clientWidth; });
    expect(overflows, tab).toBe(false);
  }
});
