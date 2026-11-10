// Troca de cor do cabelo e dos olhos em cima de máscaras (0..1 por pixel). Funções puras sobre RGBA:
// rodam no navegador (em cada quadro da câmera) e nos testes, sem canvas.

export type Rgb = [number, number, number];
export type Point = { x: number; y: number }; // normalizado (0..1), como o MediaPipe devolve

export function parseHex(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`cor inválida: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// HSL com tudo em 0..1.
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

const hue = (p: number, q: number, t: number) => {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
};

export function hslToRgb(h: number, s: number, l: number): Rgb {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [Math.round(hue(p, q, h + 1 / 3) * 255), Math.round(hue(p, q, h) * 255), Math.round(hue(p, q, h - 1 / 3) * 255)];
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const MIN = 0.02; // abaixo disso a máscara conta como zero

// Luminosidade média da região, pesada pela máscara. É a referência para mover o tom sem perder textura.
export function meanLightness(data: Uint8ClampedArray, mask: Float32Array): number | null {
  let sum = 0;
  let wsum = 0;
  for (let i = 0; i < mask.length; i++) {
    const m = mask[i];
    if (m < MIN) continue;
    const o = i * 4;
    const l = (Math.max(data[o], data[o + 1], data[o + 2]) + Math.min(data[o], data[o + 1], data[o + 2])) / 510;
    sum += l * m;
    wsum += m;
  }
  return wsum > 0 ? sum / wsum : null;
}

// Pinta a região da máscara com a cor alvo: troca matiz e saturação e desloca a luminosidade inteira
// para a do alvo. Fio claro continua mais claro que fio escuro, então a textura do cabelo fica.
// `opacity` mistura com o original (1 = só a cor nova). Altera `data` no lugar e devolve quantos
// pixels mudaram.
export function recolor(data: Uint8ClampedArray, mask: Float32Array, target: Rgb, opacity = 0.85): number {
  const ref = meanLightness(data, mask);
  if (ref === null) return 0;
  const [th, ts, tl] = rgbToHsl(...target);
  const shift = tl - ref;
  let changed = 0;
  for (let i = 0; i < mask.length; i++) {
    const a = mask[i] * opacity;
    if (mask[i] < MIN) continue;
    const o = i * 4;
    const [, , l] = rgbToHsl(data[o], data[o + 1], data[o + 2]);
    const [r, g, b] = hslToRgb(th, ts, clamp01(l + shift));
    data[o] = data[o] + (r - data[o]) * a;
    data[o + 1] = data[o + 1] + (g - data[o + 1]) * a;
    data[o + 2] = data[o + 2] + (b - data[o + 2]) * a;
    changed++;
  }
  return changed;
}

// Máscara de confiança do segmentador (mw × mh) → tamanho da imagem, com uma rampa entre `lo` e `hi`
// para a borda do cabelo não ficar serrilhada nem pintar o fundo onde o modelo está em dúvida.
export function resampleMask(src: Float32Array, mw: number, mh: number, w: number, h: number, lo = 0.35, hi = 0.75): Float32Array {
  const out = new Float32Array(w * h);
  const span = hi - lo;
  for (let y = 0; y < h; y++) {
    const sy = Math.min(mh - 1, Math.floor(((y + 0.5) * mh) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(mw - 1, Math.floor(((x + 0.5) * mw) / w));
      out[y * w + x] = clamp01((src[sy * mw + sx] - lo) / span);
    }
  }
  return out;
}

// Índices da malha de 478 pontos do Face Landmarker (com íris). O contorno de cada olho vai e volta
// pelas pálpebras; a íris é o centro e mais quatro pontos na borda.
export const EYES = [
  {
    contour: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
    iris: { center: 468, ring: [469, 470, 471, 472] },
  },
  {
    contour: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
    iris: { center: 473, ring: [474, 475, 476, 477] },
  },
] as const;

export const PUPIL = 0.4; // a pupila fica preta: só pinta do raio 0,4 da íris para fora

function inside(px: number, py: number, poly: { x: number; y: number }[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

// Centro e raio da íris em pixels.
export function irisCircle(pts: Point[], eye: (typeof EYES)[number], w: number, h: number): Circle {
  const c = pts[eye.iris.center];
  const x = c.x * w;
  const y = c.y * h;
  const r = eye.iris.ring.reduce((s, i) => s + Math.hypot(pts[i].x * w - x, pts[i].y * h - y), 0) / eye.iris.ring.length;
  return { x, y, r };
}

// Soma em `mask` (w × h) o anel da íris de cada olho, cortado pelas pálpebras, com borda suave.
export function irisMask(pts: Point[], w: number, h: number, mask = new Float32Array(w * h)): Float32Array {
  if (pts.length < 478) return mask;
  for (const eye of EYES) {
    const { x, y, r } = irisCircle(pts, eye, w, h);
    if (!(r > 0.5)) continue;
    const poly = eye.contour.map((i) => ({ x: pts[i].x * w, y: pts[i].y * h }));
    const f = Math.max(0.75, r * 0.15);
    const inner = r * PUPIL;
    const x0 = Math.max(0, Math.floor(x - r - 1));
    const x1 = Math.min(w - 1, Math.ceil(x + r + 1));
    const y0 = Math.max(0, Math.floor(y - r - 1));
    const y1 = Math.min(h - 1, Math.ceil(y + r + 1));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const cx = px + 0.5;
        const cy = py + 0.5;
        const d = Math.hypot(cx - x, cy - y);
        const a = clamp01((r - d) / f + 0.5) * clamp01((d - inner) / f + 0.5);
        if (a <= 0 || !inside(cx, cy, poly)) continue;
        const k = py * w + px;
        if (a > mask[k]) mask[k] = a;
      }
    }
  }
  return mask;
}
