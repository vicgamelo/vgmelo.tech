import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://vgmelo.tech',
  trailingSlash: 'ignore',
  i18n: {
    defaultLocale: 'pt',
    locales: ['pt', 'en'],
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    sitemap({
      i18n: { defaultLocale: 'pt', locales: { pt: 'pt-BR', en: 'en' } },
      filter: (page) => !page.includes('/entrar') && !page.includes('/login'),
    }),
  ],
  build: { inlineStylesheets: 'never', format: 'directory' },
  // Sem script inline: a CSP do Caddy fica em script-src 'self'.
  vite: { build: { assetsInlineLimit: 0 } },
});
