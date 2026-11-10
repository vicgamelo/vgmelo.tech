import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROUTES } from '../src/i18n/routes';

describe('páginas legais', () => {
  // A tela de consentimento do OAuth do Google pede estes dois links.
  it('privacidade e termos têm rota nos dois idiomas', () => {
    expect(ROUTES.privacy).toEqual({ pt: '/privacidade/', en: '/en/privacy/' });
    expect(ROUTES.terms).toEqual({ pt: '/termos/', en: '/en/terms/' });
  });

  it('o rodapé linka as duas', () => {
    const footer = readFileSync('src/components/Footer.astro', 'utf8');
    expect(footer).toContain("route('privacy', lang)");
    expect(footer).toContain("route('terms', lang)");
  });
});
