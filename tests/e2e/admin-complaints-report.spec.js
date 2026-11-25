// KAN-48: admin complaints overview across owners. All API calls are mocked, so no DB or real accounts are used.
const { test, expect } = require('@playwright/test');

const WEEKS = [
  { iso_year: 2026, iso_week: 47, window_start: '2026-11-17T16:00:00Z', window_end: '2026-11-19T21:00:00Z', finished: true },
  { iso_year: 2026, iso_week: 46, window_start: '2026-11-10T16:00:00Z', window_end: '2026-11-12T21:00:00Z', finished: true },
];
const OWNERS = [{ id: 2, name: 'Leena Owner' }, { id: 3, name: 'Kalle Owner' }];
const c = (o) => ({ rider_id: 5, rider_name: 'Aino Rider', address: 'Kortelankatu 1', hours_to_resolve: null, created_at: '2026-11-18T08:00:00Z', ...o });
const COMPLAINTS = [
  c({ id: 1, owner_id: 2, owner_name: 'Leena Owner', city_id: 10, city_name: 'Rauma', status: 'open' }),
  c({ id: 2, owner_id: 2, owner_name: 'Leena Owner', city_id: 10, city_name: 'Rauma', status: 'resolved', hours_to_resolve: 2 }),
  c({ id: 3, owner_id: 2, owner_name: 'Leena Owner', city_id: 20, city_name: 'Pori', status: 'resolved', hours_to_resolve: 4 }),
  c({ id: 4, owner_id: 3, owner_name: 'Kalle Owner', city_id: null, city_name: null, status: 'withdrawn' }), // filed before KAN-39
  c({ id: 5, owner_id: 3, owner_name: 'Kalle Owner', city_id: 20, city_name: 'Pori', status: 'accepted' }),
];

async function open(page, path = '/admin/reports/complaints') {
  const requested = [];
  await page.addInitScript(() => {
    localStorage.setItem('kp_token', 'test-token');
    localStorage.setItem('kp_user', JSON.stringify({ id: 1, name: 'Admin', role: 'admin' }));
  });
  await page.route('**/api/**', (r) => {
    const url = new URL(r.request().url());
    if (url.pathname === '/api/admin/reports/complaints') {
      requested.push([url.searchParams.get('from'), url.searchParams.get('to')]);
      const find = s => WEEKS.find(w => `${w.iso_year}-${w.iso_week}` === s) || WEEKS[0];
      return r.fulfill({ json: { weeks: WEEKS, from: find(url.searchParams.get('from')), to: find(url.searchParams.get('to')), owners: OWNERS, complaints: COMPLAINTS } });
    }
    return r.fulfill({ json: [] });
  });
  await page.goto(path);
  return requested;
}

const row = (page, testid, name) => page.getByTestId(testid).filter({ hasText: name });
const cells = async (r) => (await r.locator(':scope > span').allInnerTexts()).map(s => s.trim());

test('AC1 counts by status and average time to resolve, per route owner, with a total', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('owner-row')).toHaveCount(2);
  // name, Total, Open, Accepted, Resolved, Withdrawn, Avg time to resolve
  expect(await cells(row(page, 'owner-row', 'Leena Owner'))).toEqual(['Leena Owner', '3', '1', '0', '2', '0', '3 h']);
  expect(await cells(row(page, 'owner-row', 'Kalle Owner'))).toEqual(['Kalle Owner', '2', '0', '1', '0', '1', '—']);
  expect(await cells(page.getByTestId('owner-row-total'))).toEqual(['Total', '5', '1', '1', '2', '1', '3 h']);
});

test('AC2 the same per city, with complaints without a route under Unknown city (last)', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('city-row')).toHaveCount(3);
  const names = await page.getByTestId('city-row').locator(':scope > span:first-child').allInnerTexts();
  expect(names).toEqual(['Pori', 'Rauma', 'Unknown city']);
  expect(await cells(row(page, 'city-row', 'Pori'))).toEqual(['Pori', '2', '0', '1', '1', '0', '4 h']);
  expect(await cells(row(page, 'city-row', 'Unknown city'))).toEqual(['Unknown city', '1', '0', '0', '0', '1', '—']);
});

test('AC3 owner and city filters narrow both tables', async ({ page }) => {
  await open(page);
  await page.getByLabel('City').selectOption({ label: 'Pori' });
  await expect(page.getByTestId('city-row')).toHaveCount(1);
  expect(await cells(page.getByTestId('owner-row-total'))).toEqual(['Total', '2', '0', '1', '1', '0', '4 h']);
  await page.getByLabel('City').selectOption({ label: 'All cities' });
  await page.getByLabel('Route owner').selectOption({ label: 'Kalle Owner' });
  await expect(page.getByTestId('owner-row')).toHaveCount(1);
  expect(await page.getByTestId('city-row').locator(':scope > span:first-child').allInnerTexts()).toEqual(['Pori', 'Unknown city']);
});

test('AC4 picking weeks asks for them, and the report is in the switcher', async ({ page }) => {
  const requested = await open(page);
  await page.getByLabel('From week').selectOption('2026-46');
  await expect.poll(() => requested.at(-1)).toEqual(['2026-46', '2026-47']);
  await page.getByRole('tab', { name: 'Routes' }).click();
  await expect(page).toHaveURL(/\/admin\/reports$/);
  await page.getByRole('tab', { name: 'Complaints' }).click();
  await expect(page).toHaveURL(/\/admin\/reports\/complaints$/);
});
