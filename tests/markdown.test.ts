import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown, plainText, safeHref } from '../src/lib/markdown';

describe('markdown da resposta', () => {
  it('negrito, itálico, código e link no texto', () => {
    expect(parseInline('a **b** *c* `d` [e](https://x.com/y)')).toEqual([
      { t: 'text', v: 'a ' },
      { t: 'strong', c: [{ t: 'text', v: 'b' }] },
      { t: 'text', v: ' ' },
      { t: 'em', c: [{ t: 'text', v: 'c' }] },
      { t: 'text', v: ' ' },
      { t: 'code', v: 'd' },
      { t: 'text', v: ' ' },
      { t: 'link', href: 'https://x.com/y', c: [{ t: 'text', v: 'e' }] },
    ]);
  });

  it('link com javascript: ou data: vira só texto', () => {
    expect(parseInline('[clique](javascript:alert)')).toEqual([{ t: 'text', v: 'clique' }]);
    expect(safeHref('data:text/html,<b>')).toBeNull();
    expect(safeHref('https://vgmelo.tech/')).toBe('https://vgmelo.tech/');
  });

  it('HTML do modelo continua texto', () => {
    const blocks = parseMarkdown('<script>alert(1)</script> e <img src=x onerror=y>');
    expect(blocks).toEqual([{ t: 'p', c: [{ t: 'text', v: '<script>alert(1)</script> e <img src=x onerror=y>' }] }]);
  });

  it('asterisco solto não vira itálico', () => {
    expect(parseInline('2 * 3 = 6')).toEqual([{ t: 'text', v: '2 * 3 = 6' }]);
  });

  it('lista com sublista e título', () => {
    const md = '## Resumo\n- **CNPJ:** ok\n  - sub um\n  - sub dois\n- Selic: 0,05%\n\nFim.';
    const b = parseMarkdown(md);
    expect(b.map((x) => x.t)).toEqual(['h', 'ul', 'p']);
    const ul = b[1] as Extract<(typeof b)[number], { t: 'ul' }>;
    expect(ul.items).toHaveLength(2);
    expect(ul.items[0].children).toHaveLength(1);
    expect(plainText(ul.items[0].children)).toBe('sub um\nsub dois');
  });

  it('lista numerada mantém o início', () => {
    const b = parseMarkdown('3. três\n4. quatro');
    expect(b).toMatchObject([{ t: 'ol', start: 3 }]);
  });

  it('tabela com alinhamento', () => {
    const b = parseMarkdown('| Indicador | Valor |\n|---|---:|\n| Selic | 0,05% |\n| IPCA | 4,1% |');
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ t: 'table', align: [null, 'right'] });
    expect(plainText(b)).toBe('Indicador | Valor\nSelic | 0,05%\nIPCA | 4,1%');
  });

  it('código cercado não interpreta markdown', () => {
    const b = parseMarkdown('```json\n{"a": "**b**"}\n```');
    expect(b).toEqual([{ t: 'code', v: '{"a": "**b**"}' }]);
  });

  it('quebra simples vira <br> dentro do parágrafo', () => {
    const b = parseMarkdown('linha um\nlinha dois');
    expect(b).toEqual([{ t: 'p', c: [{ t: 'text', v: 'linha um' }, { t: 'br' }, { t: 'text', v: 'linha dois' }] }]);
  });

  it('separador e citação', () => {
    expect(parseMarkdown('a\n\n---\n\n> nota').map((x) => x.t)).toEqual(['p', 'hr', 'quote']);
  });
});
