// KAN-39: a complaint is filed for one route in one delivery week; the rider is filled in from that week's run, and
// a stop can be picked. Deleting withdraws it. All API calls are mocked, so no DB or real accounts are used.
const { test, expect } = require('@playwright/test');

const RIDERS = [{ id: 5, name: 'Aino Rider' }, { id: 6, name: 'Ville Rider' }];
const ROUTES = [{ id: 7, name: 'Karpalotie', rider_id: 6 }, { id: 8, name: 'Unaja', rider_id: 5 }];
const WEEKS = [
  { iso_year: 2026, iso_week: 47, window_start: '2026-11-17T16:00:00Z', window_end: '2026-11-19T21:00:00Z' },
  { iso_year: 2026, iso_week: 46, window_start: '2026-11-10T16:00:00Z', window_end: '2026-11-12T21:00:00Z' },
];
const STOPS = [{ id: 31, order_num: 1, address: 'Karpalotie 1, Rauma', type: 'mailbox' }, { id: 32, order_num: 4, address: 'Karpalotie 3 B, Rauma', type: 'apartment' }];
// route 7: ran by Aino in week 47 (though Ville is its rider now); not run in week 46
const routeWeek = (route, week) => route === '7' && week === '47'
  ? { run: { id: 90, rider_id: 5, rider_name: 'Aino Rider', attempt: 2 }, stops: STOPS, rider_id: 5 }
  : { run: null, stops: STOPS, rider_id: route === '7' ? 6 : 5 };

async function open(page, { user = { id: 2, name: 'Leena Owner', role: 'route_owner', roles: ['route_owner'] }, complaints = [] } = {}) {
  const calls = { created: [], deleted: [] };
  await page.addInitScript((u) => {
    localStorage.setItem('kp_token', 'test-token');
    localStorage.setItem('kp_user', JSON.stringify(u));
  }, user);
  await page.route('**/api/**', (r) => {
    const url = new URL(r.request().url());
    const method = r.request().method();
    if (url.pathname === '/api/users/riders') return r.fulfill({ json: RIDERS });
    if (url.pathname === '/api/routes') return r.fulfill({ json: ROUTES });
    if (url.pathname === '/api/complaints/weeks') return r.fulfill({ json: WEEKS });
    if (url.pathname === '/api/complaints/route-week') {
      return r.fulfill({ json: routeWeek(url.searchParams.get('route_id'), url.searchParams.get('iso_week')) });
    }
    if (url.pathname === '/api/complaints' && method === 'POST') {
      const body = r.request().postDataJSON();
      calls.created.push(body);
      return r.fulfill({ status: 201, json: { id: 1, status: 'open', rider_name: 'Aino Rider', ...body } });
    }
    if (url.pathname.startsWith('/api/complaints/') && method === 'DELETE') {
      calls.deleted.push(url.pathname);
      return r.fulfill({ json: { success: true } });
    }
    if (url.pathname === '/api/complaints') return r.fulfill({ json: complaints });
    return r.fulfill({ json: [] });
  });
  await page.goto('/owner/complaints');
  return calls;
}

test('AC1 picking a route and week fills in the rider from that week\'s run', async ({ page }) => {
  await open(page);
  await expect(page.getByLabel('Delivery week')).toHaveValue('2026-47'); // the latest week by default
  await expect(page.getByLabel('Delivery week').locator('option').first()).toHaveText('Week 47 · 17–19 Nov');
  await page.getByLabel('Route').selectOption({ label: 'Karpalotie' });
  await expect(page.getByLabel('Rider')).toHaveValue('5'); // ran by Aino, not the route's rider today (Ville)
  await expect(page.getByTestId('run-hint')).toHaveText('Ran by Aino Rider · attempt 2');
});

test('AC2 a week the route was not run says so and uses the route\'s rider', async ({ page }) => {
  await open(page);
  await page.getByLabel('Route').selectOption({ label: 'Karpalotie' });
  await page.getByLabel('Delivery week').selectOption('2026-46');
  await expect(page.getByTestId('run-hint')).toHaveText('Not run that week');
  await expect(page.getByLabel('Rider')).toHaveValue('6');
});

test('AC3 picking a stop fills in its address, and the complaint is sent with route, week, rider and stop', async ({ page }) => {
  const calls = await open(page);
  await page.getByLabel('Route').selectOption({ label: 'Karpalotie' });
  await expect(page.getByLabel('Rider')).toHaveValue('5');
  await page.getByLabel('Stop').selectOption({ label: 'Stop 2 · Karpalotie 3 B, Rauma' });
  await expect(page.getByPlaceholder('Address of the missed delivery')).toHaveValue('Karpalotie 3 B, Rauma');
  await page.getByLabel('Rider').selectOption({ label: 'Ville Rider' }); // the owner may change it to another own rider
  await page.getByRole('button', { name: 'Send complaint' }).click();
  await expect(page.getByText('Complaint sent to')).toBeVisible();
  expect(calls.created).toEqual([{ route_id: 7, iso_year: 2026, iso_week: 47, rider_id: 6, stop_id: 32, address: 'Karpalotie 3 B, Rauma' }]);
});

test('AC4 a free address can be typed instead of picking a stop', async ({ page }) => {
  const calls = await open(page);
  await page.getByLabel('Route').selectOption({ label: 'Unaja' });
  await expect(page.getByLabel('Stop')).toHaveValue('');
  await page.getByPlaceholder('Address of the missed delivery').fill('Somewhere 9');
  await page.getByRole('button', { name: 'Send complaint' }).click();
  await expect.poll(() => calls.created.length).toBe(1);
  expect(calls.created[0]).toMatchObject({ route_id: 8, stop_id: null, address: 'Somewhere 9' });
});

test('AC5 an owner who also rides can pick themselves', async ({ page }) => {
  await open(page, { user: { id: 2, name: 'Leena Owner', role: 'route_owner', roles: ['route_owner', 'rider'] } });
  await expect(page.getByLabel('Rider').locator('option', { hasText: 'Leena Owner (me)' })).toHaveCount(1);
});

test('AC6 the card shows the route and week; old complaints without a route still show', async ({ page }) => {
  await open(page, { complaints: [
    { id: 1, status: 'open', address: 'Karpalotie 1', rider_name: 'Aino Rider', route_name: 'Karpalotie', iso_week: 47, created_at: '2026-11-20T10:00:00Z' },
    { id: 2, status: 'open', address: 'Old street 2', rider_name: 'Aino Rider', route_name: null, iso_week: null, created_at: '2026-10-01T10:00:00Z' },
  ] });
  await expect(page.getByText('Karpalotie · Week 47')).toBeVisible();
  await expect(page.getByText('Old street 2')).toBeVisible();
});

test('AC7 deleting asks first and calls delete (the server keeps it as withdrawn)', async ({ page }) => {
  const calls = await open(page, { complaints: [
    { id: 4, status: 'open', address: 'Karpalotie 1', rider_name: 'Aino Rider', route_name: 'Karpalotie', iso_week: 47, created_at: '2026-11-20T10:00:00Z' },
  ] });
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Delete complaint' }).click();
  await expect.poll(() => calls.deleted).toEqual(['/api/complaints/4']);
});
