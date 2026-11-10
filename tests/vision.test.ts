// Demo de visão: pré/pós-processamento do YOLOX, contagem, recoloração e máscara da íris. Os testes com
// o modelo de verdade rodam o mesmo yolox_nano.onnx que o site serve, no ONNX Runtime Web (WASM) em Node,
// sobre as fotos de exemplo da página.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it } from 'vitest';
import { COCO_EN, COCO_PT, PERSON } from '../src/lib/vision/coco';
import { combinePasses, countPersons, passes, decode, INPUT, iou, letterbox, letterboxRgba, mergeTiles, nms, overlapSmaller, smallOnly, tally, TILE_MARGIN, tileGrid, toTensor, type Box, type Tile } from '../src/lib/vision/detect';
import { MODELS } from '../src/lib/vision/models';
import { EYES, hslToRgb, irisMask, meanLightness, parseHex, PUPIL, recolor, resampleMask, rgbToHsl, type Point } from '../src/lib/vision/recolor';

const require = createRequire(import.meta.url);
const ANCHORS = (INPUT / 8) ** 2 + (INPUT / 16) ** 2 + (INPUT / 32) ** 2;

describe('modelos', () => {
  it.each(Object.values(MODELS))('$file confere com o SHA-256 registrado', (m) => {
    const hash = createHash('sha256').update(readFileSync(`public/visao/models/${m.file}`)).digest('hex');
    expect(hash).toBe(m.sha256);
    expect(m.license).toBe('Apache-2.0');
  });

  it('80 classes nos dois idiomas, pessoa no índice 0', () => {
    expect(COCO_EN).toHaveLength(80);
    expect(COCO_PT).toHaveLength(80);
    expect(COCO_EN[PERSON]).toBe('person');
    expect(COCO_PT[15]).toBe('gato');
  });
});

describe('pré-processamento do YOLOX', () => {
  it('letterbox mantém a proporção e encosta no canto', () => {
    expect(letterbox(1024, 683)).toEqual({ scale: 416 / 1024, w: 416, h: 277 });
    expect(letterbox(640, 800)).toEqual({ scale: 416 / 800, w: 333, h: 416 });
    const { rgba, w, h } = letterboxRgba(new Uint8ClampedArray(4 * 4 * 2).fill(200), 4, 2, 8);
    expect([w, h]).toEqual([8, 4]);
    expect(rgba[0]).toBe(200); // canto superior esquerdo é imagem
    expect(rgba[(7 * 8 + 7) * 4]).toBe(114); // o resto é o cinza do YOLOX
  });

  it('tensor em CHW, canais em BGR e de 0 a 255', () => {
    const rgba = new Uint8ClampedArray(2 * 2 * 4);
    rgba.set([10, 20, 30, 255], 0);
    const t = toTensor(rgba, 2);
    expect([t[0], t[4], t[8]]).toEqual([30, 20, 10]);
  });
});

describe('pós-processamento', () => {
  const at = (out: Float32Array, a: number, v: number[], cls: number, p: number) => {
    out.set(v, a * 85);
    out[a * 85 + 5 + cls] = p;
  };

  it('decodifica a grade de cada stride e volta para a escala da foto', () => {
    const out = new Float32Array(ANCHORS * 85);
    // stride 8, célula (x=3, y=2): centro (28, 20), 32 × 16 no quadrado de 416
    at(out, 2 * 52 + 3, [0.5, 0.5, Math.log(4), Math.log(2), 0.9], 15, 0.8);
    // stride 32, célula (x=5, y=4), depois das 52² + 26² âncoras
    at(out, 52 * 52 + 26 * 26 + 4 * 13 + 5, [0, 0, Math.log(2), Math.log(2), 1], PERSON, 0.95);
    const boxes = decode(out, { scale: 0.5, minScore: 0.3 });
    expect(boxes).toHaveLength(2);
    const [person, cat] = boxes;
    const near = (b: Box, want: number[]) => [b.x, b.y, b.w, b.h].forEach((v, i) => expect(v).toBeCloseTo(want[i], 3));
    expect(person.cls).toBe(PERSON);
    near(person, [256, 192, 128, 128]);
    expect(person.score).toBeCloseTo(0.95, 6);
    expect(cat.cls).toBe(15);
    near(cat, [24, 24, 64, 32]);
    expect(cat.score).toBeCloseTo(0.72, 6);
  });

  it('corta na borda da foto e ignora nota baixa', () => {
    const out = new Float32Array(ANCHORS * 85);
    at(out, 0, [0, 0, Math.log(10), Math.log(10), 1], 2, 0.9);
    at(out, 1, [0, 0, 0, 0, 0.5], 2, 0.5); // 0,25 < 0,3
    const [b, ...rest] = decode(out, { minScore: 0.3, maxW: 30, maxH: 30 });
    expect(rest).toEqual([]);
    [b.x, b.y, b.w, b.h].forEach((v, i) => expect(v).toBeCloseTo([0, 0, 30, 30][i], 3));
  });

  it('recusa saída de outro tamanho', () => {
    expect(() => decode(new Float32Array(100 * 85))).toThrow(/âncoras/);
  });

  it('NMS por classe', () => {
    const b = (x: number, cls: number, score: number): Box => ({ x, y: 0, w: 10, h: 10, cls, score });
    expect(iou(b(0, 0, 1), b(5, 0, 1))).toBeCloseTo(50 / 150, 12);
    const kept = nms([b(0, 0, 0.6), b(1, 0, 0.9), b(1, 2, 0.5), b(30, 0, 0.4)]);
    expect(kept.map((k) => [k.x, k.cls])).toEqual([
      [1, 0],
      [1, 2],
      [30, 0],
    ]);
  });

  it('desloca a caixa pelo início do pedaço do mosaico', () => {
    const out = new Float32Array(ANCHORS * 85);
    at(out, 2 * 52 + 3, [0.5, 0.5, Math.log(4), Math.log(2), 0.9], PERSON, 0.9);
    const [b] = decode(out, { scale: 0.5, offsetX: 300, offsetY: 100, maxW: 2000, maxH: 2000, minScore: 0.3 });
    [b.x, b.y, b.w, b.h].forEach((v, i) => expect(v).toBeCloseTo([324, 124, 64, 32][i], 3));
  });

  it('mosaico cobre a foto inteira com sobreposição e inclui a foto toda', () => {
    expect(tileGrid(400, 300)).toEqual([{ x: 0, y: 0, w: 400, h: 300 }]); // pequena: uma passada só
    const tiles = tileGrid(1024, 682);
    expect(tiles[0]).toEqual({ x: 0, y: 0, w: 1024, h: 682 });
    const pieces = tiles.slice(1);
    for (const t of pieces) {
      expect(t.x + t.w).toBeLessThanOrEqual(1024);
      expect(t.y + t.h).toBeLessThanOrEqual(682);
    }
    // todo pixel fica em algum pedaço
    const covered = (x: number, y: number) => pieces.some((t: Tile) => x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h);
    for (let y = 0; y < 682; y += 31) for (let x = 0; x < 1024; x += 31) expect(covered(x, y)).toBe(true);
    expect(covered(1023, 681)).toBe(true);
  });

  it('junta os pedaços: some a pessoa cortada que está dentro da inteira', () => {
    const full: Box = { x: 100, y: 100, w: 50, h: 120, cls: PERSON, score: 0.9 };
    const cut: Box = { x: 100, y: 100, w: 50, h: 40, cls: PERSON, score: 0.6 }; // só a cabeça, num pedaço
    const other: Box = { x: 400, y: 100, w: 50, h: 120, cls: PERSON, score: 0.5 };
    const bag: Box = { x: 105, y: 150, w: 20, h: 20, cls: 26, score: 0.5 }; // bolsa dentro da pessoa: outra classe, fica
    expect(iou(full, cut)).toBeLessThan(0.45); // o NMS sozinho deixaria passar
    expect(overlapSmaller(full, cut)).toBe(1);
    expect(mergeTiles([cut, full, other, bag])).toEqual([full, other, bag]);
  });

  it('conta pessoas e resume por classe', () => {
    const b = (cls: number, score: number): Box => ({ x: 0, y: 0, w: 1, h: 1, cls, score });
    const list = [b(0, 0.9), b(2, 0.8), b(0, 0.35), b(0, 0.5), b(2, 0.4), b(15, 0.7)];
    expect(countPersons(list)).toBe(3);
    expect(countPersons(list, 0.4)).toBe(2);
    expect(tally(list)).toEqual([
      [0, 3],
      [2, 2],
      [15, 1],
    ]);
  });
});

describe('YOLOX-Nano de verdade nas fotos de exemplo', () => {
  type Ort = typeof import('onnxruntime-web');
  let ort: Ort;
  let session: import('onnxruntime-web').InferenceSession;
  const jpeg = require('jpeg-js') as { decode: (b: Buffer, o: object) => { width: number; height: number; data: Uint8Array } };

  beforeAll(async () => {
    ort = (await import(require.resolve('onnxruntime-web'))) as Ort;
    ort.env.wasm.numThreads = 1;
    session = await ort.InferenceSession.create(readFileSync(`public/visao/models/${MODELS.yolox.file}`));
  });

  // Igual ao worker: cada pedaço (ou a foto toda) vai para o letterbox, e as caixas se juntam no fim.
  async function run(name: string, tensor = toTensor, tile?: number, minScore = 0.4, filter = true) {
    const img = jpeg.decode(readFileSync(`public/visao/exemplos/${name}.jpg`), { useTArray: true });
    const tiles = tile ? tileGrid(img.width, img.height, tile) : [{ x: 0, y: 0, w: img.width, h: img.height }];
    const found: Box[][] = [];
    for (const t of tiles) {
      const crop = new Uint8Array(t.w * t.h * 4);
      for (let y = 0; y < t.h; y++) {
        const start = ((t.y + y) * img.width + t.x) * 4;
        crop.set(img.data.subarray(start, start + t.w * 4), y * t.w * 4);
      }
      const lb = letterboxRgba(crop, t.w, t.h);
      const r = await session.run({ images: new ort.Tensor('float32', tensor(lb.rgba), [1, 3, INPUT, INPUT]) });
      // como o worker: tudo acima de 0,1; o limite da tela (minScore) só filtra no fim
      const opts = { scale: lb.scale, offsetX: t.x, offsetY: t.y, maxW: img.width, maxH: img.height, minScore: 0.1, skipNms: true };
      found.push(decode(r.output.data as Float32Array, opts));
    }
    const merged = filter ? combinePasses(found, tiles) : mergeTiles(found.flat());
    const boxes = merged.filter((b) => passes(b, minScore));
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(img.width + 1e-6);
      expect(b.y + b.h).toBeLessThanOrEqual(img.height + 1e-6);
    }
    return boxes;
  }
  const names = (boxes: Box[]) => new Set(boxes.map((b) => COCO_EN[b.cls]));

  it('rua: pessoas atravessando e carros', async () => {
    const boxes = await run('rua');
    expect(countPersons(boxes)).toBeGreaterThanOrEqual(5);
    expect(names(boxes)).toContain('car');
  });

  it('multidão: uma passada erra para menos; o mosaico acha bem mais gente', async () => {
    const plain = countPersons(await run('multidao'));
    const tiled = countPersons(await run('multidao', toTensor, 416));
    expect(plain).toBeGreaterThanOrEqual(8);
    expect(tiled).toBeGreaterThanOrEqual(plain * 2);
    expect(tiled).toBeLessThan(80);
  });

  // No navegador, o mosaico achou "1 pessoa" no café: um pedaço via só parte do croissant. Em Node a
  // nota dele fica em 0,25, então com limite 0,2 o caso se reproduz; o filtro de tamanho resolve.
  it('o mosaico não vira pessoa um objeto cortado no pedaço', async () => {
    expect(countPersons(await run('mesa', toTensor, 416, 0.2, false))).toBeGreaterThan(0); // sem combinePasses
    expect(countPersons(await run('mesa', toTensor, 416, 0.2))).toBe(0);
    expect(countPersons(await run('gato', toTensor, 416, 0.2))).toBe(0);
  });

  it('caixa só do pedaço precisa de margem; a confirmada pela foto inteira, não', () => {
    const tiles: Tile[] = [
      { x: 0, y: 0, w: 1000, h: 1000 },
      { x: 0, y: 0, w: 400, h: 400 },
    ];
    const person = (x: number, score: number): Box => ({ x, y: 10, w: 20, h: 50, cls: PERSON, score });
    const whole = [person(100, 0.15)]; // a foto inteira suspeitava (nota baixa)
    const piece = [person(101, 0.45), person(300, 0.45)]; // o pedaço confirma uma e acha outra sozinho
    const out = combinePasses([whole, piece], tiles);
    expect(out.map((b) => [b.x, b.tileOnly ?? false])).toEqual([
      [101, false],
      [300, true],
    ]);
    expect(countPersons(out, 0.4)).toBe(1); // 0,45 < 0,4 + margem
    expect(countPersons(out, 0.45 - TILE_MARGIN)).toBe(2);
  });

  it('filtro de tamanho do pedaço', () => {
    const t: Tile = { x: 0, y: 0, w: 100, h: 100 };
    const box = (w: number, h: number): Box => ({ x: 0, y: 0, w, h, cls: PERSON, score: 1 });
    expect(smallOnly([box(40, 50), box(50, 41), box(10, 10)], t)).toEqual([box(40, 50), box(10, 10)]);
  });

  it('o mosaico não inventa gente onde não há multidão', async () => {
    expect(countPersons(await run('retrato', toTensor, 416))).toBe(1);
    expect(countPersons(await run('gato', toTensor, 416))).toBe(0);
    const rua = countPersons(await run('rua', toTensor, 416));
    expect(rua).toBeGreaterThanOrEqual(5);
    expect(rua).toBeLessThanOrEqual(12);
  });

  it('gato e xícaras', async () => {
    const cat = await run('gato');
    expect(cat[0] && COCO_EN[cat[0].cls]).toBe('cat');
    expect(countPersons(cat)).toBe(0);
    expect(names(await run('mesa'))).toContain('cup');
  });

  it('o retrato tem uma pessoa só', async () => {
    expect(countPersons(await run('retrato'))).toBe(1);
  });

  // O erro que tive no começo: tratei o ONNX do release 0.1.1rc0 como o YOLOX antigo (RGB normalizado
  // pelo ImageNet). O modelo não acha nada assim; com BGR 0..255 acha. Fica como guarda.
  it('com o pré-processamento antigo não acha nada', async () => {
    const MEAN = [0.485, 0.456, 0.406];
    const STD = [0.229, 0.224, 0.225];
    const legacy = (rgba: Uint8ClampedArray | Uint8Array) => {
      const n = INPUT * INPUT;
      const t = new Float32Array(3 * n);
      for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) t[c * n + i] = (rgba[i * 4 + c] / 255 - MEAN[c]) / STD[c];
      return t;
    };
    expect(await run('rua', legacy)).toEqual([]);
  });
});

describe('cores', () => {
  it('hex e ida e volta RGB ↔ HSL', () => {
    expect(parseHex('#b5179e')).toEqual([181, 23, 158]);
    expect(() => parseHex('red')).toThrow();
    for (const c of [[0, 0, 0], [255, 255, 255], [181, 23, 158], [22, 163, 74], [12, 200, 199]] as [number, number, number][]) {
      expect(hslToRgb(...rgbToHsl(...c))).toEqual(c);
    }
  });
});

const pixels = (rgb: number[][]) => {
  const d = new Uint8ClampedArray(rgb.length * 4);
  rgb.forEach((p, i) => d.set([...p, 255], i * 4));
  return d;
};

describe('recolor', () => {
  it('não mexe onde a máscara é zero', () => {
    const d = pixels([[40, 30, 20], [50, 40, 30]]);
    const before = [...d];
    expect(recolor(d, new Float32Array([0, 0]), [200, 0, 0])).toBe(0);
    expect([...d]).toEqual(before);
  });

  it('região uniforme com máscara cheia vira a cor alvo', () => {
    const d = pixels([[40, 30, 20], [40, 30, 20]]);
    recolor(d, new Float32Array([1, 1]), parseHex('#2563eb'), 1);
    for (const o of [0, 4]) {
      [37, 99, 235].forEach((t, i) => expect(Math.abs(d[o + i] - t)).toBeLessThanOrEqual(1));
    }
  });

  it('mantém a textura: fio claro continua mais claro, com a mesma diferença de luminosidade', () => {
    const d = pixels([[30, 25, 20], [90, 75, 60]]);
    const [l1, l2] = [rgbToHsl(30, 25, 20)[2], rgbToHsl(90, 75, 60)[2]];
    recolor(d, new Float32Array([1, 1]), parseHex('#b5179e'), 1);
    const n1 = rgbToHsl(d[0], d[1], d[2])[2];
    const n2 = rgbToHsl(d[4], d[5], d[6])[2];
    expect(n2 - n1).toBeCloseTo(l2 - l1, 1);
    expect(meanLightness(d, new Float32Array([1, 1]))).toBeCloseTo(rgbToHsl(181, 23, 158)[2], 1);
  });

  it('a opacidade mistura com o original', () => {
    const d = pixels([[100, 100, 100]]);
    recolor(d, new Float32Array([1]), [200, 0, 0], 0.5);
    expect(d[0]).toBeGreaterThan(100);
    expect(d[0]).toBeLessThan(200);
  });

  it('reamostra a máscara com rampa', () => {
    const m = resampleMask(new Float32Array([0, 0.55, 1, 0.2]), 2, 2, 4, 4);
    expect(m[0]).toBe(0); // 0 → fora
    expect(m[3]).toBeCloseTo(0.5, 6); // 0,55 fica no meio da rampa 0,35..0,75
    expect(m[8]).toBe(1); // 1 → dentro
    expect(m[15]).toBe(0); // 0,2 < 0,35
  });
});

describe('máscara da íris', () => {
  // Rosto de mentira em 200 × 100: os dois olhos com íris de raio 10 px em (50, 50) e (150, 50).
  function face(lidTop = 0.3): Point[] {
    const pts: Point[] = Array.from({ length: 478 }, () => ({ x: 0, y: 0 }));
    for (const [eye, cx] of [
      [EYES[0], 50],
      [EYES[1], 150],
    ] as const) {
      eye.contour.forEach((idx, i) => {
        const a = (i / eye.contour.length) * 2 * Math.PI;
        const y = 50 + Math.sin(a) * 30;
        pts[idx] = { x: (cx + Math.cos(a) * 30) / 200, y: Math.max(lidTop * 100, y) / 100 };
      });
      pts[eye.iris.center] = { x: cx / 200, y: 0.5 };
      eye.iris.ring.forEach((idx, i) => {
        const a = (i / 4) * 2 * Math.PI;
        pts[idx] = { x: (cx + Math.cos(a) * 10) / 200, y: (50 + Math.sin(a) * 10) / 100 };
      });
    }
    return pts;
  }
  const v = (m: Float32Array, x: number, y: number) => m[y * 200 + x];

  it('pinta o anel e deixa a pupila e o branco do olho', () => {
    const m = irisMask(face(), 200, 100);
    expect(v(m, 50, 50)).toBe(0); // pupila
    expect(v(m, 57, 50)).toBe(1); // íris (raio 7, entre 4 e 10)
    expect(v(m, 63, 50)).toBe(0); // branco do olho
    expect(v(m, 157, 50)).toBe(1); // o outro olho também
    expect(PUPIL).toBeLessThan(0.7);
  });

  it('a pálpebra corta a íris', () => {
    const m = irisMask(face(0.46), 200, 100); // pálpebra de cima em y = 46
    expect(v(m, 50, 43)).toBe(0); // acima da pálpebra
    expect(v(m, 50, 57)).toBe(1); // abaixo da pupila, dentro do olho
  });

  it('sem os 478 pontos não pinta nada', () => {
    expect(irisMask(face().slice(0, 468), 200, 100).every((x) => x === 0)).toBe(true);
  });
});
