// KAN-55: delivering in any order. The rider's position is moved with setGeolocation; all API calls are mocked, so no
// DB or real accounts are used.
//
// The street runs east along latitude 61.128. Box 1 is 6 m north of it, box 2 is across the road 5 m south, box 3 has
// no side (end of the street). Driving east, north is on the rider's left: box 1 is marked, box 2 is not. Driving back
// west, south is on the left: box 2 is marked.
const { test, expect } = require('@playwright/test');

const ROUTE_ID = 7;
const LAT = 61.128, M = 1 / 110540;                          // one metre of latitude
const at = (lng, north = 0) => ({ latitude: LAT + north * M, longitude: lng });
const STOPS = [
  { id: 1, route_id: ROUTE_ID, order_num: 1, address: '2 Koulukatu', lat: LAT + 6 * M, lng: 21.5110, type: 'mailbox', side_bearing: 0 },
  { id: 2, route_id: ROUTE_ID, order_num: 2, address: '1 Koulukatu', lat: LAT - 5 * M, lng: 21.5111, type: 'mailbox', side_bearing: 180 },
  { id: 3, route_id: ROUTE_ID, order_num: 3, address: '9 Koulukatu', lat: LAT, lng: 21.5130, type: 'mailbox', side_bearing: null },
];

async function open(page, context, { status = 'not_started', order_mode = null } = {}) {
  const calls = { start: [], mode: [], deliver: [], undo: [] };
  const delivered = new Set();
  await context.setGeolocation(at(21.5100));
  await page.addInitScript(() => {
    localStorage.setItem('kp_token', 'test-token');
    localStorage.setItem('kp_user', JSON.stringify({ id: 1, name: 'Test Rider', role: 'rider' }));
  });
  await page.route('**/api/**', async (r) => {
    const url = new URL(r.request().url()), method = r.request().method(), body = r.request().postDataJSON?.() || null;
    const path = url.pathname;
    if (path === `/api/routes/${ROUTE_ID}` && method === 'GET') {
      return r.fulfill({ json: { id: ROUTE_ID, name: 'Koulukatu', status, order_mode, road_path: null,
        stops: STOPS.map(s => ({ ...s, delivered: delivered.has(s.id) })) } });
    }
    if (path === `/api/delivery/start/${ROUTE_ID}`) { calls.start.push(body); status = 'ongoing'; return r.fulfill({ json: {} }); }
    if (path === `/api/delivery/mode/${ROUTE_ID}`) { calls.mode.push(body); return r.fulfill({ json: { order_mode: body.any_order ? 'any' : 'saved' } }); }
    const undo = path.match(/^\/api\/delivery\/stop\/(\d+)\/undo$/);
    if (undo) { calls.undo.push(Number(undo[1])); delivered.delete(Number(undo[1])); return r.fulfill({ json: { stop: {} } }); }
    const del = path.match(/^\/api\/delivery\/stop\/(\d+)$/);
    if (del) {
      calls.deliver.push({ id: Number(del[1]), method: body.method }); delivered.add(Number(del[1]));
      return r.fulfill({ json: { stop: {}, routeCompleted: delivered.size === STOPS.length } });
    }
    return r.fulfill({ json: {} });
  });
  await page.goto(`/rider/navigate/${ROUTE_ID}`);
  return calls;
}

// move the rider through these positions, one GPS update each
async function drive(page, context, points) {
  for (const p of points) { await context.setGeolocation(p); await page.waitForTimeout(350); }
}

async function startAnyOrder(page) {
  await page.getByRole('button', { name: /Start Route/ }).click();
  const dialog = page.getByRole('dialog');
  const sw = dialog.getByRole('switch', { name: 'Deliver in any order' });
  await expect(sw).not.toBeChecked();                       // off by default
  await sw.check();
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByTestId('any-order-card')).toBeVisible();
}

test('AC1 the start dialog has the switch, off by default; leaving it off starts in the saved order', async ({ page, context }) => {
  const calls = await open(page, context);
  await page.getByRole('button', { name: /Start Route/ }).click();
  await expect(page.getByRole('dialog').getByRole('switch', { name: 'Deliver in any order' })).not.toBeChecked();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('Stop 1 / 3')).toBeVisible();
  expect(calls.start).toEqual([{ any_order: false }]);
  await expect(page.getByTestId('any-order-card')).toHaveCount(0);
});

test('AC2 any order: only the box on the rider\'s left is marked, after 2 GPS updates; the other side waits', async ({ page, context }) => {
  const calls = await open(page, context);
  await startAnyOrder(page);
  expect(calls.start).toEqual([{ any_order: true }]);
  await expect(page.getByText('3 of 3 left · Any order')).toBeVisible();

  await drive(page, context, [at(21.5103), at(21.5110)]);   // heading east, first update at box 1
  expect(calls.deliver).toEqual([]);                        // one update is not enough
  await drive(page, context, [at(21.5110, 0.5)]);           // second update there
  await expect.poll(() => calls.deliver).toEqual([{ id: 1, method: 'auto' }]);
  await expect(page.locator('.toast-undo')).toContainText('2 Koulukatu');

  await drive(page, context, [at(21.5111), at(21.5111, 0.5), at(21.5111)]);   // box 2 across the road, on the right
  expect(calls.deliver.map(d => d.id)).toEqual([1]);

  // to the end of the street and back west: now box 2 is on the left
  await drive(page, context, [at(21.5120), at(21.5116), at(21.5111), at(21.5111, -0.5)]);
  await expect.poll(() => calls.deliver.map(d => d.id)).toEqual([1, 2]);
  await expect(page.getByText('1 of 3 left · Any order')).toBeVisible();
});

test('AC3 a box with no side is marked whichever way the rider goes', async ({ page, context }) => {
  const calls = await open(page, context);
  await startAnyOrder(page);
  await drive(page, context, [at(21.5140), at(21.5136), at(21.5130), at(21.5130, 0.5)]);   // heading west, box 3
  await expect.poll(() => calls.deliver.map(d => d.id)).toEqual([3]);
});

test('AC4 Undo puts the box back, and it is not marked again while the rider is still at it', async ({ page, context }) => {
  const calls = await open(page, context);
  await startAnyOrder(page);
  await drive(page, context, [at(21.5103), at(21.5110), at(21.5110, 0.5)]);
  await expect.poll(() => calls.deliver.length).toBe(1);
  await page.locator('.toast-undo').getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => calls.undo).toEqual([1]);
  await expect(page.getByText('3 of 3 left · Any order')).toBeVisible();
  await drive(page, context, [at(21.5110), at(21.5110, 0.5), at(21.5110)]);
  expect(calls.deliver.length).toBe(1);
});

test('AC5 the rider can switch during the route; back to saved order goes to the first undelivered stop', async ({ page, context }) => {
  const calls = await open(page, context);
  await startAnyOrder(page);
  await drive(page, context, [at(21.5140), at(21.5136), at(21.5130), at(21.5130, 0.5)]);   // box 3 first
  await expect.poll(() => calls.deliver.length).toBe(1);
  // the switch changes once the server has the new mode, so click and wait rather than check()
  const sw = page.getByRole('switch', { name: 'Deliver in any order' });
  await sw.click();
  await expect.poll(() => calls.mode).toEqual([{ any_order: false }]);
  await expect(sw).not.toBeChecked();
  await expect(page.getByText('Stop 1 / 3')).toBeVisible();
  await sw.click();
  await expect.poll(() => calls.mode).toEqual([{ any_order: false }, { any_order: true }]);
  await expect(page.getByText('2 of 3 left · Any order')).toBeVisible();
});

test('AC6 a refresh keeps the mode (from the run in progress)', async ({ page, context }) => {
  await open(page, context, { status: 'ongoing', order_mode: 'any' });
  await expect(page.getByTestId('any-order-card')).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Deliver in any order' })).toBeChecked();
});
