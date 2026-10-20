// KAN-36: on Create route the city dropdown says "Select city" until a city is chosen, and with one region
// (Satakunta: Rauma, Eurajoki, Lappi) that region is picked automatically. All API calls are mocked.
const { test, expect } = require('@playwright/test');

const SATAKUNTA = { id: 1, name: 'Satakunta', cities: [
  { id: 2, name: 'Eurajoki', route_count: 0 }, { id: 3, name: 'Lappi', route_count: 0 }, { id: 1, name: 'Rauma', route_count: 4 },
] };

async function open(page, { areas = [SATAKUNTA], path = '/owner/routes/new', route } = {}) {
  await page.addInitScript(() => {
    localStorage.setItem('kp_token', 'test-token');
    localStorage.setItem('kp_user', JSON.stringify({ id: 5, name: 'Test Owner', role: 'route_owner' }));
  });
  await page.route('**/api/**', (r) => {
    const url = r.request().url();
    if (url.endsWith('/api/areas')) return r.fulfill({ json: areas });
    if (route && url.endsWith(`/api/routes/${route.id}`)) return r.fulfill({ json: route });
    return r.fulfill({ json: [] });
  });
  await page.goto(path);
}

const region = (page) => page.getByRole('combobox', { name: 'Region' });
const city = (page) => page.getByRole('combobox', { name: 'City' });

test('one region: it is selected and the city dropdown says "Select city" with all three cities', async ({ page }) => {
  await open(page);
  await expect(region(page)).toHaveValue('1');
  await expect(city(page)).toBeEnabled();
  await expect(city(page).locator('option:checked')).toHaveText('Select city');
  await expect(city(page).locator('option')).toHaveText(['Select city', 'Eurajoki', 'Lappi', 'Rauma']);
  await city(page).selectOption({ label: 'Lappi' });
  await expect(city(page)).toHaveValue('3');
});

test('several regions: "Select region" first, the city dropdown waits for a region', async ({ page }) => {
  await open(page, { areas: [SATAKUNTA, { id: 2, name: 'Uusimaa', cities: [{ id: 9, name: 'Espoo', route_count: 0 }] }] });
  await expect(region(page).locator('option:checked')).toHaveText('Select region');
  await expect(city(page)).toBeDisabled();
  await region(page).selectOption({ label: 'Satakunta' });
  await expect(city(page).locator('option:checked')).toHaveText('Select city');
});

test('editing a route shows its saved city', async ({ page }) => {
  const route = { id: 12, name: 'Eurajoki keskusta', status: 'not_started', city_id: 2, city_name: 'Eurajoki', region_id: 1,
    region_name: 'Satakunta', stops: [], road_path: null };
  await open(page, { path: '/owner/routes/12/edit', route });
  await expect(city(page)).toHaveValue('2');
  await expect(city(page).locator('option:checked')).toHaveText('Eurajoki');
});
