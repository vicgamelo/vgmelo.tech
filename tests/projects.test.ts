import { describe, expect, it } from 'vitest';
import { PROJECTS } from '../src/data/site';
import { ROUTES } from '../src/i18n/routes';

describe('projetos', () => {
  it('toda página de detalhe tem rota nos dois idiomas', () => {
    for (const p of PROJECTS.filter((p) => p.detail)) {
      const r = ROUTES[p.detail!];
      expect(r.pt).toMatch(/^\/projetos\//);
      expect(r.en).toMatch(/^\/en\/projects\//);
    }
  });

  it('agent-auth tem resumo e destaques em pt e en', () => {
    const p = PROJECTS.find((p) => p.slug === 'agent-auth')!;
    expect(p.detail).toBe('projectAgentAuth');
    expect(p.highlights.pt).toHaveLength(p.highlights.en.length);
    expect(p.summary.pt && p.summary.en).toBeTruthy();
  });
});
