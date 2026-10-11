const { defineConfig } = require('@playwright/test');

// Uses the installed Microsoft Edge, headless. Expects the frontend on :3000 (dev.sh).
// Rider-flow specs mock /api, so no DB or test accounts are needed for them.
module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.KP_URL || 'http://localhost:3000',
    channel: 'msedge',
    headless: true,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    geolocation: { latitude: 60.1699, longitude: 24.9384 },
    permissions: ['geolocation'],
  },
});
