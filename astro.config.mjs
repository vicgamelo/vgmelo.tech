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
  // Prism marca os tokens com classes; o Shiki usa style inline, que a CSP (style-src 'self') bloqueia.
  markdown: { syntaxHighlight: 'prism' },
  // Sem script inline: a CSP do Caddy fica em script-src 'self'.
  vite: {
    build: { assetsInlineLimit: 0 },
    // Só no `npm run dev`: manda /api e /admin para um vgmelo-portal local, como o Caddy faz em produção.
    server: {
      proxy: {
        '/api': process.env.PORTAL_URL ?? 'http://127.0.0.1:8000',
        '/admin': process.env.PORTAL_URL ?? 'http://127.0.0.1:8000',
      },
    },
  },
});
