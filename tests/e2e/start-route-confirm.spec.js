// KAN-19: start-route confirmation is titled "Start Route" and no longer shows the
// "already completed" note. All API calls are mocked, so no DB or real accounts are used.
const { test, expect } = require('@playwright/test');

const ROUTE_ID = 7;
const stops = (delivered) => [
  { id: 1, route_id: ROUTE_ID, address: 'Hämeenkatu 5, Pori', lat: 61.1282, lng: 21.5117, type: 'mailbox', delivered, seq: 0 },
  { id: 2, route_id: ROUTE_ID, address: 'Yrjönkatu 12 A, Pöytyä', lat: 61.1290, lng: 21.5130, type: 'apartment', delivered, seq: 1 },
  { id: 3, route_id: ROUTE_ID, address: 'Åkerlundinkatu 3, Pori', lat: 61.1300, lng: 21.5140, type: 'mailbox', delivered, seq: 2 },
];
const route = (status, delivered) => ({
  id: ROUTE_ID, name: 'Länsi-Pori Ääkkönen', status, road_path: null, stops: stops(delivered),
});

// Opens the rider navigate page with a mocked backend. Returns recorded start calls.
async function open(page, { status = 'not_started', delivered = false, startHandler } = {}) {
  const calls = { start: 0 };
  await page.addInitScript(() => {
    localStorage.setItem('kp_token', 'test-token');
    localStorage.setItem('kp_user', JSON.stringify({ id: 1, name: 'Test Rider', role: 'rider' }));
  });
  await page.route('**/api/**', async (r) => {
    const url = r.request().url();
    const method = r.request().method();
    if (url.endsWith(`/api/routes/${ROUTE_ID}`) && method === 'GET') {
      return r.fulfill({ json: route(status, delivered) });
    }
    if (url.endsWith(`/api/delivery/start/${ROUTE_ID}`) && method === 'POST') {
      calls.start++;
      if (startHandler) return startHandler(r);
      return r.fulfill({ json: route('ongoing', false) });
    }
    return r.fulfill({ json: {} });
  });
  await page.goto(`/rider/navigate/${ROUTE_ID}`);
  await expect(page.getByText('Ready to start')).toBeVisible();
  await page.getByRole('button', { name: /Start Route/ }).click();
  return calls;
}

const dialog = (page) => page.getByRole('dialog');

for (const [label, status, delivered] of [
  ['never-started route', 'not_started', false],
  ['completed route with delivered stops', 'completed', true],
]) {
  test(`AC1 dialog is titled "Start Route" - ${label}`, async ({ page }) => {
    await open(page, { status, delivered });
    await expect(dialog(page).getByRole('heading')).toHaveText('Start Route');
    await expect(dialog(page)).toContainText('Länsi-Pori Ääkkönen');
    await expect(dialog(page)).toContainText('Date');
    await expect(dialog(page)).toContainText('Start time');
  });

  test(`AC2 no "already completed" note - ${label}`, async ({ page }) => {
    await open(page, { status, delivered });
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).not.toContainText(/already completed/i);
    await expect(dialog(page)).not.toContainText(/resets? its delivered/i);
    await expect(dialog(page)).not.toContainText(/again\?/i);
    await expect(dialog(page).getByRole('heading')).not.toHaveText(/this route/i);
  });
}

test('AC3 Confirm starts the route (one POST) and enters running state', async ({ page }) => {
  const calls = await open(page);
  await dialog(page).getByRole('button', { name: 'Confirm' }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByText('Stop 1 / 3')).toBeVisible();
  expect(calls.start).toBe(1);
});

test('AC3b Confirm on a completed route still calls start (logic intact)', async ({ page }) => {
  const calls = await open(page, { status: 'completed', delivered: true });
  await dialog(page).getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('Stop 1 / 3')).toBeVisible();
  expect(calls.start).toBe(1);
  await expect(page.getByText('0%')).toBeVisible(); // delivered stops reset client-side
});

test('AC4 Cancel aborts: no start call, route stays idle', async ({ page }) => {
  const calls = await open(page);
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByText('Ready to start')).toBeVisible();
  expect(calls.start).toBe(0);
});

test('AC4b Escape closes the dialog without starting', async ({ page }) => {
  const calls = await open(page);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  expect(calls.start).toBe(0);
});

test('Edge: double-clicking Confirm sends only one start request', async ({ page }) => {
  const calls = await open(page, {
    startHandler: async (r) => { await new Promise((res) => setTimeout(res, 800)); await r.fulfill({ json: route('ongoing', false) }); },
  });
  const confirm = dialog(page).getByRole('button', { name: /Confirm|Starting/ });
  await confirm.dblclick();
  await expect(page.getByText('Stop 1 / 3')).toBeVisible();
  expect(calls.start).toBe(1);
});

test('Edge: start request fails (500) - alert shown, dialog stays, route not running', async ({ page }) => {
  let alertText = '';
  page.on('dialog', async (d) => { alertText = d.message(); await d.accept(); });
  await open(page, { startHandler: (r) => r.fulfill({ status: 500, json: { error: 'Server down' } }) });
  await dialog(page).getByRole('button', { name: 'Confirm' }).click();
  await expect.poll(() => alertText).toBe('Server down');
  await expect(dialog(page)).toBeVisible();
  await expect(page.getByText('Stop 1 / 3')).toBeHidden();
});

test('Edge: offline when confirming - start fails, route not running', async ({ page, context }) => {
  let alerted = false;
  page.on('dialog', async (d) => { alerted = true; await d.accept(); });
  await open(page, { startHandler: (r) => r.abort('internetdisconnected') });
  await dialog(page).getByRole('button', { name: 'Confirm' }).click();
  await expect.poll(() => alerted).toBe(true);
  await expect(page.getByText('Stop 1 / 3')).toBeHidden();
  await expect(dialog(page)).toBeVisible();
});
