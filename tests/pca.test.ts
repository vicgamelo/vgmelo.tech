import { describe, expect, it } from 'vitest';
import { IRIS } from '../src/data/iris';
import { PCA_DATASETS } from '../src/data/pcaDatasets';
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

// Referência: StandardScaler + PCA do scikit-learn 1.9 em cada base (mesmas linhas dos arquivos).
describe('PCA nas outras bases', () => {
  it.each([
    ['wine', [0.361988, 0.192075, 0.111236, 0.07069], 178, 13],
    ['cancer', [0.44272, 0.189712, 0.093932, 0.066021], 569, 30],
    ['digits', [0.129679, 0.096797, 0.084197, 0.072326], 600, 64],
  ] as const)('%s padronizado bate com o scikit-learn', async (key, ref, n, p) => {
    const ds = PCA_DATASETS.find((d) => d.key === key)!;
    const { X: data, y } = await ds.load();
    expect(data).toHaveLength(n);
    expect(data[0]).toHaveLength(p);
    expect(y).toHaveLength(n);
    expect(ds.features.pt).toHaveLength(p);
    expect(ds.features.en).toHaveLength(p);
    expect(Math.max(...y) + 1).toBe(ds.classes.pt.length);
    const r = pca(data, true);
    ref.forEach((v, i) => expect(r.explained[i]).toBeCloseTo(v, 4));
  });
});
