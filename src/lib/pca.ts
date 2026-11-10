// PCA sem dependência: centra (e opcionalmente padroniza), monta a covariância e acha os autovetores
// pelo método de Jacobi, que é exato o bastante para matriz simétrica pequena (aqui, 4×4).

export interface PcaResult {
  means: number[];
  scales: number[]; // desvio usado na padronização (1 quando não padroniza)
  cov: number[][]; // covariância dos dados já centrados/padronizados
  eigenvalues: number[]; // em ordem decrescente
  components: number[][]; // components[k] = autovetor do PC k+1 (norma 1)
  explained: number[]; // fração da variância de cada PC
  scores: number[][]; // dados projetados: scores[i][k]
}

export function columnStats(X: number[][]): { means: number[]; sds: number[] } {
  const n = X.length;
  const p = X[0].length;
  const means = Array.from({ length: p }, (_, j) => X.reduce((a, r) => a + r[j], 0) / n);
  const sds = means.map((m, j) => Math.sqrt(X.reduce((a, r) => a + (r[j] - m) ** 2, 0) / (n - 1)));
  return { means, sds };
}

export function covariance(Z: number[][]): number[][] {
  const n = Z.length;
  const p = Z[0].length;
  const C = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  for (const r of Z) for (let i = 0; i < p; i++) for (let j = i; j < p; j++) C[i][j] += r[i] * r[j];
  for (let i = 0; i < p; i++)
    for (let j = i; j < p; j++) {
      C[i][j] /= n - 1;
      C[j][i] = C[i][j];
    }
  return C;
}

/** Autovalores e autovetores de matriz simétrica (Jacobi cíclico). Vetores nas colunas de `vectors`. */
export function jacobiEigen(A: number[][], maxSweeps = 60): { values: number[]; vectors: number[][] } {
  const n = A.length;
  const a = A.map((r) => [...r]);
  const v: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
  }
  return { values: a.map((r, i) => r[i]), vectors: v };
}

export function pca(X: number[][], standardize: boolean): PcaResult {
  const { means, sds } = columnStats(X);
  const scales = standardize ? sds.map((s) => s || 1) : sds.map(() => 1);
  const Z = X.map((r) => r.map((x, j) => (x - means[j]) / scales[j]));
  const cov = covariance(Z);
  const { values, vectors } = jacobiEigen(cov);
  const order = values.map((_, i) => i).sort((i, j) => values[j] - values[i]);
  const eigenvalues = order.map((i) => Math.max(values[i], 0));
  const components = order.map((i) => {
    const vec = vectors.map((row) => row[i]);
    // Sinal fixo (maior carga positiva), para o gráfico não "pular" ao trocar de opção.
    const big = vec.reduce((b, x) => (Math.abs(x) > Math.abs(b) ? x : b), 0);
    return big < 0 ? vec.map((x) => -x) : vec;
  });
  const total = eigenvalues.reduce((a, b) => a + b, 0) || 1;
  const scores = Z.map((r) => components.map((c) => c.reduce((a, w, j) => a + w * r[j], 0)));
  return { means, scales, cov, eigenvalues, components, explained: eigenvalues.map((e) => e / total), scores };
}

/** Variância dos pontos 2D projetados na direção do ângulo `theta` (radianos). */
export function projectedVariance(points: [number, number][], theta: number): number {
  const u = [Math.cos(theta), Math.sin(theta)];
  const proj = points.map(([x, y]) => x * u[0] + y * u[1]);
  const m = proj.reduce((a, b) => a + b, 0) / proj.length;
  return proj.reduce((a, b) => a + (b - m) ** 2, 0) / (proj.length - 1);
}
