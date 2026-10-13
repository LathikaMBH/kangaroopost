// KAN-28: passed mailboxes are marked missed, the rider is guided to the next stop in the saved order and completes
// the route with a progress %. All API calls are mocked and GPS is set with context.setGeolocation.
const { test, expect } = require('@playwright/test');

const ROUTE_ID = 9;
// 8 stops along a street, ~110 m apart (far more than the 20 m reach)
const pos = (n) => ({ latitude: 61.1 + n * 0.001, longitude: 21.5 });
const makeStops = ({ delivered = [], missed = [], apartments = [] } = {}) => Array.from({ length: 8 }, (_, i) => {
  const n = i + 1;
  return { id: 100 + n, route_id: ROUTE_ID, order_num: n, address: `Katu ${n}`, lat: pos(n).latitude, lng: pos(n).longitude,
    type: apartments.includes(n) ? 'apartment' : 'mailbox', delivered: delivered.includes(n), missed: missed.includes(n) };
});

// Opens the rider navigate page with a mocked backend that keeps the stops' state. Returns the recorded calls.
async function open(page, { status = 'ongoing', ...stopOpts } = {}) {
  const stops = makeStops(stopOpts);
  const calls = { reached: [], deliver: [], complete: 0 };
  const num = (id) => stops.findIndex((s) => s.id === id) + 1;
  await page.addInitScript(() => {
    localStorage.setItem('kp_token', 'test-token');
    localStorage.setItem('kp_user', JSON.stringify({ id: 1, name: 'Test Rider', role: 'rider' }));
  });
  await page.route('**/api/**', async (r) => {
    const url = r.request().url();
    const method = r.request().method();
    let m;
    if (url.endsWith(`/api/routes/${ROUTE_ID}`) && method === 'GET') {
      return r.fulfill({ json: { id: ROUTE_ID, name: 'Kortela 001', status, road_path: null, stops } });
    }
    if ((m = url.match(/\/api\/delivery\/reached\/(\d+)$/))) {
      const id = Number(m[1]); calls.reached.push(num(id));
      const idx = stops.findIndex((s) => s.id === id);
      const passed = stops.slice(0, idx).filter((s) => !s.delivered && !s.missed);
      passed.forEach((s) => { s.missed = true; });
      return r.fulfill({ json: { missed: passed } });
    }
    if ((m = url.match(/\/api\/delivery\/stop\/(\d+)$/))) {
      const s = stops.find((x) => x.id === Number(m[1])); calls.deliver.push(num(s.id));
      s.delivered = true; s.missed = false;
      return r.fulfill({ json: { stop: s } });
    }
    if (url.endsWith(`/api/delivery/complete/${ROUTE_ID}`)) {
      calls.complete++;
      const delivered = stops.filter((s) => s.delivered).length;
      return r.fulfill({ json: { route: { id: ROUTE_ID, status: 'completed' }, progress: {
        delivered, total: stops.length, pct: Math.round(delivered / stops.length * 100),
        missed: stops.map((s, i) => (!s.delivered && s.missed ? i + 1 : null)).filter(Boolean) } } });
    }
    return r.fulfill({ json: {} });
  });
  await page.goto(`/rider/navigate/${ROUTE_ID}`);
  return calls;
}

const goTo = (context, n) => context.setGeolocation(pos(n));
const tile = (page, label) => page.locator(`xpath=//div[div[normalize-space()="${label}"]]`).first();   // a stat tile: value above label

test('AC1/4/5 reaching stop 6 while 4 is next marks 4 and 5 missed, delivers 6 and points to 7', async ({ page, context }) => {
  const calls = await open(page, { delivered: [1, 2, 3] });
  await expect(page.getByText('Stop 4 / 8')).toBeVisible();
  await goTo(context, 6);
  await expect(page.locator('.toast')).toHaveText('Mailboxes 4, 5 missed');
  await expect(page.getByText('Stop 7 / 8')).toBeVisible();
  await expect(page.getByText('Katu 7', { exact: true })).toBeVisible();   // the info card moved to the next open stop
  expect(calls.reached).toEqual([6]);
  expect(calls.deliver).toEqual([6]);
  await expect(tile(page, 'Missed')).toContainText('2');
});

test('AC2 reaching the next stop itself never marks anything missed', async ({ page, context }) => {
  const calls = await open(page, { delivered: [1, 2, 3] });
  await expect(page.getByText('Stop 4 / 8')).toBeVisible();
  await goTo(context, 4);
  await expect(page.getByText('Stop 5 / 8')).toBeVisible();
  expect(calls.reached).toEqual([]);
  expect(calls.deliver).toEqual([4]);
});

test('AC14 while paused nothing is marked missed or delivered', async ({ page, context }) => {
  const calls = await open(page, { status: 'paused', delivered: [1, 2, 3] });
  await expect(page.getByText('Route paused')).toBeVisible();
  await goTo(context, 6);
  await page.waitForTimeout(1500);
  expect(calls.reached).toEqual([]);
  expect(calls.deliver).toEqual([]);
});

test('AC13/7/10 missed stops survive a reload; a missed mailbox is delivered late and counts in progress', async ({ page, context }) => {
  const calls = await open(page, { delivered: [1, 2, 3, 6], missed: [4, 5] });
  await expect(page.getByText('Stop 7 / 8')).toBeVisible();   // same next stop as before the reload
  await expect(tile(page, 'Missed')).toContainText('2');
  await expect(page.getByText('50%').first()).toBeVisible();
  await goTo(context, 4);
  await expect(page.getByText('63%').first()).toBeVisible();    // 5 of 8
  expect(calls.deliver).toEqual([4]);
  expect(calls.reached).toEqual([]);
  await expect(tile(page, 'Missed')).toContainText('1');
  await expect(page.getByText('Stop 7 / 8')).toBeVisible();
});

test('AC6 a later apartment marks earlier stops missed; it still needs the Delivered button', async ({ page, context }) => {
  const calls = await open(page, { delivered: [1, 2, 3], apartments: [6] });
  await goTo(context, 6);
  await expect(page.locator('.toast')).toHaveText('Mailboxes 4, 5 missed');
  await expect(page.getByRole('button', { name: 'Delivered' })).toBeVisible();
  expect(calls.deliver).toEqual([]);
  await page.getByRole('button', { name: 'Delivered' }).click();
  await expect(page.getByText('Stop 7 / 8')).toBeVisible();
  expect(calls.deliver).toEqual([6]);
});

test('AC9/11 reaching the last stop shows Complete route; completing shows the final progress', async ({ page, context }) => {
  const calls = await open(page, { delivered: [1, 2, 3, 6, 7], missed: [4, 5] });
  await expect(page.getByRole('button', { name: /Complete route/ })).toBeHidden();
  await goTo(context, 8);
  await expect(page.getByRole('button', { name: /Complete route/ })).toBeVisible();
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /Complete route/ }).click();
  await expect(page.getByTestId('route-summary')).toHaveText('Route complete: 75% delivered (6 of 8). Missed: 4, 5');
  expect(calls.complete).toBe(1);
});

test('AC8/9 delivering every stop does not complete by itself; the rider completes', async ({ page, context }) => {
  const calls = await open(page, { delivered: [1, 2, 3, 4, 5, 6, 7] });
  await goTo(context, 8);
  await expect(page.getByRole('button', { name: /Complete route/ })).toBeVisible();
  await expect(page.getByText('Route Complete!')).toBeHidden();
  expect(calls.complete).toBe(0);
  await page.getByRole('button', { name: /Complete route/ }).click();   // nothing left: no confirmation
  await expect(page.getByTestId('route-summary')).toHaveText('Route complete: 100% delivered (8 of 8).');
});

test('Paused route still has End Route', async ({ page }) => {
  await open(page, { status: 'paused', delivered: [1, 2] });
  await expect(page.getByRole('button', { name: /End Route/ })).toBeVisible();
});
