// Corpo da demo de crédito. O portal valida com os mesmos campos do /predict do
// mlops-platform e recusa campo a mais ou a menos, então a lista tem que fechar.

// Campos que a demo não pergunta: valores comuns no dataset.
export const FIXED = {
  installment_commitment: 3,
  other_parties: 'none',
  residence_since: 2,
  property_magnitude: 'car',
  other_payment_plans: 'none',
  existing_credits: 1,
  job: 'skilled',
  num_dependents: 1,
  own_telephone: 'none',
} as const;

const ASKED = [
  'checking_status',
  'credit_history',
  'purpose',
  'savings_status',
  'employment',
  'housing',
  'duration',
  'credit_amount',
  'age',
] as const;
const NUMERIC = new Set(['duration', 'credit_amount', 'age']);

export function buildApplicant(form: Record<string, string>): Record<string, string | number> {
  const out: Record<string, string | number> = { ...FIXED };
  for (const key of ASKED) {
    const v = form[key] ?? '';
    out[key] = NUMERIC.has(key) ? Number(v) : v;
  }
  return out;
}
