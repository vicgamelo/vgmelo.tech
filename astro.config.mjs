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
      filter: (page) =>
        !page.includes('/entrar') && !page.includes('/login') && !page.includes('/agenda/reserva') && !page.includes('/schedule/booking'),
    }),
  ],
  build: { inlineStylesheets: 'never', format: 'directory' },
  // Prism marca os tokens com classes; o Shiki usa style inline, que a CSP (style-src 'self') bloqueia.
  markdown: { syntaxHighlight: 'prism' },
  // Sem script inline: a CSP do Caddy fica em script-src 'self'.
  vite: {
    build: { assetsInlineLimit: 0 },
    // Workers empacotados (hoje só o detector da demo de visão) saem em /visao/: o worker usa a CSP da
    // própria resposta, e só /visao/* libera 'wasm-unsafe-eval' no Caddy. O .wasm do ONNX Runtime vem junto.
    worker: {
      format: 'es',
      rolldownOptions: {
        output: {
          entryFileNames: 'visao/[name]-[hash].js',
          chunkFileNames: 'visao/[name]-[hash].js',
          assetFileNames: 'visao/[name]-[hash][extname]',
        },
      },
    },
    // Só no `npm run dev`: manda /api e /admin para um vgmelo-portal local, como o Caddy faz em produção.
    // /api/agenda vem antes de /api: vai para o vgmelo-agenda.
    server: {
      proxy: {
        '/api/agenda': process.env.AGENDA_URL ?? 'http://127.0.0.1:8010',
        '/api': process.env.PORTAL_URL ?? 'http://127.0.0.1:8000',
        '/admin': process.env.PORTAL_URL ?? 'http://127.0.0.1:8000',
      },
    },
  },
});
