import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Seções da home sumiam numa captura de página inteira e na impressão: o CSS escondia [data-reveal] até o JS ver a
// seção entrar na tela. O conteúdo não pode depender de JS nem de rolagem; a animação só pode enriquecer.
describe('aparecer ao rolar', () => {
  const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');

  it('nenhuma regra de [data-reveal] deixa a seção invisível por padrão', () => {
    const rules = css.match(/[^{}]*\[data-reveal\][^{}]*\{[^}]*\}/g) ?? [];
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) expect(r).not.toMatch(/opacity:\s*0\b/);
  });

  it('o quadro inicial da animação não esconde (capturas e impressão pegam o estado inicial)', () => {
    const kf = css.match(/@keyframes reveal\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(kf).not.toBe('');
    expect(kf).not.toMatch(/opacity:\s*0\b/);
  });

  it('a animação fica atrás de suporte a scroll-driven e de "sem reduzir movimento"', () => {
    expect(css).toMatch(/@supports \(animation-timeline: view\(\)\)/);
    expect(css).toMatch(/prefers-reduced-motion: no-preference/);
  });
});
