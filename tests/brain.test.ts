import { describe, expect, it } from 'vitest';
import { brainPoints, connect, facing, nearest, project, rng, stepToward } from '../src/lib/brain';

describe('cérebro da home', () => {
  it('sai igual em toda visita (semente fixa)', () => {
    expect(brainPoints(300)).toEqual(brainPoints(300));
    expect(rng(3)()).toBe(rng(3)());
  });

  it('gera o número pedido de neurônios, dentro de uma caixa razoável', () => {
    const pts = brainPoints(900);
    expect(pts).toHaveLength(900);
    for (const p of pts) {
      expect(Math.abs(p.x)).toBeLessThan(1.2);
      expect(Math.abs(p.y)).toBeLessThan(1.2);
      expect(Math.abs(p.z)).toBeLessThan(1.6);
    }
  });

  it('não liga neurônios distantes e não repete sinapse', () => {
    const b = connect(brainPoints(500), 3, 0.24);
    const keys = new Set(b.edges.map(([i, j]) => `${Math.min(i, j)}-${Math.max(i, j)}`));
    expect(keys.size).toBe(b.edges.length);
    for (const [i, j] of b.edges) {
      const p = b.nodes[i];
      const q = b.nodes[j];
      expect(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)).toBeLessThanOrEqual(0.24 + 1e-9);
      expect(b.neighbors[i]).toContain(j);
      expect(b.neighbors[j]).toContain(i);
    }
  });

  it('cada seção fica num neurônio diferente', () => {
    const nodes = brainPoints(400);
    const used = new Set<number>();
    const a = nearest(nodes, { x: 0, y: 0.5, z: 0.5 }, used);
    used.add(a);
    const b = nearest(nodes, { x: 0, y: 0.5, z: 0.5 }, used);
    expect(a).not.toBe(b);
  });

  it('o sinal anda por sinapses existentes', () => {
    const b = connect(brainPoints(400), 3);
    const rand = rng(1);
    let at = 0;
    while (!b.neighbors[at].length) at++;
    const next = stepToward(b, at, 10, rand);
    expect(b.neighbors[at]).toContain(next);
  });

  it('facing() põe o neurônio no centro e na frente da câmera', () => {
    const p = { x: 0.6, y: 0.3, z: -0.4 };
    const f = facing(p);
    const q = project(p, f.yaw, f.pitch, 3.4, 100, 0, 0);
    expect(q.x).toBeCloseTo(0, 6);
    expect(q.y).toBeCloseTo(0, 6);
    expect(q.z).toBeGreaterThan(0);
  });
});
