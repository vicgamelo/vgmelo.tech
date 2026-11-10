import { describe, expect, it } from 'vitest';
import { nearest, paintOrder, project, rotate } from '../src/lib/view3d';

const cam = { yaw: 0, pitch: 0, distance: 4 };

describe('projeção 3D do PCA', () => {
  it('sem giro, x e y passam direto e z vira profundidade', () => {
    const p = project([0.5, -0.25, 0], cam);
    expect(p.x).toBeCloseTo(0.5);
    expect(p.y).toBeCloseTo(-0.25);
    expect(p.scale).toBeCloseTo(1);
  });

  it('girar não muda o tamanho do vetor', () => {
    const v: [number, number, number] = [0.3, -0.7, 0.5];
    const r = rotate(v, { yaw: 1.1, pitch: -0.4, distance: 4 });
    expect(Math.hypot(...r)).toBeCloseTo(Math.hypot(...v));
  });

  it('yaw de 90° leva o eixo z para o x', () => {
    const r = rotate([0, 0, 1], { yaw: Math.PI / 2, pitch: 0, distance: 4 });
    expect(r[0]).toBeCloseTo(1);
    expect(r[2]).toBeCloseTo(0);
  });

  it('o que está mais perto aparece maior e é pintado por último', () => {
    const near = project([0.5, 0, 1], cam);
    const far = project([0.5, 0, -1], cam);
    expect(near.scale).toBeGreaterThan(far.scale);
    expect(near.x).toBeGreaterThan(far.x);
    expect(paintOrder([near.depth, far.depth])).toEqual([1, 0]);
  });

  it('acha o ponto mais perto do cursor e ignora os ocultos', () => {
    const pts = [
      { x: 10, y: 10, on: true },
      { x: 12, y: 10, on: false },
      { x: 30, y: 30, on: true },
    ];
    expect(nearest(pts, 12, 10, 8)).toBe(0);
    expect(nearest(pts, 100, 100, 8)).toBe(-1);
  });
});
