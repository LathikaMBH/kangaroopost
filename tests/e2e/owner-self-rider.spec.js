// KAN-53: a route owner adds themselves as a rider with their own email; their account gets the Rider role, so they can
// sign in as route owner or rider. All API calls are mocked, so no DB or real accounts are used.
const { test, expect } = require('@playwright/test');

const OWNER = { id: 2, name: 'Leena Owner', email: 'leena@example.com', role: 'route_owner', roles: ['route_owner'] };
const RIDERS = [{ id: 5, name: 'Aino Rider', email: 'aino@example.com', phone: '' }];

async function open(page, { canRide = false } = {}) {
  const state = { canRide, created: [], stopped: 0 };
  await page.addInitScript((u) => {
    localStorage.setItem('kp_token', 'test-token');
    localStorage.setItem('kp_user', JSON.stringify(u));
  }, OWNER);
  await page.route('**/api/**', (r) => {
    const url = new URL(r.request().url());
    const method = r.request().method();
    if (url.pathname === '/api/users/me' && method === 'GET') return r.fulfill({ json: { ...OWNER, can_ride: state.canRide } });
    if (url.pathname === '/api/users/me/ride' && method === 'DELETE') {
      state.stopped++; state.canRide = false;
      return r.fulfill({ json: { ...OWNER, can_ride: false } });
    }
    if (url.pathname === '/api/users/riders' && method === 'POST') {
      const body = r.request().postDataJSON();
      state.created.push(body);
      if (body.email.trim().toLowerCase() === OWNER.email) {
        state.canRide = true;
        return r.fulfill({ status: 201, json: { ...OWNER, can_ride: true, self: true } });
      }
      return r.fulfill({ status: 201, json: { id: 9, ...body, role: 'rider' } });
    }
    if (url.pathname === '/api/users/riders') return r.fulfill({ json: RIDERS });
    return r.fulfill({ json: [] });
  });
  await page.goto('/owner/riders');
  return state;
}

const openForm = async (page) => page.locator('.page-header').getByRole('button').last().click();

test('AC1 typing my own email shows a note instead of name and password', async ({ page }) => {
  await open(page);
  await openForm(page);
  await expect(page.getByPlaceholder('Password')).toBeVisible();
  await page.getByPlaceholder('Email address').fill('Leena@Example.com');
  await expect(page.getByTestId('self-note')).toBeVisible();
  await expect(page.getByPlaceholder('Full name')).toHaveCount(0);
  await expect(page.getByPlaceholder('Password')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add me as a rider' })).toBeVisible();
});

test('AC2 adding myself gives me the Rider role and shows me at the top', async ({ page }) => {
  const state = await open(page);
  await expect(page.getByTestId('self-rider')).toHaveCount(0);
  await openForm(page);
  await page.getByPlaceholder('Email address').fill('leena@example.com');
  await page.getByRole('button', { name: 'Add me as a rider' }).click();
  await expect(page.getByText('You are now a rider too')).toBeVisible();
  await expect(page.getByTestId('self-rider')).toContainText('Leena Owner');
  await expect(page.getByTestId('self-rider')).toContainText('Sign in choosing Rider');
  expect(state.created).toEqual([{ email: 'leena@example.com' }]); // no name or password sent
  await expect(page.getByText('Riders (1/5)')).toBeVisible(); // not one of the 5
});

test('AC3 another email still creates a normal rider with name and password', async ({ page }) => {
  const state = await open(page);
  await openForm(page);
  await page.getByPlaceholder('Email address').fill('new@example.com');
  await page.getByPlaceholder('Full name').fill('New Rider');
  await page.getByPlaceholder('Password').fill('secret123');
  await page.getByRole('button', { name: 'Create Rider' }).click();
  await expect(page.getByText('Rider created')).toBeVisible();
  expect(state.created[0]).toMatchObject({ name: 'New Rider', email: 'new@example.com', password: 'secret123' });
});

test('AC4 Stop riding removes the Rider role after asking', async ({ page }) => {
  const state = await open(page, { canRide: true });
  await expect(page.getByTestId('self-rider')).toBeVisible();
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Stop riding' }).click();
  await expect(page.getByTestId('self-rider')).toHaveCount(0);
  expect(state.stopped).toBe(1);
});
