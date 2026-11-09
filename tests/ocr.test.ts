// Casos do ocr-brasil (tests/boleto.test.ts e tests/extract.test.ts), para a cópia em src/lib/ocr não divergir.
// O OCR de verdade (Tesseract nas imagens de exemplo) é testado no repo do ocr-brasil.
import { describe, expect, it } from 'vitest';
import { checkCnpj as siteCnpj, checkCpf as siteCpf } from '../src/lib/cnpj';
import { checkBoleto } from '../src/lib/ocr/boleto';
import { checkCnpj, checkCpf } from '../src/lib/ocr/documents';
import { extractDocuments, type BoletoFinding, type DocFinding } from '../src/lib/ocr/extract';

const TODAY = new Date('2026-11-09T12:00:00Z');

describe('OCR: boleto', () => {
  it('bancário, arrecadação e campo errado', () => {
    const b = checkBoleto('23790.44809 56168.623793 36011.058009 7 40430000124020', TODAY)!;
    expect(b).toMatchObject({ kind: 'bancario', valid: true, amountCents: 124020, dueDate: '2033-06-23' });
    expect(checkBoleto('836400000011331201380002812884627116080136181551')).toMatchObject({ valid: true, amountCents: 13312 });
    const bad = checkBoleto('23790448095616862379436011058009740430000124020', TODAY)!;
    expect(bad.fields.map((f) => f.ok)).toEqual([true, false, true]);
  });
});

describe('OCR: extração', () => {
  it('corrige O e l só quando o dígito confirma', () => {
    const [f] = extractDocuments('CNPJ 11.222.333/OOO1-8l') as DocFinding[];
    expect(f).toMatchObject({ valid: true, doc: { formatted: '11.222.333/0001-81' } });
    expect(f.corrections).toHaveLength(4);
  });

  it('linha digitável com ruído e CPF colado no rótulo', () => {
    const [b, cpf] = extractDocuments('TO 2379O.448O9 56l68 .623793 36011.O58OO9 7 4O43OOOO124O2O\nCPF529.982.247-25', {
      today: TODAY,
    }) as [BoletoFinding, DocFinding];
    expect(b.valid).toBe(true);
    expect(cpf).toMatchObject({ type: 'CPF', valid: true });
  });

  it('não inventa documento em texto comum', () => {
    expect(extractDocuments('Telefone (11) 98765-4321 pedido 12345678901 SIGOBTZSBGQ')).toEqual([]);
  });
});

describe('OCR: mesma regra do validador de CNPJ do site', () => {
  it.each(['11.222.333/0001-81', '12.ABC.345/01DE-35', '12.ABC.345/01DE-36', '00000000000000', '12ABC34501DEAB'])('%s', (v) => {
    expect(checkCnpj(v).valid).toBe(siteCnpj(v).valid);
  });
  it.each(['529.982.247-25', '529.982.247-24', '111.111.111-11'])('%s', (v) => {
    expect(checkCpf(v).valid).toBe(siteCpf(v).valid);
  });
});
