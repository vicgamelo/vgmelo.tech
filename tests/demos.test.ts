// Mesmos casos dos testes em Python (mcp-server-brasil/tests/test_documents.py,
// mlops-platform/tests/test_drift.py e ml-from-scratch), para a demo não divergir do projeto.
import { describe, expect, it } from 'vitest';
import { attention, causalMask, headWeights, softmaxRow, tokenize } from '../src/lib/attention';
import { checkCnpj, checkCpf, checkDocument } from '../src/lib/cnpj';
import { contributions, density, normal, psiFromShares, psiNumeric, severity } from '../src/lib/psi';

describe('CPF e CNPJ', () => {
  it.each(['11.222.333/0001-81', '00000000000191', '12.ABC.345/01DE-35'])('CNPJ válido %s', (v) => {
    expect(checkCnpj(v).valid).toBe(true);
  });

  it.each(['11.222.333/0001-82', '12.ABC.345/01DE-36', '00000000000000', '1122233300018', '12ABC34501DEAB'])(
    'CNPJ inválido %s',
    (v) => {
      expect(checkCnpj(v).valid).toBe(false);
    },
  );

  it.each(['529.982.247-25', '11144477735'])('CPF válido %s', (v) => expect(checkCpf(v).valid).toBe(true));
  it.each(['529.982.247-24', '111.111.111-11', '1234567890'])('CPF inválido %s', (v) =>
    expect(checkCpf(v).valid).toBe(false),
  );

  it('formata e detecta o tipo', () => {
    expect(checkDocument('52998224725').formatted).toBe('529.982.247-25');
    const alnum = checkDocument('12abc34501de35');
    expect(alnum).toMatchObject({ kind: 'CNPJ', valid: true, alphanumeric: true, formatted: '12.ABC.345/01DE-35' });
    expect(checkDocument('123').kind).toBe('unknown');
  });

  it('mostra a conta do dígito com ord(c) - 48', () => {
    const r = checkCnpj('12.ABC.345/01DE-35');
    const [s1, s2] = r.steps!;
    expect(s1.chars[2]).toMatchObject({ char: 'A', value: 17, weight: 3, product: 51 });
    expect(`${s1.digit}${s2.digit}`).toBe('35');
  });
});

describe('PSI', () => {
  it('bate com o valor conhecido 0,25·ln3', () => {
    expect(psiFromShares([0.5, 0.5], [0.25, 0.75])).toBeCloseTo(0.25 * Math.log(3), 12);
  });

  it('feature constante dá zero', () => {
    expect(psiNumeric(Array(100).fill(1), Array(100).fill(5)).psi).toBe(0);
  });

  it('mesma distribuição é estável e deslocamento grande é major', () => {
    const ref = normal(5000, 0, 1, 1);
    expect(severity(psiNumeric(ref, normal(5000, 0, 1, 2)).psi)).toBe('stable');
    expect(severity(psiNumeric(ref, normal(5000, 1, 1, 3)).psi)).toBe('major');
  });

  it('as proporções de cada lado somam 1', () => {
    const b = psiNumeric(normal(1000, 0, 1, 4), normal(1000, 0.3, 1.2, 5));
    expect(b.reference.reduce((a, c) => a + c, 0)).toBeCloseTo(1, 12);
    expect(b.current.reduce((a, c) => a + c, 0)).toBeCloseTo(1, 12);
  });

  it('a contribuição por faixa é ≥ 0 e soma o PSI', () => {
    const b = psiNumeric(normal(2000, 35, 11, 7), normal(2000, 42, 9, 11));
    expect(b.contrib.every((c) => c >= 0)).toBe(true);
    expect(b.contrib.reduce((a, c) => a + c, 0)).toBeCloseTo(b.psi, 12);
    expect(contributions([0.5, 0.5], [0.5, 0.5])).toEqual([0, 0]);
  });

  it('a densidade integra perto de 1', () => {
    const xs = Array.from({ length: 401 }, (_, i) => -6 + i * 0.03);
    const d = density(normal(1500, 0, 1, 9), xs);
    expect(d.reduce((a, y) => a + y * 0.03, 0)).toBeCloseTo(1, 2);
  });
});

describe('attention', () => {
  it('softmax é estável com valores grandes', () => {
    const s = softmaxRow([1000, 1001, 1002]);
    expect(s.every(Number.isFinite)).toBe(true);
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it('máscara causal: ninguém olha para o futuro e cada linha soma 1', () => {
    const w = headWeights(tokenize('o modelo olha só para trás'));
    w.forEach((row, i) => {
      expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
      row.forEach((v, j) => (j > i ? expect(v).toBe(0) : expect(v).toBeGreaterThan(0)));
    });
    expect(w[0][0]).toBe(1);
  });

  it('confere com a conta feita à mão', () => {
    // q = k = [[1, 0], [0, 1]], d = 2: scores = I/√2; com máscara a primeira linha só vê ela mesma
    const q = [
      [1, 0],
      [0, 1],
    ];
    const v = [
      [1, 2],
      [3, 4],
    ];
    const { weights, output } = attention(q, q, v, causalMask(2));
    const e = Math.exp(1 / Math.SQRT2);
    expect(weights[0]).toEqual([1, 0]);
    expect(weights[1][1]).toBeCloseTo(e / (1 + e), 12);
    expect(output[1][0]).toBeCloseTo((1 * 1 + 3 * e) / (1 + e), 12);
  });

  it('tokeniza com acentos e limita o tamanho', () => {
    expect(tokenize('Atenção, por favor!')).toEqual(['Atenção', ',', 'por', 'favor', '!']);
    expect(tokenize('a '.repeat(50)).length).toBe(12);
  });
});
