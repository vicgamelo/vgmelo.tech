import { describe, expect, it } from 'vitest';
import { arcPath, diverging, histogram, logOddsDomain, polar, sigmoid, sigmoidPath, sigmoidScale, zPos } from '../src/lib/creditCharts';

describe('medidor', () => {
  it('vai da esquerda (0) ao topo (0,5) e à direita (1)', () => {
    const [x0, y0] = polar(100, 100, 80, 0);
    const [xm, ym] = polar(100, 100, 80, 0.5);
    const [x1, y1] = polar(100, 100, 80, 1);
    expect(x0).toBe(20);
    expect(y0).toBeCloseTo(100);
    expect(xm).toBeCloseTo(100);
    expect(ym).toBeCloseTo(20);
    expect(x1).toBeCloseTo(180);
    expect(y1).toBeCloseTo(100);
  });

  it('prende valores fora de 0–1 nas pontas', () => {
    expect(polar(100, 100, 80, -0.3)).toEqual(polar(100, 100, 80, 0));
    expect(polar(100, 100, 80, 1.7)).toEqual(polar(100, 100, 80, 1));
  });

  it('desenha o arco no sentido horário, sem large-arc', () => {
    expect(arcPath(100, 100, 80, 0, 1)).toBe('M 20.00 100.00 A 80 80 0 0 1 180.00 100.00');
  });
});

describe('sigmoide', () => {
  const frame = { w: 320, h: 180, pad: 20 };

  it('cobre ±5 e cresce quando o ponto passa disso', () => {
    expect(logOddsDomain(0.3)).toBe(5);
    expect(logOddsDomain(-4.4)).toBe(5);
    expect(logOddsDomain(6.2)).toBe(7);
  });

  it('põe log-odds 0 no meio e p=0,5 na metade da altura', () => {
    const s = sigmoidScale(frame, 5);
    expect(s.x(0)).toBe(160);
    expect(s.y(sigmoid(0))).toBe(90);
    expect(s.y(1)).toBe(20);
    expect(s.y(0)).toBe(160);
  });

  it('o caminho começa embaixo à esquerda e termina em cima à direita', () => {
    const d = sigmoidPath(frame, 5, 10);
    expect(d.startsWith('M 20.00 ')).toBe(true);
    expect(d.split(' L ')).toHaveLength(11);
    const last = d.split(' L ').at(-1)!.split(' ').map(Number);
    expect(last[0]).toBe(300);
    expect(last[1]).toBeLessThan(25);
  });
});

describe('histograma', () => {
  it('conta por faixa, com 1,0 na última e lixo ignorado', () => {
    expect(histogram([0, 0.05, 0.1, 0.55, 0.99, 1, Number.NaN], 10)).toEqual([2, 1, 0, 0, 0, 1, 0, 0, 0, 2]);
  });
});

describe('barras', () => {
  it('diverge do centro para os dois lados', () => {
    expect(diverging(0.1, 0.2)).toEqual({ left: 50, width: 25 });
    expect(diverging(-0.2, 0.2)).toEqual({ left: 0, width: 50 });
    expect(diverging(0.05, 0)).toEqual({ left: 50, width: 0 });
  });

  it('z-score de -3 a +3, preso nas bordas', () => {
    expect(zPos(0)).toBe(50);
    expect(zPos(-3)).toBe(0);
    expect(zPos(1.5)).toBe(75);
    expect(zPos(9)).toBe(100);
  });
});
