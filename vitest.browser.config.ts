import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Tests dans de vrais moteurs (règles CSS). Local uniquement pour l'instant (#62).
export default defineConfig({
  test: {
    include: ['src/**/*.browser.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }, { browser: 'firefox' }],
    },
  },
});
