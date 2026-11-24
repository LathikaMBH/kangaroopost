// KAN-52: each route card on the owner's Routes page has a "Change rider" button. All API calls are mocked, so no DB
// or real accounts are used.
const { test, expect } = require('@playwright/test');

const RIDERS = [{ id: 5, name: 'Aino Rider' }, { id: 6, name: 'Ville Rider' }];
const ROUTES = [
  { id: 7, name: 'Uotila', status: 'completed', rider_id: 5, rider_name: 'Aino Rider', stop_count: 75, delivered_count: 0 },
  { id: 8, name: 'Falcon 53', status: 'ongoing', rider_id: 6, rider_name: 'Ville Rider', stop_count: 100, delivered_count: 99 },
];

async function open(page, { assignStatus = 200 } = {}) {
  const calls = { assign: [] };
  await page.addInitScript(() => {
    localStorage.setItem('kp_token', 'test-token');
    localStorage.setItem('kp_user', JSON.stringify({ id: 2, name: 'Leena Owner', role: 'route_owner' }));
  });
  await page.route('**/api/**', (r) => {
    const url = new URL(r.request().url());
    if (url.pathname === '/api/routes') return r.fulfill({ json: ROUTES });
    if (url.pathname === '/api/users/riders') return r.fulfill({ json: RIDERS });
    const m = url.pathname.match(/^\/api\/routes\/(\d+)\/assign$/);
    if (m && r.request().method() === 'POST') {
      const { rider_id } = r.request().postDataJSON();
      calls.assign.push({ id: Number(m[1]), rider_id });
      if (assignStatus !== 200) return r.fulfill({ status: assignStatus, json: { error: 'That rider does not belong to this route\'s owner' } });
      const route = ROUTES.find(x => x.id === Number(m[1]));
      return r.fulfill({ json: { ...route, rider_id, rider_name: RIDERS.find(x => x.id === rider_id)?.name ?? null } });
    }
    return r.fulfill({ json: [] });
  });
  await page.goto('/owner/routes');
  return calls;
}

const card = (page, name) => page.locator('.card', { hasText: name });

test('AC1 every route card has a Change rider button', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('button', { name: /^Change rider of / })).toHaveCount(2);
});

test('AC2 picking another rider and saving updates the card, without leaving the page', async ({ page }) => {
  const calls = await open(page);
  await page.getByRole('button', { name: 'Change rider of Uotila' }).click();
  const uotila = card(page, 'Uotila');
  await expect(uotila.getByLabel('Rider', { exact: true })).toHaveValue('5');
  await uotila.getByLabel('Rider', { exact: true }).selectOption({ label: 'Ville Rider' });
  await uotila.getByRole('button', { name: 'Save' }).click();
  await expect(uotila).toContainText('Ville Rider');
  await expect(uotila.getByLabel('Rider', { exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/\/owner\/routes$/);
  expect(calls.assign).toEqual([{ id: 7, rider_id: 6 }]);
});

test('AC3 a route can be left unassigned', async ({ page }) => {
  const calls = await open(page);
  await page.getByRole('button', { name: 'Change rider of Uotila' }).click();
  await card(page, 'Uotila').getByLabel('Rider', { exact: true }).selectOption({ label: 'Unassigned' });
  await card(page, 'Uotila').getByRole('button', { name: 'Save' }).click();
  await expect(card(page, 'Uotila')).toContainText('Unassigned');
  expect(calls.assign).toEqual([{ id: 7, rider_id: null }]);
});

test('AC4 Cancel, or saving the same rider, changes nothing', async ({ page }) => {
  const calls = await open(page);
  await page.getByRole('button', { name: 'Change rider of Uotila' }).click();
  await card(page, 'Uotila').getByRole('button', { name: 'Cancel' }).click();
  await expect(card(page, 'Uotila').getByLabel('Rider', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Change rider of Uotila' }).click();
  await card(page, 'Uotila').getByRole('button', { name: 'Save' }).click();
  await expect(card(page, 'Uotila').getByLabel('Rider', { exact: true })).toHaveCount(0);
  expect(calls.assign).toEqual([]);
});

test('AC5 a route being delivered asks first; declining keeps the rider', async ({ page }) => {
  const calls = await open(page);
  await page.getByRole('button', { name: 'Change rider of Falcon 53' }).click();
  await card(page, 'Falcon 53').getByLabel('Rider', { exact: true }).selectOption({ label: 'Aino Rider' });
  let message = '';
  page.once('dialog', d => { message = d.message(); d.dismiss(); });
  await card(page, 'Falcon 53').getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => message).toContain('Ville Rider is delivering this route right now');
  expect(calls.assign).toEqual([]);
  page.once('dialog', d => d.accept());
  await card(page, 'Falcon 53').getByRole('button', { name: 'Save' }).click();
  await expect(card(page, 'Falcon 53')).toContainText('Aino Rider');
  expect(calls.assign).toEqual([{ id: 8, rider_id: 5 }]);
});

test('AC6 an error from the server is shown and the picker stays open', async ({ page }) => {
  await open(page, { assignStatus: 400 });
  await page.getByRole('button', { name: 'Change rider of Uotila' }).click();
  await card(page, 'Uotila').getByLabel('Rider', { exact: true }).selectOption({ label: 'Ville Rider' });
  await card(page, 'Uotila').getByRole('button', { name: 'Save' }).click();
  await expect(card(page, 'Uotila')).toContainText('does not belong to this route');
  await expect(card(page, 'Uotila').getByLabel('Rider', { exact: true })).toBeVisible();
});

test('AC7 the button does not open the route', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Change rider of Uotila' }).click();
  await card(page, 'Uotila').getByLabel('Rider', { exact: true }).click();
  await expect(page).toHaveURL(/\/owner\/routes$/);
});
