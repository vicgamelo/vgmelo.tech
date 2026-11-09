// Mesma regra de mcp-server-brasil/src/mcp_server_brasil/documents.py, para rodar no navegador.
// CNPJ alfanumérico (IN RFB 2.229/2024): as 12 primeiras posições aceitam A-Z e cada caractere
// vale ord(c) - 48 no cálculo do módulo 11. "0".."9" continuam valendo 0..9.

const W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const W2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export interface DigitStep {
  chars: { char: string; value: number; weight: number; product: number }[];
  total: number;
  rest: number;
  digit: number;
}

export interface DocCheck {
  kind: 'CPF' | 'CNPJ' | 'unknown';
  valid: boolean;
  formatted: string | null;
  alphanumeric: boolean;
  steps?: [DigitStep, DigitStep];
  expected?: string;
}

const compact = (v: string) => v.replace(/[.\-/\s]/g, '').toUpperCase();

export function cnpjDigit(chars: string, weights: number[]): DigitStep {
  const rows = [...chars].map((char, i) => {
    const value = char.charCodeAt(0) - 48;
    return { char, value, weight: weights[i], product: value * weights[i] };
  });
  const total = rows.reduce((s, r) => s + r.product, 0);
  const rest = total % 11;
  return { chars: rows, total, rest, digit: rest < 2 ? 0 : 11 - rest };
}

export function checkCnpj(input: string): DocCheck {
  const v = compact(input);
  const base = { kind: 'CNPJ' as const, formatted: null, alphanumeric: !/^\d{12}/.test(v) };
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(v) || new Set(v).size === 1) return { ...base, valid: false };
  const s1 = cnpjDigit(v.slice(0, 12), W1);
  const s2 = cnpjDigit(v.slice(0, 12) + s1.digit, W2);
  const expected = `${s1.digit}${s2.digit}`;
  const valid = v.slice(12) === expected;
  return {
    ...base,
    valid,
    expected,
    steps: [s1, s2],
    formatted: valid ? `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}` : null,
  };
}

export function checkCpf(input: string): DocCheck {
  const v = input.replace(/\D/g, '');
  const base = { kind: 'CPF' as const, formatted: null, alphanumeric: false };
  if (v.length !== 11 || new Set(v).size === 1) return { ...base, valid: false };
  for (const size of [9, 10]) {
    let total = 0;
    for (let i = 0; i < size; i++) total += Number(v[i]) * (size + 1 - i);
    if (((total * 10) % 11) % 10 !== Number(v[size])) return { ...base, valid: false };
  }
  return { ...base, valid: true, formatted: `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9)}` };
}

export function checkDocument(input: string): DocCheck {
  const v = compact(input);
  if (v.length === 11 && /^\d+$/.test(v)) return checkCpf(v);
  if (v.length === 14) return checkCnpj(v);
  return { kind: 'unknown', valid: false, formatted: null, alphanumeric: false };
}
