// AR de cabelo e olhos com o MediaPipe Tasks Vision (Apache-2.0), no thread principal: o segmentador de
// cabelo dá a máscara e o Face Landmarker dá a íris. A troca de cor é o recolor.ts, em JS puro.
// Carregado só quando a aba do AR abre (import dinâmico), porque o MediaPipe pesa uns 4 MB comprimido.
import { FaceLandmarker, FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import { modelUrl } from './models';
import { irisMask, recolor, resampleMask, type Rgb } from './recolor';

export const MEDIAPIPE = '/visao/vendor/mediapipe';

export interface ArOptions {
  hair: Rgb | null; // null = não pinta
  eyes: Rgb | null;
  hairOpacity?: number;
  eyeOpacity?: number;
}

export interface ArFrame {
  hairPixels: number;
  eyePixels: number;
  face: boolean;
  ms: number;
}

export interface Ar {
  delegate: 'GPU' | 'CPU';
  // Lê o que está em `ctx` (o quadro já desenhado), acha cabelo e íris e pinta por cima.
  apply(ctx: CanvasRenderingContext2D, opts: ArOptions): ArFrame;
  close(): void;
}

async function make(delegate: 'GPU' | 'CPU'): Promise<Ar> {
  const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE);
  const hair = await ImageSegmenter.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: modelUrl('hair'), delegate },
    runningMode: 'VIDEO',
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  });
  const face = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: modelUrl('face'), delegate },
    runningMode: 'VIDEO',
    numFaces: 1,
  });
  // O modo VIDEO exige carimbos de tempo sempre crescentes, inclusive quando a fonte é uma foto.
  let last = 0;
  const stamp = () => (last = Math.max(last + 1, performance.now()));

  return {
    delegate,
    apply(ctx, opts) {
      const t0 = performance.now();
      const { width: w, height: h } = ctx.canvas;
      const src = ctx.canvas;
      const image = ctx.getImageData(0, 0, w, h);
      let hairPixels = 0;
      let eyePixels = 0;
      let found = false;
      if (opts.hair) {
        const r = hair.segmentForVideo(src, stamp());
        const masks = r.confidenceMasks ?? [];
        const m = masks[masks.length - 1]; // [fundo, cabelo]
        if (m) hairPixels = recolor(image.data, resampleMask(m.getAsFloat32Array(), m.width, m.height, w, h), opts.hair, opts.hairOpacity ?? 0.8);
        r.close();
      }
      if (opts.eyes) {
        const r = face.detectForVideo(src, stamp());
        const pts = r.faceLandmarks[0];
        if (pts) {
          found = true;
          eyePixels = recolor(image.data, irisMask(pts, w, h), opts.eyes, opts.eyeOpacity ?? 0.65);
        }
      }
      ctx.putImageData(image, 0, 0);
      return { hairPixels, eyePixels, face: found, ms: Math.round(performance.now() - t0) };
    },
    close() {
      hair.close();
      face.close();
    },
  };
}

// GPU (WebGL) quando dá; se o navegador não tiver WebGL2 ou falhar, cai para CPU.
export async function createAr(): Promise<Ar> {
  try {
    return await make('GPU');
  } catch {
    return make('CPU');
  }
}
