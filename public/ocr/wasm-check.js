// Roda como worker e recebe a mesma CSP do worker do Tesseract (/ocr/*). Responde se este contexto pode
// compilar WebAssembly; sem isso o Tesseract aborta dentro do worker e a página nunca fica sabendo.
try {
  new WebAssembly.Module(Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0));
  postMessage(true);
} catch {
  postMessage(false);
}
