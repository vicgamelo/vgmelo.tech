import { describe, expect, it } from 'vitest';
import { cameraError } from '../src/lib/camera';

describe('erro ao abrir a câmera', () => {
  it('permissão negada ou bloqueada pela Permissions-Policy', () => {
    expect(cameraError(new DOMException('x', 'NotAllowedError'))).toBe('denied');
    expect(cameraError(new DOMException('x', 'SecurityError'))).toBe('denied');
  });
  it('aparelho sem câmera', () => {
    expect(cameraError(new DOMException('x', 'NotFoundError'))).toBe('missing');
    expect(cameraError(new DOMException('x', 'OverconstrainedError'))).toBe('missing');
  });
  it('o resto (câmera em uso por outro app, valor estranho)', () => {
    expect(cameraError(new DOMException('x', 'NotReadableError'))).toBe('other');
    expect(cameraError('lixo')).toBe('other');
  });
});
