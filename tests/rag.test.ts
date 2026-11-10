import { describe, expect, it } from 'vitest';
import { PROJECTS } from '../src/data/site';
import { ROUTES } from '../src/i18n/routes';

describe('projeto rag-normas', () => {
  it('toda página de detalhe tem rota nos dois idiomas', () => {
    for (const p of PROJECTS.filter((p) => p.detail)) {
      const r = ROUTES[p.detail!];
      expect(r.pt).toMatch(/^\/projetos\//);
      expect(r.en).toMatch(/^\/en\/projects\//);
    }
  });

  it('tem resumo e destaques nos dois idiomas, com a mesma quantidade', () => {
    const p = PROJECTS.find((p) => p.slug === 'rag-normas')!;
    expect(p.detail).toBe('projectRag');
    expect(p.repo).toBe('https://github.com/vicgamelo/rag-normas');
    expect(p.highlights.pt).toHaveLength(p.highlights.en.length);
    expect(p.summary.pt && p.summary.en).toBeTruthy();
  });
});
