// Pré e pós-processamento do YOLOX (Megvii, Apache-2.0) em TypeScript puro: o mesmo código roda no
// worker do navegador e nos testes em Node. Segue demo/ONNXRuntime/onnx_inference.py do YOLOX.
import { PERSON } from './coco';

export const INPUT = 416; // o yolox_nano.onnx do release 0.1.1rc0 tem entrada fixa 1x3x416x416
export const STRIDES = [8, 16, 32] as const;
const PAD = 114; // cinza do letterbox do YOLOX

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  cls: number;
  score: number;
  tileOnly?: boolean; // só apareceu num pedaço do mosaico, sem nada parecido na foto inteira
}

export interface Letterbox {
  scale: number;
  w: number; // tamanho da imagem redimensionada dentro do quadrado
  h: number;
}

// Redimensiona mantendo a proporção; o YOLOX encosta a imagem no canto superior esquerdo e
// completa o resto com cinza, então não há deslocamento para desfazer, só a escala.
export function letterbox(srcW: number, srcH: number, size = INPUT): Letterbox {
  const scale = Math.min(size / srcW, size / srcH);
  return { scale, w: Math.max(1, Math.round(srcW * scale)), h: Math.max(1, Math.round(srcH * scale)) };
}

// Bilinear simples, só para quem não tem canvas (os testes em Node). O navegador usa drawImage.
export function letterboxRgba(src: Uint8ClampedArray | Uint8Array, sw: number, sh: number, size = INPUT) {
  const lb = letterbox(sw, sh, size);
  const out = new Uint8ClampedArray(size * size * 4).fill(PAD);
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  const fx = sw / lb.w;
  const fy = sh / lb.h;
  for (let y = 0; y < lb.h; y++) {
    const sy = Math.min(sh - 1, Math.max(0, (y + 0.5) * fy - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = sy - y0;
    for (let x = 0; x < lb.w; x++) {
      const sx = Math.min(sw - 1, Math.max(0, (x + 0.5) * fx - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = sx - x0;
      const o = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        const a = src[(y0 * sw + x0) * 4 + c] * (1 - tx) + src[(y0 * sw + x1) * 4 + c] * tx;
        const b = src[(y1 * sw + x0) * 4 + c] * (1 - tx) + src[(y1 * sw + x1) * 4 + c] * tx;
        out[o + c] = a * (1 - ty) + b * ty;
      }
    }
  }
  return { rgba: out, ...lb };
}

// RGBA (canvas) → tensor CHW em float32, como o YOLOX lê do OpenCV: canais em BGR, de 0 a 255, sem
// normalizar. (O pré-processamento antigo, RGB normalizado pelo ImageNet, não acha nada com este ONNX:
// o teste "variante antiga" confere isso.)
export function toTensor(rgba: Uint8ClampedArray | Uint8Array, size = INPUT): Float32Array {
  const n = size * size;
  const t = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    t[i] = rgba[i * 4 + 2];
    t[n + i] = rgba[i * 4 + 1];
    t[2 * n + i] = rgba[i * 4];
  }
  return t;
}

export function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

// NMS por classe: uma caixa só some se outra da mesma classe, com nota maior, cobre mais que `thr`.
export function nms(boxes: Box[], thr = 0.45): Box[] {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const keep: Box[] = [];
  for (const b of sorted) {
    if (keep.every((k) => k.cls !== b.cls || iou(k, b) <= thr)) keep.push(b);
  }
  return keep;
}

export interface DecodeOptions {
  size?: number;
  scale?: number; // a escala do letterbox, para voltar às coordenadas da imagem original
  minScore?: number;
  nmsThr?: number;
  maxW?: number; // corta as caixas na borda da imagem original
  maxH?: number;
  offsetX?: number; // quando a entrada é um pedaço da foto (mosaico), onde ele começa
  offsetY?: number;
  skipNms?: boolean;
}

// Saída [1, 3549, 85]: por âncora, (dx, dy, log w, log h) na grade do stride, objectness e 80 classes
// (as duas já com sigmoid). A nota é objectness × classe, como no YOLOX.
export function decode(out: Float32Array, opts: DecodeOptions = {}): Box[] {
  const { size = INPUT, scale = 1, minScore = 0.3, nmsThr = 0.45 } = opts;
  const ox = opts.offsetX ?? 0;
  const oy = opts.offsetY ?? 0;
  const maxW = opts.maxW ?? ox + size / scale;
  const maxH = opts.maxH ?? oy + size / scale;
  const per = 85;
  const boxes: Box[] = [];
  let a = 0;
  for (const s of STRIDES) {
    const g = size / s;
    for (let gy = 0; gy < g; gy++) {
      for (let gx = 0; gx < g; gx++, a++) {
        const o = a * per;
        const obj = out[o + 4];
        if (obj < minScore) continue;
        let cls = 0;
        let best = 0;
        for (let c = 0; c < 80; c++) {
          const v = out[o + 5 + c];
          if (v > best) {
            best = v;
            cls = c;
          }
        }
        const score = obj * best;
        if (score < minScore) continue;
        const cx = (out[o] + gx) * s;
        const cy = (out[o + 1] + gy) * s;
        const w = Math.exp(out[o + 2]) * s;
        const h = Math.exp(out[o + 3]) * s;
        const x1 = Math.max(0, ox + (cx - w / 2) / scale);
        const y1 = Math.max(0, oy + (cy - h / 2) / scale);
        const x2 = Math.min(maxW, ox + (cx + w / 2) / scale);
        const y2 = Math.min(maxH, oy + (cy + h / 2) / scale);
        if (x2 <= x1 || y2 <= y1) continue;
        boxes.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1, cls, score });
      }
    }
  }
  if (a * per !== out.length) throw new Error(`saída com ${out.length / per} âncoras; esperava ${a}`);
  return opts.skipNms ? boxes : nms(boxes, nmsThr);
}

export interface Tile {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Mosaico para achar gente pequena em multidão: além da foto inteira, pedaços quadrados de `tile` px
// com sobreposição, cada um ampliado para os 416 do modelo. Quem estava com 15 px vira 30 ou mais.
export function tileGrid(w: number, h: number, tile = 416, overlap = 0.25): Tile[] {
  const tiles: Tile[] = [{ x: 0, y: 0, w, h }];
  if (Math.max(w, h) <= tile * 1.2) return tiles;
  const step = tile * (1 - overlap);
  const nx = Math.max(1, Math.ceil((w - tile) / step) + 1);
  const ny = Math.max(1, Math.ceil((h - tile) / step) + 1);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const tw = Math.min(tile, w);
      const th = Math.min(tile, h);
      const x = nx === 1 ? 0 : Math.round((i * (w - tw)) / (nx - 1));
      const y = ny === 1 ? 0 : Math.round((j * (h - th)) / (ny - 1));
      tiles.push({ x, y, w: tw, h: th });
    }
  }
  return tiles;
}

// Num pedaço, o modelo vê só parte de um objeto grande e às vezes inventa (um croissant cortado vira
// "pessoa"). O mosaico serve para gente pequena: caixa que ocupa mais de `frac` do pedaço é grande o
// bastante para a passada na foto inteira, então a do pedaço é descartada.
export function smallOnly(boxes: Box[], tile: Tile, frac = 0.2): Box[] {
  const max = tile.w * tile.h * frac;
  return boxes.filter((b) => b.w * b.h <= max);
}

// Interseção sobre a menor caixa: pega a pessoa cortada na borda de um pedaço, que o IoU deixaria passar.
export function overlapSmaller(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const small = Math.min(a.w * a.h, b.w * b.h);
  return small > 0 ? inter / small : 0;
}

// Junta as caixas de todos os pedaços: NMS por classe e, depois, descarta a caixa que fica quase toda
// dentro de outra maior e mais confiável da mesma classe.
export function mergeTiles(boxes: Box[], iouThr = 0.45, containThr = 0.8): Box[] {
  const keep: Box[] = [];
  for (const b of nms(boxes, iouThr)) {
    if (keep.every((k) => k.cls !== b.cls || overlapSmaller(k, b) < containThr)) keep.push(b);
  }
  return keep;
}

// O que só um pedaço viu precisa de mais confiança: é ali que o mosaico erra (ver combinePasses).
export const TILE_MARGIN = 0.1;
export const passes = (b: Box, minScore: number): boolean => b.score >= minScore + (b.tileOnly ? TILE_MARGIN : 0);

export const countPersons = (boxes: Box[], minScore = 0): number =>
  boxes.filter((b) => b.cls === PERSON && passes(b, minScore)).length;

// Resumo por classe, do mais frequente para o menos: [[classe, quantidade], ...].
export function tally(boxes: Box[]): [number, number][] {
  const m = new Map<number, number>();
  for (const b of boxes) m.set(b.cls, (m.get(b.cls) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
}

// Junta as passadas do mosaico: a primeira é a foto inteira, as outras são os pedaços de `tiles` (mesma
// ordem de tileGrid). Caixa de pedaço que a foto inteira já suspeitava (mesma classe, mesma região, mesmo
// com nota baixa) fica confirmada; a que só o pedaço viu sai marcada `tileOnly` e precisa de TILE_MARGIN
// a mais para aparecer.
export function combinePasses(found: Box[][], tiles: Tile[]): Box[] {
  const whole = found[0] ?? [];
  const pieces = found.slice(1).flatMap((boxes, i) => smallOnly(boxes, tiles[i + 1]));
  const seen = new Set(whole);
  return mergeTiles([...whole, ...pieces]).map((b) =>
    seen.has(b) || whole.some((w) => w.cls === b.cls && overlapSmaller(w, b) >= 0.5) ? b : { ...b, tileOnly: true },
  );
}
