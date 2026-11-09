// Scaled dot-product attention com máscara causal, como em
// ml-from-scratch/src/ml_from_scratch/attention.py, em TypeScript puro.
// Attention(Q, K, V) = softmax(Q Kᵀ / √d + M) V, com M = −∞ acima da diagonal.

import { rng } from './psi';

export type Matrix = number[][];

export const matmul = (a: Matrix, b: Matrix): Matrix =>
  a.map((row) => b[0].map((_, j) => row.reduce((s, v, k) => s + v * b[k][j], 0)));

export const transpose = (a: Matrix): Matrix => a[0].map((_, j) => a.map((row) => row[j]));

export function softmaxRow(row: number[]): number[] {
  const max = Math.max(...row);
  const e = row.map((v) => (v === -Infinity ? 0 : Math.exp(v - max)));
  const sum = e.reduce((s, v) => s + v, 0);
  return e.map((v) => v / sum);
}

export function causalMask(n: number): Matrix {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (j > i ? -Infinity : 0)));
}

export function attention(q: Matrix, k: Matrix, v: Matrix, mask?: Matrix): { output: Matrix; weights: Matrix } {
  const d = q[0].length;
  const scores = matmul(q, transpose(k)).map((row, i) => row.map((s, j) => s / Math.sqrt(d) + (mask ? mask[i][j] : 0)));
  const weights = scores.map(softmaxRow);
  return { output: matmul(weights, v), weights };
}

const randn = (r: () => number) => {
  const u = Math.max(r(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
};

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);

/** Embeddings de brinquedo, determinísticos por palavra, mais uma codificação posicional senoidal. */
export function embed(tokens: string[], d = 16): Matrix {
  return tokens.map((tok, pos) => {
    const r = rng(hash(tok.toLowerCase()));
    return Array.from({ length: d }, (_, i) => {
      const angle = pos / Math.pow(10000, (2 * Math.floor(i / 2)) / d);
      return randn(r) + 0.5 * (i % 2 === 0 ? Math.sin(angle) : Math.cos(angle));
    });
  });
}

export function projection(d: number, seed: number): Matrix {
  const r = rng(seed);
  return Array.from({ length: d }, () => Array.from({ length: d }, () => randn(r) / Math.sqrt(d)));
}

export function tokenize(text: string, max = 12): string[] {
  return (text.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) ?? []).slice(0, max);
}

/** Pesos de uma cabeça de attention sobre a frase. `seed` muda a cabeça. */
export function headWeights(tokens: string[], seed = 1, causal = true): Matrix {
  const d = 16;
  const x = embed(tokens, d);
  const q = matmul(x, projection(d, seed));
  const k = matmul(x, projection(d, seed + 101));
  const v = matmul(x, projection(d, seed + 202));
  return attention(q, k, v, causal ? causalMask(tokens.length) : undefined).weights;
}
