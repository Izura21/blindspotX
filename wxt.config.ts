import { defineConfig } from 'wxt';
import { xAdapter } from './src/platforms/x/adapter';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  imports: false,
  // Zip de sources demandé par Mozilla (code minifié) : uniquement ce qui sert au build.
  zip: {
    excludeSources: [
      'temp/**',
      'docs/**',
      'store/**',
      'lists/**',
      'brand/**',
      'scripts/**',
      'CLAUDE.md',
      '.x-brave/**',
      '.x-profile/**',
    ],
  },
  manifest: ({ browser }) => ({
    name: 'Blindspot',
    description:
      'Masque sur X les posts des comptes de votre liste, sans les bloquer, les mettre en sourdine ni les signaler. Aucune donnée envoyée.',
    permissions: ['storage', 'scripting', 'contextMenus'],
    host_permissions: [...xAdapter.matches],
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'blindspot@izura21',
          strict_min_version: '140.0',
          data_collection_permissions: { required: ['none'] },
        },
        gecko_android: { strict_min_version: '142.0' },
      },
    }),
  }),
});
