// Cérebro da home: neurônios em 3D, sinais correndo pelas sinapses e um neurônio maior para cada seção do site.
// Passar o mouse (ou dar foco no link) puxa os sinais para a seção; clicar mergulha no neurônio e abre a página.
// Os rótulos são links de verdade (teclado, leitor de tela, sem JS); o canvas é só a imagem.
// CSP: nada inline; posição dos rótulos por CSSOM (style.setProperty), que a CSP permite.
import { brainPoints, connect, facing, nearest, project, rng, stepToward, type Vec3 } from '../lib/brain';

const root = document.querySelector<HTMLElement>('[data-brain]');
if (root) start(root);

interface Hub {
  node: number;
  el: HTMLAnchorElement;
  glow: number;
}
interface Pulse {
  a: number;
  b: number;
  t: number;
  target: number;
  hops: number;
}

function start(root: HTMLElement) {
  const canvas = root.querySelector('canvas')!;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = matchMedia('(max-width: 640px)').matches;
  const rand = rng(11);
  const brain = connect(brainPoints(small ? 520 : 900), 3);
  const links = [...root.querySelectorAll<HTMLAnchorElement>('a[data-x]')];
  const used = new Set<number>();
  const hubs: Hub[] = links.map((el) => {
    const p: Vec3 = { x: Number(el.dataset.x), y: Number(el.dataset.y), z: Number(el.dataset.z) };
    const node = nearest(brain.nodes, p, used);
    used.add(node);
    return { node, el, glow: 0 };
  });
  root.classList.add('live');
  // Pausa manual (WCAG 2.2.2): o balanço e os sinais não rodam para sempre sem controle.
  const pauseBtn = root.querySelector<HTMLButtonElement>('.pause');
  let userPaused = false;
  if (pauseBtn && !reduce) {
    pauseBtn.hidden = false;
    pauseBtn.addEventListener('click', () => {
      userPaused = !userPaused;
      pauseBtn.setAttribute('aria-pressed', String(userPaused));
      pauseBtn.setAttribute('aria-label', (userPaused ? pauseBtn.dataset.play : pauseBtn.dataset.pause) ?? '');
      if (userPaused) pause();
      else if (visible && !document.hidden) play();
    });
  }
  // Largura de cada rótulo, medida só no resize (ler offsetWidth a cada quadro força layout).
  let labelW: number[] = [];

  let W = 0;
  let H = 0;
  let dpr = 1;
  let colors = readColors();
  // Vista lateral (a mais reconhecível), balançando devagar; arrastar gira e depois volta.
  const SIDE = -Math.PI / 2 + 0.25;
  let yaw = SIDE;
  let pitch = 0.18;
  let vyaw = 0;
  let offset = 0;
  let clock = 0;
  let dist = 3.4;
  let active = -1; // hub sob o mouse/foco
  let dive: { from: { yaw: number; pitch: number; dist: number }; to: { yaw: number; pitch: number }; t0: number; href: string } | null = null;
  const pulses: Pulse[] = [];
  let lastSpawn = 0;
  let running = false;
  let visible = true;
  let raf = 0;
  let last = performance.now();

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string) => cs.getPropertyValue(n).trim();
    return {
      ink: v('--text'),
      muted: v('--muted'),
      line: v('--line-strong'),
      hot: v('--accent-fill'),
      cool: v('--accent2'),
      dark: matchMedia('(prefers-color-scheme: dark)').matches,
    };
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    colors = readColors();
    draw();
  });

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width;
    H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    labelW = hubs.map((h) => h.el.offsetWidth);
    draw();
  };
  new ResizeObserver(resize).observe(canvas);

  // Projeção de todos os neurônios no quadro atual.
  let proj: { x: number; y: number; z: number; s: number }[] = [];
  const scaleNow = () => Math.min(W, H * 1.15) * (small ? 0.36 : 0.41);

  function spawn(now: number) {
    if (reduce || pulses.length > (small ? 22 : 40) || now - lastSpawn < 90) return;
    lastSpawn = now;
    const target = active >= 0 ? hubs[active].node : hubs[Math.floor(rand() * hubs.length)].node;
    const a = Math.floor(rand() * brain.nodes.length);
    const b = stepToward(brain, a, target, rand);
    if (b >= 0) pulses.push({ a, b, t: 0, target, hops: 0 });
  }

  function update(dt: number, now: number) {
    if (dive) {
      const k = Math.min(1, (now - dive.t0) / 750);
      const e = 1 - Math.pow(1 - k, 3);
      yaw = dive.from.yaw + (dive.to.yaw - dive.from.yaw) * e;
      pitch = dive.from.pitch + (dive.to.pitch - dive.from.pitch) * e;
      dist = dive.from.dist + (1.25 - dive.from.dist) * e;
      root.style.setProperty('--dive', String(e));
      if (k >= 1) {
        const href = dive.href;
        dive = null;
        location.href = href;
      }
      return;
    }
    if (!dragging && !reduce) {
      vyaw *= 0.94;
      offset += vyaw * dt;
      offset *= 0.997; // volta aos poucos para a vista lateral
      clock += dt;
      yaw = SIDE + 0.55 * Math.sin(clock / 5200) + offset;
      pitch += (0.18 - pitch) * 0.01;
    }
    for (const h of hubs) h.glow = Math.max(0, h.glow - dt * 0.0015);
    spawn(now);
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.t += dt * 0.006;
      if (p.t < 1) continue;
      if (p.b === p.target) {
        const h = hubs.find((x) => x.node === p.target);
        if (h) h.glow = 1;
        pulses.splice(i, 1);
        continue;
      }
      if (p.hops > 40) {
        pulses.splice(i, 1);
        continue;
      }
      const next = stepToward(brain, p.b, p.target, rand, p.a);
      p.a = p.b;
      p.b = next;
      p.t = 0;
      p.hops++;
    }
  }

  function draw() {
    if (!W) return;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, W, H);
    const scale = scaleNow() * (3.4 / dist) ** 0.35;
    const cx = W / 2;
    const cy = H / 2;
    // brilho próprio atrás do cérebro
    const g = ctx!.createRadialGradient(cx, cy, 0, cx, cy, scale * 1.25);
    g.addColorStop(0, colors.hot);
    g.addColorStop(1, 'transparent');
    ctx!.globalAlpha = colors.dark ? 0.13 : 0.1;
    ctx!.fillStyle = g;
    ctx!.fillRect(0, 0, W, H);
    proj = brain.nodes.map((p) => project(p, yaw, pitch, dist, scale, cx, cy));

    // sinapses: três faixas de profundidade, cada uma num único traço
    ctx!.lineWidth = colors.dark ? 0.8 : 0.7;
    ctx!.strokeStyle = colors.line;
    const boost = colors.dark ? 1.3 : 1;
    for (const [lo, hi, alpha] of [
      [-9, -0.3, 0.22],
      [-0.3, 0.4, 0.45],
      [0.4, 9, 0.75],
    ] as const) {
      ctx!.globalAlpha = Math.min(1, alpha * boost);
      ctx!.beginPath();
      for (const [i, j] of brain.edges) {
        const z = (proj[i].z + proj[j].z) / 2;
        if (z < lo || z >= hi) continue;
        ctx!.moveTo(proj[i].x, proj[i].y);
        ctx!.lineTo(proj[j].x, proj[j].y);
      }
      ctx!.stroke();
    }

    // neurônios
    ctx!.fillStyle = colors.ink;
    for (const q of proj) {
      ctx!.globalAlpha = 0.25 + Math.max(0, Math.min(1, (q.z + 1.2) / 2.4)) * 0.6;
      const r = 1.6 * q.s;
      ctx!.fillRect(q.x - r / 2, q.y - r / 2, r, r);
    }

    // sinais
    ctx!.globalAlpha = 1;
    ctx!.fillStyle = colors.hot;
    for (const p of pulses) {
      const A = proj[p.a];
      const B = proj[p.b];
      const x = A.x + (B.x - A.x) * p.t;
      const y = A.y + (B.y - A.y) * p.t;
      const a = 0.5 + Math.max(0, (A.z + 1) / 2) * 0.5;
      // rastro: o trecho da sinapse já percorrido acende
      ctx!.globalAlpha = a * 0.7;
      ctx!.strokeStyle = colors.hot;
      ctx!.lineWidth = 1.4;
      ctx!.beginPath();
      ctx!.moveTo(A.x + (B.x - A.x) * Math.max(0, p.t - 0.6), A.y + (B.y - A.y) * Math.max(0, p.t - 0.6));
      ctx!.lineTo(x, y);
      ctx!.stroke();
      ctx!.globalAlpha = a;
      ctx!.beginPath();
      ctx!.arc(x, y, 2.1 * A.s, 0, Math.PI * 2);
      ctx!.fill();
    }

    // seções: neurônio maior, anel e rótulo (link) acompanhando
    const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
    const order = hubs.map((_, i) => i).sort((a, b) => proj[hubs[b].node].z - proj[hubs[a].node].z);
    for (const i of order) {
      const h = hubs[i];
      const q = proj[h.node];
      const on = i === active;
      const front = q.z > -0.15;
      ctx!.globalAlpha = front ? 1 : 0.45;
      const r = (on ? 6.5 : 4.5) * q.s;
      if (h.glow > 0 || on) {
        ctx!.globalAlpha = (front ? 0.35 : 0.15) * Math.max(h.glow, on ? 1 : 0);
        ctx!.fillStyle = colors.hot;
        ctx!.beginPath();
        ctx!.arc(q.x, q.y, r * 3, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.globalAlpha = front ? 1 : 0.45;
      }
      ctx!.fillStyle = on ? colors.hot : colors.ink;
      ctx!.beginPath();
      ctx!.arc(q.x, q.y, r, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.strokeStyle = colors.hot;
      ctx!.lineWidth = 1.5;
      ctx!.beginPath();
      ctx!.arc(q.x, q.y, r + 4, 0, Math.PI * 2);
      ctx!.stroke();
      h.el.style.setProperty('--lx', `${q.x.toFixed(1)}px`);
      h.el.style.setProperty('--ly', `${q.y.toFixed(1)}px`);
      h.el.classList.toggle('back', !front);
      // rótulo vira para a esquerda quando passaria da borda direita (e não vira se aí passasse da esquerda)
      const w = labelW[i] ?? 0;
      const flip = q.x + 18 + w > W && q.x - 12 - w >= 0;
      h.el.classList.toggle('flip', flip);
      // da frente para trás: quem colide com um rótulo já posto some (menos o ativo)
      const box = { x0: flip ? q.x - 12 - w : q.x + 12, x1: flip ? q.x - 12 : q.x + 12 + w, y0: q.y - 13, y1: q.y + 13 };
      const hit = placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0);
      h.el.classList.toggle('hide', hit && i !== active);
      if (!hit || i === active) placed.push(box);
    }
    ctx!.globalAlpha = 1;
  }

  function frame(now: number) {
    const dt = Math.min(48, now - last);
    last = now;
    update(dt, now);
    draw();
    if (running) raf = requestAnimationFrame(frame);
  }
  function play() {
    if (running || reduce || (userPaused && !dive)) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function pause() {
    running = false;
    cancelAnimationFrame(raf);
  }
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !document.hidden) play();
    else pause();
  }).observe(root);
  document.addEventListener('visibilitychange', () => (document.hidden || !visible ? pause() : play()));

  // Arrastar gira (no toque, só na horizontal: a rolagem vertical da página continua).
  let dragging = false;
  let moved = 0;
  let px = 0;
  let py = 0;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    moved = 0;
    px = e.clientX;
    py = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    if (dragging) {
      const dx = e.clientX - px;
      const dy = e.clientY - py;
      px = e.clientX;
      py = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      offset += dx * 0.006;
      yaw = SIDE + 0.55 * Math.sin(clock / 5200) + offset;
      vyaw = dx * 0.00025;
      if (e.pointerType !== 'touch') pitch = Math.max(-0.7, Math.min(0.9, pitch + dy * 0.004));
      if (!running) draw();
      return;
    }
    // mouse perto de uma seção: acende e puxa os sinais
    const best = hubAt(e.clientX - r.left, e.clientY - r.top);
    setActive(best);
    canvas.style.setProperty('cursor', best >= 0 ? 'pointer' : 'grab');
  });
  const endDrag = () => (dragging = false);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => setActive(-1));
  canvas.addEventListener('click', (e) => {
    if (moved > 6) return; // foi um arraste, não um clique
    const r = canvas.getBoundingClientRect();
    const i = hubAt(e.clientX - r.left, e.clientY - r.top, 34);
    if (i >= 0) go(hubs[i].el.href);
  });

  function hubAt(x: number, y: number, radius = 26) {
    let best = -1;
    let bd = radius * radius;
    hubs.forEach((h, i) => {
      const q = proj[h.node];
      if (!q || q.z < -0.15) return;
      const d = (q.x - x) ** 2 + (q.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  function setActive(i: number) {
    if (active === i) return;
    active = i;
    hubs.forEach((h, j) => h.el.classList.toggle('on', j === i));
    if (!running) draw();
  }

  links.forEach((el, i) => {
    el.addEventListener('pointerenter', () => setActive(i));
    el.addEventListener('pointerleave', () => setActive(-1));
    el.addEventListener('focus', () => {
      setActive(i);
      // Só no foco por teclado: com mouse/toque o giro tiraria o rótulo de baixo do cursor antes do clique.
      if (!el.matches(':focus-visible')) return;
      // traz a seção para a frente
      const f = facing(brain.nodes[hubs[i].node]);
      offset = f.yaw - SIDE - 0.55 * Math.sin(clock / 5200);
      yaw = f.yaw;
      pitch = Math.max(-0.5, Math.min(0.7, f.pitch));
      if (!running) draw();
    });
    el.addEventListener('blur', () => setActive(-1));
    el.addEventListener('click', (e) => {
      if (reduce || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      go(el.href);
    });
  });

  // Mergulho: gira até o neurônio ficar de frente e aproxima a câmera; depois abre a página.
  function go(href: string) {
    if (reduce) {
      location.href = href;
      return;
    }
    const i = hubs.findIndex((h) => h.el.href === href);
    const f = facing(brain.nodes[hubs[i].node]);
    // menor caminho no giro
    let ty = f.yaw;
    while (ty - yaw > Math.PI) ty -= Math.PI * 2;
    while (ty - yaw < -Math.PI) ty += Math.PI * 2;
    dive = { from: { yaw, pitch, dist }, to: { yaw: ty, pitch: f.pitch }, t0: performance.now(), href };
    root.classList.add('diving');
    setActive(i);
    play();
  }

  // Ao voltar pelo histórico (bfcache), sai do mergulho.
  addEventListener('pageshow', () => {
    dive = null;
    dist = 3.4;
    root.classList.remove('diving');
    root.style.setProperty('--dive', '0');
    draw();
  });

  resize();
  if (reduce) draw();
}
