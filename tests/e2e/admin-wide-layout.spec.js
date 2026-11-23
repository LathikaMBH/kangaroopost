// KAN-50: on a wide screen the admin gets a full-width layout (max 1400px) with a left sidebar.
// Route owners and riders, and admins on a phone, keep the phone layout. All API calls are mocked.
const { test, expect } = require('@playwright/test');

const DESKTOP = { width: 1920, height: 1080 };
const LAPTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

const owners = [1, 2, 3].map(id => ({ id, name: `Owner ${id}`, email: `o${id}@example.com`, city: 'Pori', route_count: 2, rider_count: 1 }));

async function open(page, role, path, viewport) {
  await page.setViewportSize(viewport);
  await page.addInitScript((r) => {
    localStorage.setItem('kp_token', 'test-token');
    localStorage.setItem('kp_user', JSON.stringify({ id: 1, name: 'Test User', role: r }));
  }, role);
  await page.route('**/api/**', (r) => {
    const url = r.request().url();
    if (url.endsWith('/api/users/owners')) return r.fulfill({ json: owners });
    return r.fulfill({ json: [] });
  });
  await page.goto(path);
  await expect(page.locator('.app-shell')).toBeVisible();
}

const shellWidth = (page) => page.locator('.app-shell').evaluate(el => el.getBoundingClientRect().width);

test.describe('desktop view', () => {
  test.use({ isMobile: false, hasTouch: false });

  test('AC1 admin fills the screen up to 1400px', async ({ page }) => {
    await open(page, 'admin', '/admin', DESKTOP);
    expect(await shellWidth(page)).toBe(1400);
    await page.setViewportSize(LAPTOP);
    expect(await shellWidth(page)).toBe(1280);
  });

  test('AC3 admin gets the sidebar instead of the bottom bar', async ({ page }) => {
    await open(page, 'admin', '/admin', LAPTOP);
    const side = page.getByRole('complementary', { name: 'Admin menu' });
    await expect(side).toBeVisible();
    await expect(page.locator('.bottom-nav')).toBeHidden();
    for (const label of ['Home', 'Owners', 'Routes', 'Areas', 'Logout']) {
      await expect(side.getByRole('button', { name: label })).toBeVisible();
    }
    await side.getByRole('button', { name: 'Owners' }).click();
    await expect(page).toHaveURL(/\/admin\/owners$/);
    await expect(side.getByRole('button', { name: 'Owners' })).toHaveClass(/active/);
  });

  test('AC4 admin owner cards sit side by side with no sideways scroll', async ({ page }) => {
    await open(page, 'admin', '/admin/owners', DESKTOP);
    const cards = page.locator('.admin-grid > .card');
    await expect(cards).toHaveCount(3);
    const [a, b] = await Promise.all([cards.nth(0).boundingBox(), cards.nth(1).boundingBox()]);
    expect(Math.round(a.y)).toBe(Math.round(b.y));
    const overflow = await page.evaluate(() => [...document.querySelectorAll('.screen')].some(s => s.scrollWidth > s.clientWidth));
    expect(overflow).toBe(false);
  });

  for (const [role, path] of [['route_owner', '/owner'], ['rider', '/rider']]) {
    test(`AC5 ${role} keeps the phone layout on a monitor`, async ({ page }) => {
      await open(page, role, path, DESKTOP);
      expect(await shellWidth(page)).toBe(430);
      await expect(page.locator('.side-nav')).toHaveCount(0);
      await expect(page.locator('.bottom-nav')).toBeVisible();
    });
  }
});

test('AC2 admin on a phone keeps the phone layout', async ({ page }) => {
  await open(page, 'admin', '/admin', PHONE);
  expect(await shellWidth(page)).toBeLessThanOrEqual(430);
  await expect(page.locator('.side-nav')).toBeHidden();
  await expect(page.locator('.bottom-nav')).toBeVisible();
});
