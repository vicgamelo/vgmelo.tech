// Projeção 3D → 2D para o gráfico do PCA, sem biblioteca: gira o ponto (yaw em volta do eixo
// vertical, depois pitch em volta do horizontal) e aplica perspectiva simples.

export interface Camera {
  yaw: number; // radianos
  pitch: number; // radianos
  distance: number; // distância da câmera ao centro, em unidades do cubo [-1, 1]
}

export interface Projected {
  x: number; // coordenadas na tela, relativas ao centro, ainda sem escala
  y: number; // para cima é positivo
  depth: number; // maior = mais perto de quem olha
  scale: number; // fator de perspectiva (1 no centro)
}

export function rotate([x, y, z]: [number, number, number], cam: Camera): [number, number, number] {
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const y2 = y * cp - z1 * sp;
  const z2 = y * sp + z1 * cp;
  return [x1, y2, z2];
}

export function project(p: [number, number, number], cam: Camera): Projected {
  const [x, y, z] = rotate(p, cam);
  const scale = cam.distance / (cam.distance - z);
  return { x: x * scale, y: y * scale, depth: z, scale };
}

/** Índices em ordem de desenho: do mais longe para o mais perto. */
export function paintOrder(depths: number[]): number[] {
  return depths.map((_, i) => i).sort((a, b) => depths[a] - depths[b]);
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Índice do ponto mais perto de (x, y) dentro de `radius`, ou -1. */
export function nearest(points: { x: number; y: number; on: boolean }[], x: number, y: number, radius: number): number {
  let best = -1;
  let bestD = radius * radius;
  points.forEach((p, i) => {
    if (!p.on) return;
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
