// Copia o runtime do MediaPipe Tasks Vision de node_modules para public/visao/vendor/, para a demo
// /demos/visao/ carregar tudo do próprio domínio (a CSP não aceita CDN). Roda antes do dev e do build.
// O ONNX Runtime não passa por aqui: o Vite empacota no worker do detector e publica o .wasm com hash.
// public/visao/vendor/ fica fora do git: a fonte é o package-lock. Os modelos (public/visao/models/)
// não estão no npm e ficam no git, com o SHA-256 conferido nos testes.
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
// o pacote não exporta o package.json; o bundle fica na raiz do pacote
const dir = dirname(require.resolve('@mediapipe/tasks-vision'));
const { version } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));

const OUT = 'public/visao/vendor/mediapipe';
rmSync('public/visao/vendor', { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// Com e sem SIMD: o FilesetResolver escolhe pelo navegador. Só a variante pedida é baixada.
const files = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm'];
let total = 0;
for (const f of files) {
  copyFileSync(join(dir, 'wasm', f), join(OUT, f));
  total += statSync(join(OUT, f)).size;
}
console.log(`copy-visao: @mediapipe/tasks-vision ${version} → ${OUT} (${(total / 1e6).toFixed(1)} MB)`);
