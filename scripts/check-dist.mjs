// Roda depois do build. Falha se:
// - existir <script> inline executável (a CSP do Caddy é script-src 'self');
// - existir handler inline (onclick=...) ou href javascript:;
// - algum link interno apontar para página ou arquivo que não existe.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.html')) files.push(p);
  }
};
walk(DIST);

const errors = [];
// Rotas servidas pelo portal (não existem no build estático).
const external = [/^\/api\//, /^\/admin/];

const exists = (path) => {
  const clean = decodeURI(path.split('#')[0].split('?')[0]);
  if (!clean || external.some((r) => r.test(clean))) return true;
  const target = join(DIST, clean);
  return (
    (existsSync(target) && statSync(target).isFile()) ||
    existsSync(join(target, 'index.html')) ||
    existsSync(`${target}.html`)
  );
};

for (const file of files) {
  const html = readFileSync(file, 'utf8');
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    if (/\bsrc=/.test(attrs) || /type="application\/ld\+json"/.test(attrs)) continue;
    if (m[2].trim()) errors.push(`${file}: script inline (${m[2].trim().slice(0, 60)}…)`);
  }
  for (const m of html.matchAll(/\s(on[a-z]+)=["']/gi)) errors.push(`${file}: handler inline ${m[1]}`);
  if (/href=["']\s*javascript:/i.test(html)) errors.push(`${file}: href javascript:`);
  for (const m of html.matchAll(/\s(?:href|src)="(\/[^"]*)"/g)) {
    if (m[1].startsWith('//')) continue;
    if (!exists(m[1])) errors.push(`${file}: link quebrado ${m[1]}`);
  }
}

if (errors.length) {
  console.error(`check-dist: ${errors.length} problema(s)\n${errors.join('\n')}`);
  process.exit(1);
}
console.log(`check-dist: ${files.length} páginas ok (sem script inline, links internos válidos)`);
