import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests', use: { baseURL: 'http://localhost:5173', browserName: 'chromium', launchOptions: { channel: 'msedge' } }, workers: 1, reporter: 'list' });
