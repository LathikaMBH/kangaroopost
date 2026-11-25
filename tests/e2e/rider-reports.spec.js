// KAN-41: a rider's My week, My history and My complaints in the app. All API calls are mocked, so no DB or real accounts are used.
const { test, expect } = require('@playwright/test');

const RIDER = { id: 5, name: 'Aino Rider', role: 'rider', roles: ['rider'] };
const OPEN_WEEK = { iso_year: 2026, iso_week: 48, window_start: '2026-11-24T16:00:00Z', window_end: '2026-11-26T21:00:00Z', finished: false };
const run = (o) => ({
  iso_year: 2026, iso_week: 48, route_id: 1, route_name: 'Kortela', started_at: '2026-11-24T17:00:00Z', finished_at: '2026-11-24T19:00:00Z',
  outcome: 'completed', outside_window: false, attempt: 1, attempt_count: 1, stops: 10, delivered: 8, on_time: 8, time_adjusted: 0,
  not_delivered: [3, 7], complaints: 0, ...o,
});
const WEEK = {
  week: OPEN_WEEK, loaded_at: '2026-11-24T19:30:00Z',
  runs: [run({ run_id: 1 }), run({ run_id: 2, route_id: 2, route_name: 'Unaja', finished_at: null, outcome: 'in_progress', delivered: 4, on_time: 4, not_delivered: [] })],
  not_run: [],
};
// 21 runs, one a week back from week 47: the first page is 20, then "Load more"
const HISTORY = Array.from({ length: 21 }, (_, i) => run({
  run_id: 100 + i, iso_week: 47 - i, started_at: new Date(Date.parse('2026-11-17T17:00:00Z') - i * 7 * 864e5).toISOString(),
  finished_at: new Date(Date.parse('2026-11-17T19:00:00Z') - i * 7 * 864e5).toISOString(), complaints: i === 0 ? 1 : 0,
  outside_window: i === 1, attempt: i === 1 ? 2 : 1, attempt_count: i === 1 ? 2 : 1,
}));

async function open(page, path, { week = WEEK } = {}) {
  const requested = [];
  await page.addInitScript((u) => {
    localStorage.setItem('kp_token', 'test-token');
    localStorage.setItem('kp_user', JSON.stringify(u));
  }, RIDER);
  await page.route('**/api/**', (r) => {
    const url = new URL(r.request().url());
    requested.push(url.pathname + url.search);
    if (url.pathname === '/api/rider/reports/week') return r.fulfill({ json: week });
    if (url.pathname === '/api/rider/reports/history') {
      const before = url.searchParams.get('before');
      const rest = before ? HISTORY.filter(h => h.started_at < before) : HISTORY;
      return r.fulfill({ json: { runs: rest.slice(0, 20), more: rest.length > 20 } });
    }
    if (url.pathname === '/api/complaints') return r.fulfill({ json: [
      { id: 1, route_name: 'Kortela', iso_week: 47, address: 'Kortelankatu 1', status: 'resolved',
        created_at: '2026-11-18T08:00:00Z', accepted_at: '2026-11-18T09:00:00Z', resolved_at: '2026-11-18T12:00:00Z' },
    ] });
    return r.fulfill({ json: [] });
  });
  await page.goto(path);
  return requested;
}

test('My week shows each route I ran this week with start, finish, delivered, the stops not delivered and the outcome', async ({ page }) => {
  await open(page, '/rider');
  await page.locator('.bottom-nav').getByRole('button', { name: 'My reports' }).click();
  await expect(page).toHaveURL(/\/rider\/reports$/);
  await expect(page.getByText('Week 48, 2026')).toBeVisible();
  const kortela = page.getByTestId('run-card').filter({ hasText: 'Kortela' });
  await expect(kortela).toContainText('Tue 24 Nov, 19:00');
  await expect(kortela).toContainText('Tue 24 Nov, 21:00');
  await expect(kortela).toContainText('8/10 · 80%');
  await expect(kortela.getByTestId('not-delivered')).toHaveText('Stops 3, 7');
  await expect(kortela).toContainText('Completed');
  await expect(page.getByTestId('run-card').filter({ hasText: 'Unaja' })).toContainText('In progress');
});

test('a route assigned to me that was not run shows as Not run once the window has closed', async ({ page }) => {
  await open(page, '/rider/reports', { week: { ...WEEK, week: { ...OPEN_WEEK, finished: true }, runs: [], not_run: [{ route_id: 3, route_name: 'Lappi 1' }] } });
  await expect(page.getByTestId('not-run-card')).toContainText('Lappi 1');
  await expect(page.getByTestId('not-run-card')).toContainText('Not run');
});

test('with no signal, My week shows the last loaded copy and when it was loaded', async ({ page }) => {
  await open(page, '/rider/reports');
  await expect(page.getByTestId('run-card')).toHaveCount(2);
  // the next load fails: the copy kept on the phone shows
  await page.unroute('**/api/**');
  await page.route('**/api/**', r => r.fulfill({ json: [] }));
  await page.route('**/api/rider/reports/week', r => r.abort('internetdisconnected')); // the last added handler runs first
  await page.reload();
  await expect(page.getByTestId('offline-note')).toContainText('Tue 24 Nov, 21:30');
  await expect(page.getByTestId('run-card')).toHaveCount(2);
});

test('My history shows 12 months newest first, 20 at a time, with week, on time, flags and complaints', async ({ page }) => {
  const requested = await open(page, '/rider/reports/history');
  await expect(page.getByTestId('run-card')).toHaveCount(20);
  const first = page.getByTestId('run-card').first();
  await expect(first).toContainText('17 Nov 2026 · Week 47');
  await expect(first).toContainText('100%');
  await expect(first.getByText('Complaints')).toBeVisible();
  const second = page.getByTestId('run-card').nth(1);
  await expect(second).toContainText('Outside window');
  await expect(second).toContainText('Attempt 2 of 2');
  await page.getByRole('button', { name: 'Load more' }).click();
  await expect(page.getByTestId('run-card')).toHaveCount(21);
  expect(requested.some(u => u.startsWith('/api/rider/reports/history?before='))).toBe(true);
  await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0);
});

test('My complaints shows date, route, address, status and when it was accepted and resolved', async ({ page }) => {
  await open(page, '/rider/reports/complaints');
  const c = page.getByTestId('my-complaint');
  await expect(c).toHaveCount(1);
  await expect(c).toContainText('Kortela · Week 47');
  await expect(c).toContainText('Kortelankatu 1');
  await expect(c).toContainText('Resolved');
  await expect(c).toContainText('Wed 18 Nov, 11:00'); // accepted
  await expect(c).toContainText('Wed 18 Nov, 14:00'); // resolved
});
