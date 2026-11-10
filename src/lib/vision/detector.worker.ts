/// <reference lib="webworker" />
// Worker do YOLOX. O build o publica em /visao/ (ver astro.config.mjs): a CSP que vale para um worker é a
// da resposta dele, e só /visao/* libera 'wasm-unsafe-eval'. Assim a página segue sem nada de WASM no
// thread principal do detector e o vídeo não engasga enquanto o modelo roda.
import * as ort from 'onnxruntime-web/wasm';
import { combinePasses, decode, INPUT, letterbox, tileGrid, toTensor, type Box, type Tile } from './detect';
import { modelUrl } from './models';

// `tile`: roda também em pedaços de `tile` px da foto (mosaico) e junta as caixas. Só para foto parada.
export type Request = { type: 'init' } | { type: 'detect'; id: number; bitmap: ImageBitmap; minScore: number; tile?: number };
export type Reply =
  | { type: 'ready'; ms: number }
  | { type: 'error'; reason: 'wasm' | 'other'; message: string; id?: number }
  | { type: 'result'; id: number; boxes: Box[]; ms: number; width: number; height: number; passes: number };

const post = (r: Reply) => postMessage(r);

let session: Promise<ort.InferenceSession> | null = null;
const canvas = new OffscreenCanvas(INPUT, INPUT);
const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

function wasmAllowed(): boolean {
  try {
    new WebAssembly.Module(Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0));
    return true;
  } catch {
    return false;
  }
}

function load(): Promise<ort.InferenceSession> {
  ort.env.wasm.numThreads = 1; // sem COEP não há SharedArrayBuffer; com um thread fica previsível
  ort.env.wasm.proxy = false;
  session ??= ort.InferenceSession.create(modelUrl('yolox'), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  return session;
}

async function pass(s: ort.InferenceSession, bitmap: ImageBitmap, t: Tile, minScore: number, total: Tile): Promise<Box[]> {
  const lb = letterbox(t.w, t.h);
  ctx.fillStyle = 'rgb(114,114,114)';
  ctx.fillRect(0, 0, INPUT, INPUT);
  ctx.drawImage(bitmap, t.x, t.y, t.w, t.h, 0, 0, lb.w, lb.h);
  const rgba = ctx.getImageData(0, 0, INPUT, INPUT).data;
  const out = await s.run({ images: new ort.Tensor('float32', toTensor(rgba), [1, 3, INPUT, INPUT]) });
  return decode(out.output.data as Float32Array, {
    scale: lb.scale,
    offsetX: t.x,
    offsetY: t.y,
    maxW: total.w,
    maxH: total.h,
    minScore,
    skipNms: true,
  });
}

async function detect(id: number, bitmap: ImageBitmap, minScore: number, tile?: number) {
  const s = await load();
  const t0 = performance.now();
  const { width, height } = bitmap;
  const whole = { x: 0, y: 0, w: width, h: height };
  const tiles = tile ? tileGrid(width, height, tile) : [whole];
  const found: Box[][] = [];
  try {
    for (const t of tiles) found.push(await pass(s, bitmap, t, minScore, whole));
  } finally {
    bitmap.close();
  }
  const boxes = combinePasses(found, tiles);
  post({ type: 'result', id, boxes, ms: Math.round(performance.now() - t0), width, height, passes: tiles.length });
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      if (!wasmAllowed()) return post({ type: 'error', reason: 'wasm', message: 'WebAssembly bloqueado' });
      const t0 = performance.now();
      await load();
      post({ type: 'ready', ms: Math.round(performance.now() - t0) });
    } else if (m.type === 'detect') {
      await detect(m.id, m.bitmap, m.minScore, m.tile);
    }
  } catch (err) {
    if (m.type === 'detect') m.bitmap.close();
    session = null;
    post({ type: 'error', reason: 'other', message: err instanceof Error ? err.message : String(err), id: m.type === 'detect' ? m.id : undefined });
  }
};
