import { describe, expect, it } from 'vitest';
import { IRIS } from '../src/data/iris';
import { jacobiEigen, pca, projectedVariance } from '../src/lib/pca';

const X = IRIS.map((r) => r.slice(0, 4));

describe('PCA', () => {
  it('autovalores de uma matriz conhecida', () => {
    const { values } = jacobiEigen([
      [2, 1],
      [1, 2],
    ]);
    expect([...values].sort()).toEqual([expect.closeTo(1, 12), expect.closeTo(3, 12)]);
  });

  // Valores de referência: sklearn.decomposition.PCA no load_iris (com e sem StandardScaler).
  it('Iris padronizado bate com o scikit-learn', () => {
    const r = pca(X, true);
    [0.729624, 0.228508, 0.036689, 0.005179].forEach((v, i) => expect(r.explained[i]).toBeCloseTo(v, 5));
  });

  it('Iris sem padronizar bate com o scikit-learn', () => {
    const r = pca(X, false);
    [0.924619, 0.053066, 0.017103, 0.005212].forEach((v, i) => expect(r.explained[i]).toBeCloseTo(v, 5));
  });

  it('componentes ortonormais e scores com a variância de cada autovalor', () => {
    const r = pca(X, true);
    for (let a = 0; a < 4; a++)
      for (let b = 0; b < 4; b++) {
        const dot = r.components[a].reduce((s, x, j) => s + x * r.components[b][j], 0);
        expect(dot).toBeCloseTo(a === b ? 1 : 0, 10);
      }
    const pc1 = r.scores.map((s) => s[0]);
    const varPc1 = pc1.reduce((s, x) => s + x * x, 0) / (pc1.length - 1);
    expect(varPc1).toBeCloseTo(r.eigenvalues[0], 10);
  });

  it('a variância projetada é máxima na direção do PC1', () => {
    const pts = pca(X, true).scores.map((s) => [s[0], s[1]] as [number, number]);
    const best = projectedVariance(pts, 0);
    for (let k = 1; k < 36; k++) expect(projectedVariance(pts, (k * Math.PI) / 36)).toBeLessThanOrEqual(best + 1e-9);
  });
});
