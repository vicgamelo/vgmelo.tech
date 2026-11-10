// Câmera das demos que leem foto (OCR): abre o vídeo, tira a foto e explica por que não abriu.

export type CameraError = 'denied' | 'missing' | 'other';

/** Motivo de o getUserMedia ter falhado, para a mensagem certa na tela. */
export function cameraError(e: unknown): CameraError {
  const name = e instanceof DOMException || e instanceof Error ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'missing';
  return 'other';
}

/** Sem HTTPS (ou num navegador antigo) não existe mediaDevices: aí o botão nem aparece. */
export const hasCamera = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/** Câmera de trás e resolução alta: o OCR precisa dos dígitos com uns 20 px de altura. */
export function openCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: false,
  });
}

export function stopStream(s: MediaStream | null) {
  s?.getTracks().forEach((t) => t.stop());
}
