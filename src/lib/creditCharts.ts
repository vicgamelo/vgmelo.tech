// Geometria dos gráficos da demo de crédito (medidor, sigmoide, histograma, barras divergentes).
// Funções puras: o Credit.astro só cria os elementos SVG com o que sai daqui.

const f2 = (n: number) => n.toFixed(2);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Ponto no semicírculo do medidor: v=0 na esquerda, v=1 na direita, 0,5 no topo. */
export function polar(cx: number, cy: number, r: number, v: number): [number, number] {
  const a = Math.PI * (1 - clamp(v, 0, 1));
  return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
}

/** Arco do medidor entre duas frações (0–1). Nunca passa de meia volta, então large-arc é sempre 0. */
export function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  return `M ${f2(x1)} ${f2(y1)} A ${r} ${r} 0 0 1 ${f2(x2)} ${f2(y2)}`;
}

export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Metade da largura do eixo de log-odds: ±5, ou mais quando o ponto cai fora. */
export function logOddsDomain(logOdds: number): number {
  return Math.max(5, Math.ceil(Math.abs(logOdds) + 0.5));
}

export interface Frame {
  w: number;
  h: number;
  pad: number;
}

/** Converte (log-odds, probabilidade) em coordenadas do SVG (y cresce para baixo). */
export function sigmoidScale(frame: Frame, lim: number) {
  const { w, h, pad } = frame;
  return {
    x: (lo: number) => pad + ((clamp(lo, -lim, lim) + lim) / (2 * lim)) * (w - 2 * pad),
    y: (p: number) => h - pad - clamp(p, 0, 1) * (h - 2 * pad),
  };
}

/** Caminho da sigmoide de -lim a +lim. */
export function sigmoidPath(frame: Frame, lim: number, n = 64): string {
  const s = sigmoidScale(frame, lim);
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const lo = -lim + (2 * lim * i) / n;
    pts.push(`${i ? 'L' : 'M'} ${f2(s.x(lo))} ${f2(s.y(sigmoid(lo)))}`);
  }
  return pts.join(' ');
}

/** Contagem de probabilidades (0–1) em faixas iguais; 1,0 entra na última. */
export function histogram(values: number[], bins = 10): number[] {
  const out = new Array<number>(bins).fill(0);
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    out[clamp(Math.floor(v * bins), 0, bins - 1)]++;
  }
  return out;
}

/** Barra divergente a partir do centro, em % da trilha: positivo vai para a direita. */
export function diverging(value: number, max: number): { left: number; width: number } {
  const width = max > 0 ? (Math.min(Math.abs(value), max) / max) * 50 : 0;
  return { left: value >= 0 ? 50 : 50 - width, width };
}

/** Posição de um z-score numa trilha de -lim a +lim, em % (o que passa do limite fica na borda). */
export function zPos(z: number, lim = 3): number {
  return ((clamp(z, -lim, lim) + lim) / (2 * lim)) * 100;
}
