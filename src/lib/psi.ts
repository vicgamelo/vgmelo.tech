// PSI como em mlops-platform/src/mlops_platform/drift.py.
// PSI = Σ (atual% − esperado%) · ln(atual% / esperado%), com bins pelos quantis da referência.

export const EPS = 1e-4;
export type Severity = 'stable' | 'moderate' | 'major';

export const severity = (psi: number): Severity => (psi < 0.1 ? 'stable' : psi < 0.25 ? 'moderate' : 'major');

export function psiFromShares(expected: number[], actual: number[]): number {
  let total = 0;
  for (let i = 0; i < expected.length; i++) {
    const e = Math.max(expected[i], EPS);
    const a = Math.max(actual[i], EPS);
    total += (a - e) * Math.log(a / e);
  }
  return total;
}

/** Quantil com interpolação linear (o padrão do numpy). `sorted` precisa estar ordenado. */
export function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface Binned {
  edges: number[];
  reference: number[];
  current: number[];
  psi: number;
}

export function psiNumeric(reference: number[], current: number[], bins = 10): Binned {
  const sorted = [...reference].sort((a, b) => a - b);
  const raw = Array.from({ length: bins + 1 }, (_, i) => quantile(sorted, i / bins));
  const edges = [...new Set(raw)];
  if (edges.length < 2) return { edges, reference: [1], current: [1], psi: 0 };
  edges[0] = -Infinity;
  edges[edges.length - 1] = Infinity;
  const share = (values: number[]) => {
    const counts = new Array(edges.length - 1).fill(0);
    for (const v of values) {
      // [a, b) como no np.histogram; o último bin vai até +inf
      let i = edges.findIndex((e, k) => k > 0 && v < e) - 1;
      if (i < 0) i = edges.length - 2;
      counts[i]++;
    }
    return counts.map((c) => c / Math.max(values.length, 1));
  };
  const ref = share(reference);
  const cur = share(current);
  return { edges, reference: ref, current: cur, psi: psiFromShares(ref, cur) };
}

/** Gerador determinístico (mulberry32) para os dados sintéticos da demo. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Amostras normais (Box-Muller). */
export function normal(n: number, mean: number, sd: number, seed: number): number[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => {
    const u = Math.max(r(), 1e-12);
    const v = r();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  });
}
