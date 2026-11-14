// Geometria do cérebro da home: pontos (neurônios), ligações (sinapses) e projeção em perspectiva.
// Sem dependência e sem DOM, para dar para testar no vitest.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Brain {
  nodes: Vec3[];
  edges: [number, number][];
  neighbors: number[][];
}

/** PRNG determinístico (mulberry32): o cérebro sai igual em toda visita. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pontos num formato de cérebro: dois hemisférios com a fenda no meio, dobras (giros) na superfície, lobo temporal
 * descendo na frente, fissura lateral e sulco central abertos, cerebelo atrás e embaixo e o tronco descendo.
 * x = esquerda/direita, y = cima, z = frente.
 */
export function brainPoints(count: number, seed = 7): Vec3[] {
  const rand = rng(seed);
  const pts: Vec3[] = [];
  const cerebellum = Math.round(count * 0.11);
  const stem = Math.round(count * 0.03);
  const cortex = count - cerebellum - stem;
  let guard = 0;
  while (pts.length < cortex && guard++ < count * 50) {
    const u = rand() * 2 - 1;
    const th = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    let x = s * Math.cos(th);
    let y = u;
    let z = s * Math.sin(th);
    const inner = rand() < 0.08;
    const shell = inner ? 0.3 + rand() * 0.5 : 0.95 + rand() * 0.05;
    // giros: ondulação em duas frequências
    const fold = 1 + 0.06 * Math.sin(11 * z + 4 * y) * Math.cos(9 * y - 3 * x) + 0.03 * Math.sin(23 * (z + y));
    x *= 0.86 * shell * fold;
    y *= 0.72 * shell * fold;
    z *= 1.2 * shell * fold;
    // occipital um pouco mais estreito, frontal mais alto
    y += 0.08 * z;
    if (y < -0.28) y = -0.28 + (y + 0.28) * 0.4; // base achatada
    // lobo temporal: desce na frente-meio
    if (z > -0.35 && z < 0.75 && y < 0 && Math.abs(x) > 0.35) y -= 0.16 * Math.sin(((z + 0.35) / 1.1) * Math.PI);
    if (!inner) {
      // fissura lateral (Sylvius) e sulco central: faixas sem neurônio na superfície
      const sylv = 0.02 + 0.32 * (0.55 - z);
      if (Math.abs(x) > 0.45 && z > -0.25 && z < 0.8 && Math.abs(y - sylv * 0.5) < 0.035) continue;
      if (y > 0.05 && Math.abs(z - (0.08 - 0.3 * y)) < 0.028) continue;
    }
    x += Math.sign(x || 1) * 0.07; // fenda entre os hemisférios
    y += 0.12;
    pts.push({ x, y, z });
  }
  while (pts.length < cortex + cerebellum) {
    const u = rand() * 2 - 1;
    const th = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const r = 0.92 + rand() * 0.08;
    const ridge = 1 + 0.05 * Math.sin(30 * u); // folhas finas do cerebelo
    pts.push({
      x: s * Math.cos(th) * 0.55 * r * ridge,
      y: -0.36 + u * 0.2 * r * ridge,
      z: -0.78 + s * Math.sin(th) * 0.32 * r,
    });
  }
  while (pts.length < count) {
    const k = rand();
    const th = rand() * Math.PI * 2;
    pts.push({ x: Math.cos(th) * 0.11, y: -0.3 - k * 0.42, z: -0.32 - k * 0.12 + Math.sin(th) * 0.11 });
  }
  return pts;
}

/** Liga cada neurônio aos k mais próximos (sem repetir ligação). */
export function connect(nodes: Vec3[], k = 3, maxLen = 0.24): Brain {
  const n = nodes.length;
  const seen = new Set<number>();
  const edges: [number, number][] = [];
  const neighbors: number[][] = nodes.map(() => []);
  for (let i = 0; i < n; i++) {
    const d: [number, number][] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const dz = nodes[i].z - nodes[j].z;
      d.push([dx * dx + dy * dy + dz * dz, j]);
    }
    d.sort((a, b) => a[0] - b[0]);
    for (const [d2, j] of d.slice(0, k)) {
      if (d2 > maxLen * maxLen) break;
      const key = i < j ? i * n + j : j * n + i;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([i, j]);
      neighbors[i].push(j);
      neighbors[j].push(i);
    }
  }
  return { nodes, edges, neighbors };
}

/** Índice do neurônio mais próximo de um ponto (para ancorar as seções do site em regiões do cérebro). */
export function nearest(nodes: Vec3[], p: Vec3, skip: Set<number> = new Set()): number {
  let best = -1;
  let bd = Infinity;
  nodes.forEach((q, i) => {
    if (skip.has(i)) return;
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2 + (q.z - p.z) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** Próximo passo de um sinal: o vizinho que mais aproxima do alvo (com um pouco de acaso). */
export function stepToward(b: Brain, from: number, target: number, rand: () => number, prev = -1): number {
  const t = b.nodes[target];
  const opts = b.neighbors[from].filter((j) => j !== prev);
  if (!opts.length) return prev;
  let best = opts[0];
  let bd = Infinity;
  for (const j of opts) {
    const q = b.nodes[j];
    const d = (q.x - t.x) ** 2 + (q.y - t.y) ** 2 + (q.z - t.z) ** 2 + rand() * 0.04;
    if (d < bd) {
      bd = d;
      best = j;
    }
  }
  return best;
}

/** Gira (yaw em Y, depois pitch em X) e projeta em perspectiva. Devolve x/y em pixels e a profundidade. */
export function project(p: Vec3, yaw: number, pitch: number, dist: number, scale: number, cx: number, cy: number) {
  const cyaw = Math.cos(yaw);
  const syaw = Math.sin(yaw);
  const x1 = p.x * cyaw + p.z * syaw;
  const z1 = -p.x * syaw + p.z * cyaw;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const y2 = p.y * cp - z1 * sp;
  const z2 = p.y * sp + z1 * cp;
  const persp = dist / (dist - z2);
  return { x: cx + x1 * scale * persp, y: cy - y2 * scale * persp, z: z2, s: persp };
}

/** Ângulos que trazem um ponto para a frente da câmera (para o mergulho no neurônio). */
export function facing(p: Vec3) {
  const yaw = Math.atan2(-p.x, p.z);
  const r = Math.hypot(p.x, p.z);
  const pitch = Math.atan2(p.y, r);
  return { yaw, pitch };
}
