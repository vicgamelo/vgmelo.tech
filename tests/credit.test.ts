// Agente de coleta e CSV de teste da demo de crédito. O domínio e as faixas são os de
// mlops-platform/src/mlops_platform/schema.py; os erros plantados batem com os códigos de lá.
import { describe, expect, it } from 'vitest';
import {
  FIELD,
  FIELDS,
  PLANTED,
  PRESETS,
  afterGate,
  nextField,
  parseAnswer,
  parseNumber,
  pct,
  pp,
  sampleCsv,
  show,
  toCsv,
  type Draft,
} from '../src/lib/credit';

// Domínio do credit-g (OpenML v1), copiado de schema.py.
const DOMAIN: Record<string, string[]> = {
  checking_status: ['<0', '0<=X<200', '>=200', 'no checking'],
  credit_history: ['no credits/all paid', 'all paid', 'existing paid', 'delayed previously', 'critical/other existing credit'],
  purpose: ['new car', 'used car', 'furniture/equipment', 'radio/tv', 'domestic appliance', 'repairs', 'education', 'retraining', 'business', 'other'],
  savings_status: ['<100', '100<=X<500', '500<=X<1000', '>=1000', 'no known savings'],
  employment: ['unemployed', '<1', '1<=X<4', '4<=X<7', '>=7'],
  other_parties: ['none', 'co applicant', 'guarantor'],
  property_magnitude: ['real estate', 'life insurance', 'car', 'no known property'],
  other_payment_plans: ['bank', 'stores', 'none'],
  housing: ['rent', 'own', 'for free'],
  job: ['unemp/unskilled non res', 'unskilled resident', 'skilled', 'high qualif/self emp/mgmt'],
  own_telephone: ['none', 'yes'],
};
const BOUNDS: Record<string, [number, number]> = {
  duration: [1, 120], credit_amount: [0, 1_000_000], installment_commitment: [1, 4], residence_since: [1, 4],
  age: [18, 100], existing_credits: [0, 10], num_dependents: [0, 10],
};

function parseCsv(text: string): string[][] {
  // Suficiente para o que o gerador escreve (aspas com "" dentro, sem quebra de linha em célula).
  return text.trimEnd().split('\n').map((line) => {
    const out: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') (cur += '"'), i++;
        else if (c === '"') quoted = false;
        else cur += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') out.push(cur), (cur = '');
      else cur += c;
    }
    out.push(cur);
    return out;
  });
}

describe('contrato', () => {
  it('as categorias e faixas batem com o schema do modelo', () => {
    expect(FIELDS).toHaveLength(18);
    for (const f of FIELDS) {
      if (f.kind === 'cat') expect(f.options!.map((o) => o.value).sort()).toEqual([...DOMAIN[f.name]].sort());
      else expect([f.min, f.max]).toEqual(BOUNDS[f.name]);
    }
    expect(FIELD.credit_amount.minExclusive).toBe(true);
  });
});

describe('agente de coleta', () => {
  const ask = (name: string, text: string, lang: 'pt' | 'en' = 'pt') => parseAnswer(FIELD[name], text, lang);

  it.each([
    ['5.000', 5000],
    ['R$ 5.000,50', 5000.5],
    ['5,000.50', 5000.5],
    ['2,5', 2.5],
    ['1.5', 1.5],
    ['5 mil', 5000],
    ['3k', 3000],
    ['uns 12000 marcos', 12000],
  ])('número %s → %d', (text, n) => expect(parseNumber(text)).toBe(n));

  it('entende sinônimos e frases', () => {
    expect(ask('housing', 'moro de aluguel')).toEqual({ ok: true, value: 'rent' });
    expect(ask('housing', 'Casa PRÓPRIA')).toEqual({ ok: true, value: 'own' });
    expect(ask('checking_status', 'não tenho conta')).toEqual({ ok: true, value: 'no checking' });
    expect(ask('own_telephone', 'não tenho')).toEqual({ ok: true, value: 'none' });
    expect(ask('own_telephone', 'sim')).toEqual({ ok: true, value: 'yes' });
    expect(ask('purpose', 'quero trocar a geladeira')).toEqual({ ok: true, value: 'domestic appliance' });
    expect(ask('purpose', 'used car', 'en')).toEqual({ ok: true, value: 'used car' });
    expect(ask('purpose', '4')).toEqual({ ok: true, value: 'radio/tv' }); // número da opção
  });

  it('prazo em anos vira meses', () => {
    expect(ask('duration', '2 anos')).toEqual({ ok: true, value: 24 });
    expect(ask('duration', '36 meses')).toEqual({ ok: true, value: 36 });
  });

  it('"não sei" vira null, que o pipeline imputa', () => {
    expect(ask('age', 'não sei')).toEqual({ ok: true, value: null });
    expect(ask('purpose', "don't know", 'en')).toEqual({ ok: true, value: null });
  });

  it('recusa fora da faixa do modelo, não inteiro e o que não entendeu, com dica', () => {
    for (const [name, text] of [['age', '12'], ['age', '30.5'], ['credit_amount', '0'], ['duration', 'muito'], ['housing', 'barraca']]) {
      const r = ask(name, text);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.hint.length).toBeGreaterThan(5);
    }
    const r = ask('age', '12', 'en');
    expect(!r.ok && r.hint).toContain('between 18 and 100');
  });

  it('pergunta na ordem e pula o que já tem resposta, inclusive "não sei"', () => {
    const draft: Draft = {};
    expect(nextField(draft)?.name).toBe('purpose');
    draft.purpose = 'radio/tv';
    draft.credit_amount = null;
    expect(nextField(draft)?.name).toBe('duration');
    expect(nextField({ ...PRESETS.low })).toBeNull();
  });

  it('mostra valores em palavras', () => {
    expect(show('housing', 'rent', 'pt')).toBe('alugada');
    expect(show('duration', 24, 'en')).toBe('24 months');
    expect(show('credit_amount', 5000.5, 'pt')).toBe('5.000,5 DM');
    expect(show('age', null, 'pt')).toBe('não sei');
    expect(pct(0.9292, 'pt')).toBe('92,9%');
    expect(pp(0.1963, 'en')).toBe('+19.6 p.p.');
    expect(pp(-0.05, 'pt')).toBe('-5,0 p.p.');
  });
});

describe('CSV de teste', () => {
  it('o válido tem cabeçalho certo e só valores do domínio, dentro da faixa do treino', () => {
    const rows = parseCsv(sampleCsv('valid'));
    const [header, ...data] = rows;
    expect(header).toEqual(['id', ...FIELDS.map((f) => f.name)]);
    expect(data).toHaveLength(20);
    for (const row of data) {
      expect(row).toHaveLength(header.length);
      FIELDS.forEach((f, i) => {
        const v = row[i + 1];
        if (f.kind === 'cat') expect(DOMAIN[f.name]).toContain(v);
        else {
          const n = Number(v);
          expect(Number.isInteger(n)).toBe(true);
          expect(n).toBeGreaterThanOrEqual(f.train![0]);
          expect(n).toBeLessThanOrEqual(f.train![1]);
        }
      });
    }
  });

  it('é reproduzível pela semente', () => {
    expect(sampleCsv('valid')).toBe(sampleCsv('valid'));
    expect(sampleCsv('valid', 20, 1)).not.toBe(sampleCsv('valid', 20, 2));
  });

  it('o com erros planta um erro por linha a partir da linha 3, mais coluna protegida e campo a mais', () => {
    const [header, ...data] = parseCsv(sampleCsv('errors'));
    expect(header.at(-1)).toBe('personal_status');
    PLANTED.forEach((p, i) => {
      const row = data[i + 1]; // linha i + 3 do arquivo
      expect(row[header.indexOf(p.column)]).toBe(p.value);
    });
    expect(data[0]).toHaveLength(header.length); // linha 2 continua válida
    expect(data.at(-1)).toHaveLength(header.length + 1);
  });

  it('células com vírgula ou aspas vão entre aspas', () => {
    expect(toCsv(['a', 'b'], [['1,5', 'x"y']])).toBe('a,b\n"1,5","x""y"\n');
  });
});

describe('portão', () => {
  it('sem cota o painel continua na tela (resultado, validar), só não gasta mais', () => {
    expect(afterGate(true, false)).toEqual({ showLive: true, canSpend: false });
    expect(afterGate(true, true)).toEqual({ showLive: true, canSpend: true });
    expect(afterGate(false, false)).toEqual({ showLive: false, canSpend: false });
  });
});
