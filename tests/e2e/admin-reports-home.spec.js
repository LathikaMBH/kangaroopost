// KAN-51: the route table moves from the admin Home to the Reports home (its default view), and the
// Riders directory is a sub-menu of Reports. All API calls are mocked, so no DB or real accounts are used.
const { test, expect } = require('@playwright/test');

const ROUTES = [
  { id: 1, name: 'Kortela 001', owner_id: 2, owner_name: 'Leena Owner', rider_name: 'Aino Rider', status: 'completed', stop_count: 10, delivered_count: 10 },
  { id: 2, name: 'Rauma 001', owner_id: 2, owner_name: 'Leena Owner', rider_name: null, status: 'not_started', stop_count: 8, delivered_count: 0 },
  { id: 3, name: 'Unaja', owner_id: 2, owner_name: 'Leena Owner', rider_name: 'Aino Rider', status: 'ongoing', stop_count: 12, delivered_count: 4 },
];

async function open(page, { role = 'admin', path, viewport } = {}) {
  if (viewport) await page.setViewportSize(viewport);
  await page.addInitScript((r) => {
    localStorage.setItem('kp_token', 'test-token');
    localStorage.setItem('kp_user', JSON.stringify({ id: 1, name: 'Test User', role: r }));
  }, role);
  await page.route('**/api/**', (r) => {
    const url = r.request().url();
    if (url.endsWith('/api/routes')) return r.fulfill({ json: ROUTES });
    return r.fulfill({ json: [] });
  });
  await page.goto(path);
}

test('AC1 the route table is on the Reports home', async ({ page }) => {
  await open(page, { path: '/admin/reports' });
  for (const name of ['Kortela 001', 'Rauma 001', 'Unaja']) await expect(page.getByText(name)).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Routes' })).toHaveAttribute('aria-selected', 'true');
});

test('AC2 the admin Home no longer shows the route table, and its status tiles are counts only', async ({ page }) => {
  await open(page, { path: '/admin' });
  await expect(page.locator('.status-tiles')).toContainText('Not started');
  await expect(page.locator('.status-tiles')).toContainText('In progress');
  await expect(page.getByText('Kortela 001')).toHaveCount(0);
  await expect(page.locator('.status-tiles button')).toHaveCount(0);
});

test('AC3 Reports and Riders directory switch with the tabs on a phone', async ({ page }) => {
  await open(page, { path: '/admin/reports' });
  await page.getByRole('tab', { name: 'Riders directory' }).click();
  await expect(page).toHaveURL(/\/admin\/reports\/riders$/);
  await expect(page.getByRole('tab', { name: 'Riders directory' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.bottom-nav').getByRole('button', { name: 'Reports' })).toHaveClass(/active/);
  await page.getByRole('tab', { name: 'Routes' }).click();
  await expect(page).toHaveURL(/\/admin\/reports$/);
});

test('AC4 the route owner dashboard keeps its clickable status tiles', async ({ page }) => {
  await open(page, { role: 'route_owner', path: '/owner' });
  await expect(page.locator('.status-tiles button')).toHaveCount(4);
});

test.describe('desktop', () => {
  test.use({ isMobile: false, hasTouch: false });

  test('AC5 Riders directory is a sub-item of Reports in the sidebar', async ({ page }) => {
    await open(page, { path: '/admin', viewport: { width: 1280, height: 800 } });
    const side = page.getByRole('complementary', { name: 'Admin menu' });
    const reports = side.locator('.side-nav-btn:not(.side-nav-sub)', { hasText: 'Reports' }); // name also holds the icon glyph
    const riders = side.getByRole('button', { name: 'Riders directory' });
    await expect(riders).toBeVisible();
    // indented under Reports
    const [rb, sb] = await Promise.all([reports.boundingBox(), riders.boundingBox()]);
    expect(sb.y).toBeGreaterThan(rb.y);
    await riders.click();
    await expect(page).toHaveURL(/\/admin\/reports\/riders$/);
    await expect(riders).toHaveClass(/active/);
    await expect(reports).not.toHaveClass(/active/);
    await reports.click();
    await expect(page).toHaveURL(/\/admin\/reports$/);
    await expect(reports).toHaveClass(/active/);
    await expect(riders).not.toHaveClass(/active/);
  });
});
