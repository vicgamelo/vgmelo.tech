// Copia o motor do OCR (tesseract.js) e o modelo em português de node_modules para public/ocr/vendor/,
// para a demo /demos/ocr/ carregar tudo do próprio domínio (a CSP não aceita CDN). Roda antes do dev e do build.
// public/ocr/vendor/ fica fora do git: a fonte é o package-lock.
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));
const version = (name) => JSON.parse(readFileSync(join(pkgDir(name), 'package.json'), 'utf8')).version;

const OUT = 'public/ocr/vendor';
const LANG = '4.0.0_best_int'; // o mesmo modelo que o tesseract.js usa por padrão
rmSync(OUT, { recursive: true, force: true });

const files = [
  [join(pkgDir('tesseract.js'), 'dist/worker.min.js'), 'worker.min.js'],
  // só as variantes LSTM (OEM 1); o worker escolhe a com relaxed SIMD, SIMD ou sem SIMD
  ...['relaxedsimd-lstm', 'simd-lstm', 'lstm'].map((v) => [
    join(pkgDir('tesseract.js-core'), `tesseract-core-${v}.wasm.js`),
    `core/tesseract-core-${v}.wasm.js`,
  ]),
  [join(pkgDir('@tesseract.js-data/por'), LANG, 'por.traineddata.gz'), `lang/por.traineddata.gz`],
];

let total = 0;
for (const [from, to] of files) {
  mkdirSync(dirname(join(OUT, to)), { recursive: true });
  copyFileSync(from, join(OUT, to));
  total += statSync(from).size;
}
console.log(
  `copy-ocr: tesseract.js ${version('tesseract.js')}, core ${version('tesseract.js-core')}, por ${LANG} → ${OUT} (${(total / 1e6).toFixed(1)} MB)`,
);
