// Login scenarios. UI specs mock /api/auth/login with a small fake of the server rules
// (rolesOf in backend/routes/auth.js). Real server behaviour is probed with the "live backend"
// specs, which only use non-existent / malformed accounts (no real credentials).
const { test, expect } = require('@playwright/test');

const ACCOUNTS = {
  both:  { id: 1, name: 'Both',  role: 'route_owner', can_ride: true,  password: 'pw-both' },
  rider: { id: 2, name: 'Rider', role: 'rider',       can_ride: false, password: 'pw-rider' },
  owner: { id: 3, name: 'Owner', role: 'route_owner', can_ride: false, password: 'pw-owner' },
};
const rolesOf = (u) => (u.role === 'route_owner' && u.can_ride ? ['route_owner', 'rider'] : [u.role]);
// one message for unknown email and wrong password, so accounts can't be enumerated (KAN-21)
const BAD_LOGIN = 'Email or password is incorrect';

async function mockApi(page, { loginDelay = 0, loginAbort = false, loginStatus } = {}) {
  const log = { login: [] };
  await page.route('**/api/**', async (r) => {
    const url = r.request().url();
    if (url.endsWith('/api/auth/login') && r.request().method() === 'POST') {
      const b = r.request().postDataJSON();
      log.login.push(b);
      if (loginDelay) await new Promise((res) => setTimeout(res, loginDelay));
      if (loginAbort) return r.abort('internetdisconnected');
      if (loginStatus) return r.fulfill({ status: loginStatus, json: { error: 'Server error' } });
      const key = Object.keys(ACCOUNTS).find((k) => `${k}@test.fi` === String(b.email).toLowerCase().trim());
      const u = ACCOUNTS[key];
      if (!u || u.password !== b.password) return r.fulfill({ status: 401, json: { error: BAD_LOGIN } });
      // non-admins must choose a role (KAN-20); the fake has no admin account
      if (!b.role) return r.fulfill({ status: 400, json: { error: 'Please select role' } });
      if (!rolesOf(u).includes(b.role)) return r.fulfill({ status: 403, json: { error: `This account does not have the ${b.role === 'rider' ? 'Rider' : 'Route owner'} role` } });
      return r.fulfill({ json: { token: 't-' + key, user: { id: u.id, name: u.name, role: b.role, roles: rolesOf(u) } } });
    }
    return r.fulfill({ json: [] });
  });
  return log;
}

async function login(page, who, role, pw) {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(`${who}@test.fi`);
  await page.getByPlaceholder('••••••••').fill(pw ?? ACCOUNTS[who].password);
  if (role) await page.getByRole('combobox').selectOption(role);
  await page.getByRole('button', { name: /Sign In/ }).click();
}
const token = (page) => page.evaluate(() => localStorage.getItem('kp_token'));

// ---- Req 1: both roles
test('R1 dual-role user can log in as route owner', async ({ page }) => {
  await mockApi(page); await login(page, 'both', 'route_owner');
  await expect(page).toHaveURL(/\/owner$/);
});
test('R1 dual-role user can log in as rider', async ({ page }) => {
  await mockApi(page); await login(page, 'both', 'rider');
  await expect(page).toHaveURL(/\/rider$/);
});

// ---- Req 2 / 3: single role refused for the other role
test('R2 rider-only account refused as route owner', async ({ page }) => {
  await mockApi(page); await login(page, 'rider', 'route_owner');
  await expect(page.getByText(/does not have the Route owner role/)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  expect(await token(page)).toBeNull();
});
test('R2 rider-only account can log in as rider', async ({ page }) => {
  await mockApi(page); await login(page, 'rider', 'rider');
  await expect(page).toHaveURL(/\/rider$/);
});
test('R3 owner-only account refused as rider', async ({ page }) => {
  await mockApi(page); await login(page, 'owner', 'rider');
  await expect(page.getByText(/does not have the Rider role/)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  expect(await token(page)).toBeNull();
});
test('R3 owner-only account can log in as route owner', async ({ page }) => {
  await mockApi(page); await login(page, 'owner', 'route_owner');
  await expect(page).toHaveURL(/\/owner$/);
});

// ---- Req 4: no role selected -> warning (KAN-20)
test('R4 no role selected shows "Please select role" and sends no request', async ({ page }) => {
  const log = await mockApi(page); await login(page, 'both', null);
  await expect(page.getByText(/please select (a )?role/i)).toBeVisible();
  expect(log.login.length).toBe(0);
});

// ---- Req 5: unknown user gets the generic message (KAN-21)
test('R5 unknown username shows the generic message and stays on login', async ({ page }) => {
  await mockApi(page); await login(page, 'nobody', 'rider', 'whatever');
  await expect(page.getByText(BAD_LOGIN)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

// ---- Req 6: common cases
test('wrong password shows error, no token stored', async ({ page }) => {
  await mockApi(page); await login(page, 'both', 'rider', 'wrong');
  await expect(page.getByText(BAD_LOGIN)).toBeVisible();
  expect(await token(page)).toBeNull();
});
test('error text is identical for wrong password and unknown user (no enumeration)', async ({ page }) => {
  await mockApi(page);
  await login(page, 'both', 'rider', 'wrong');
  const a = await page.getByText(BAD_LOGIN).textContent();
  await login(page, 'nobody', 'rider', 'wrong');
  const b = await page.getByText(BAD_LOGIN).textContent();
  expect(a).toBe(b);
});
test('empty fields blocked by the form, no request', async ({ page }) => {
  const log = await mockApi(page);
  await page.goto('/login');
  await page.getByRole('button', { name: /Sign In/ }).click();
  expect(log.login.length).toBe(0);
  await expect(page).toHaveURL(/\/login/);
});
test('email is case and whitespace tolerant', async ({ page }) => {
  await mockApi(page);
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill('  RIDER@Test.fi ');
  await page.getByPlaceholder('••••••••').fill('pw-rider');
  await page.getByRole('combobox').selectOption('rider');
  await page.getByRole('button', { name: /Sign In/ }).click();
  await expect(page).toHaveURL(/\/rider$/);
});
test('password field is masked', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByPlaceholder('••••••••')).toHaveAttribute('type', 'password');
});
test('Enter key submits the form', async ({ page }) => {
  await mockApi(page);
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill('rider@test.fi');
  await page.getByRole('combobox').selectOption('rider');
  await page.getByPlaceholder('••••••••').fill('pw-rider');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/rider$/);
});
test('double submit sends one login request', async ({ page }) => {
  const log = await mockApi(page, { loginDelay: 700 });
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill('rider@test.fi');
  await page.getByPlaceholder('••••••••').fill('pw-rider');
  await page.getByRole('combobox').selectOption('rider');
  await page.getByRole('button', { name: /Sign In/ }).dblclick();
  await expect(page).toHaveURL(/\/rider$/);
  expect(log.login.length).toBe(1);
});
test('server error (500) shows a message and no token', async ({ page }) => {
  await mockApi(page, { loginStatus: 500 }); await login(page, 'rider', 'rider');
  await expect(page.getByText('Server error')).toBeVisible();
  expect(await token(page)).toBeNull();
});
test('offline shows a network-specific message', async ({ page }) => {
  await mockApi(page, { loginAbort: true }); await login(page, 'rider', 'rider');
  await expect(page.getByText(/network|offline|connection|reach the server/i)).toBeVisible();
});
test('already logged in: /login redirects to the dashboard', async ({ page }) => {
  await mockApi(page);
  await page.addInitScript(() => {
    localStorage.setItem('kp_token', 't'); localStorage.setItem('kp_user', JSON.stringify({ id: 2, role: 'rider' }));
  });
  await page.goto('/login');
  await expect(page).toHaveURL(/\/rider$/);
});
test('logout clears token and user and returns to login', async ({ page }) => {
  await mockApi(page); await login(page, 'rider', 'rider');
  await expect(page).toHaveURL(/\/rider$/);
  await page.getByText('Logout').first().click();
  await expect(page).toHaveURL(/\/login/);
  expect(await page.evaluate(() => [localStorage.getItem('kp_token'), localStorage.getItem('kp_user')])).toEqual([null, null]);
  await page.goto('/rider');
  await expect(page).toHaveURL(/\/login/);
});
for (const p of ['/rider', '/rider/navigate/1', '/owner', '/owner/routes', '/admin']) {
  test(`unauthenticated ${p} redirects to login`, async ({ page }) => {
    await mockApi(page);
    await page.goto(p);
    await expect(page).toHaveURL(/\/login/);
  });
}
test('rider is redirected away from owner and admin pages', async ({ page }) => {
  await mockApi(page); await login(page, 'rider', 'rider');
  await expect(page).toHaveURL(/\/rider$/);
  for (const p of ['/owner', '/owner/routes', '/admin']) {
    await page.goto(p);
    await expect(page).toHaveURL(/\/rider$/);
  }
});
test('owner is redirected away from rider and admin pages', async ({ page }) => {
  await mockApi(page); await login(page, 'owner', 'route_owner');
  await expect(page).toHaveURL(/\/owner$/);
  for (const p of ['/rider', '/admin']) {
    await page.goto(p);
    await expect(page).toHaveURL(/\/owner$/);
  }
});
test('expired/invalid token (401 from API) sends user back to login', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('kp_token', 'expired'); localStorage.setItem('kp_user', JSON.stringify({ id: 2, role: 'rider' }));
  });
  await page.route('**/api/**', (r) => r.fulfill({ status: 401, json: { error: 'Invalid token' } }));
  await page.goto('/rider');
  await expect(page).toHaveURL(/\/login/);
});

// ---- Live backend (no real credentials): server-side checks
const API = process.env.KP_API || 'http://localhost:4000';
test.describe('live backend /api/auth/login', () => {
  test('unknown user returns 401, not 500', async ({ request }) => {
    const r = await request.post(`${API}/api/auth/login`, { data: { email: 'nobody-qa@example.com', password: 'x', role: 'rider' } });
    expect(r.status()).toBe(401);
  });
  test('missing email/password returns 400', async ({ request }) => {
    const r = await request.post(`${API}/api/auth/login`, { data: { email: '', password: '' } });
    expect(r.status()).toBe(400);
  });
  test('non-string email is rejected with 4xx, not 500', async ({ request }) => {
    const r = await request.post(`${API}/api/auth/login`, { data: { email: 123, password: 'x' } });
    expect(r.status()).toBeLessThan(500);
  });
  test('protected API without token returns 401', async ({ request }) => {
    expect((await request.get(`${API}/api/routes`)).status()).toBe(401);
  });
});
