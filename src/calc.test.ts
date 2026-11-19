import { describe, expect, it } from 'vitest';
import { aliquotaIR, comparar, estimarDescontoAntecipacao, fatorLiquido, type Inputs } from './calc';

const base: Inputs = {
  precoCartao: 1000,
  precoPix: 1000,
  parcelas: 10,
  cashbackPct: 1.25,
  cashbackQuando: 'parcela',
  cdiAnual: 13.65,
  pctCdi: 100,
  descontarIR: true,
  diasPrimeiraFatura: 30,
  // Shows both card options; no prepayment discount unless a test sets one.
  mostrarParcelado: true,
  taxaAntecipacaoAnual: 0,
  descontoAntecipacao: 0,
};

describe('aliquotaIR', () => {
  it('follows the regressive table', () => {
    expect(aliquotaIR(30)).toBe(0.225);
    expect(aliquotaIR(181)).toBe(0.2);
    expect(aliquotaIR(361)).toBe(0.175);
    expect(aliquotaIR(721)).toBe(0.15);
  });
});

describe('fatorLiquido', () => {
  it('compounds one year of CDI', () => {
    expect(fatorLiquido(365, { cdiAnual: 10, pctCdi: 100, descontarIR: false })).toBeCloseTo(1.1, 10);
  });

  it('takes income tax off the gain only', () => {
    expect(fatorLiquido(365, { cdiAnual: 10, pctCdi: 100, descontarIR: true })).toBeCloseTo(1.0825, 10);
  });

  it('is 1 with no time or no yield', () => {
    expect(fatorLiquido(0, base)).toBe(1);
    expect(fatorLiquido(100, { ...base, cdiAnual: 0 })).toBe(1);
  });
});

describe('comparar', () => {
  it('prefers the card when prices are equal: float plus cashback', () => {
    const r = comparar(base);
    expect(r.melhor.id).toBe('parcelado');
    const parcelado = r.opcoes.find((o) => o.id === 'parcelado')!;
    expect(parcelado.totalPago).toBeCloseTo(1000, 2);
    expect(parcelado.cashback).toBeCloseTo(12.5, 2);
    expect(parcelado.custoHoje).toBeLessThan(1000 - 12.5);
  });

  it('with zero yield the card costs exactly price minus cashback', () => {
    const r = comparar({ ...base, cdiAnual: 0 });
    const parcelado = r.opcoes.find((o) => o.id === 'parcelado')!;
    expect(parcelado.custoHoje).toBeCloseTo(987.5, 6);
    expect(r.descontoPixEquilibrio).toBeCloseTo(1.25, 6);
  });

  it('prefers PIX when its discount beats the break-even', () => {
    const { descontoPixEquilibrio } = comparar(base);
    const melhorPix = comparar({ ...base, precoPix: 1000 * (1 - (descontoPixEquilibrio + 0.5) / 100) });
    expect(melhorPix.melhor.id).toBe('pix');
    const melhorCartao = comparar({ ...base, precoPix: 1000 * (1 - (descontoPixEquilibrio - 0.5) / 100) });
    expect(melhorCartao.melhor.id).toBe('parcelado');
  });

  it('splits installments in cents with the remainder in the first', () => {
    const r = comparar({ ...base, precoCartao: 100, parcelas: 3 });
    const pagamentos = r.opcoes.find((o) => o.id === 'parcelado')!.pagamentos;
    expect(pagamentos.map((p) => p.valor)).toEqual([33.34, 33.33, 33.33]);
    expect(pagamentos.map((p) => p.dia)).toEqual([30, 60, 90]);
  });

  it('always shows the prepaid card; the toggle only adds the monthly one', () => {
    const ids = (i: Partial<Inputs>) => comparar({ ...base, ...i }).opcoes.map((o) => o.id);
    expect(ids({ mostrarParcelado: false })).toEqual(['pix', 'antecipado']);
    expect(ids({ mostrarParcelado: false, descontoAntecipacao: 30 })).toEqual(['pix', 'antecipado']);
    expect(ids({ mostrarParcelado: true })).toEqual(['pix', 'antecipado', 'parcelado']);
    // One installment has nothing to prepay.
    expect(ids({ mostrarParcelado: false, parcelas: 1 })).toEqual(['pix', 'parcelado']);
  });

  it('the monthly option keeps the full price whatever the prepayment discount', () => {
    const r = comparar({ ...base, descontoAntecipacao: 30 });
    expect(r.opcoes.find((o) => o.id === 'parcelado')!.totalPago).toBeCloseTo(1000, 6);
  });

  it('prepaid card pays price minus discount on the first bill, keeping the full cashback', () => {
    const r = comparar({ ...base, cdiAnual: 0, descontoAntecipacao: 30 });
    const antecipado = r.opcoes.find((o) => o.id === 'antecipado')!;
    expect(antecipado.pagamentos).toEqual([{ dia: 30, valor: 970 }]);
    expect(antecipado.cashback).toBeCloseTo(12.5, 6);
    expect(antecipado.custoHoje).toBeCloseTo(957.5, 6);
  });

  it('the PIX break-even follows the prepaid card', () => {
    const prepaid = { ...base, mostrarParcelado: false, descontoAntecipacao: 30 };
    const { descontoPixEquilibrio } = comparar(prepaid);
    const pix = (d: number) => comparar({ ...prepaid, precoPix: 1000 * (1 - d / 100) });
    expect(pix(descontoPixEquilibrio + 0.5).melhor.id).toBe('pix');
    expect(pix(descontoPixEquilibrio - 0.5).melhor.id).toBe('antecipado');
  });

  it('cashback at purchase is worth more than cashback per bill', () => {
    const custo = (i: Inputs) => comparar(i).opcoes.find((o) => o.id === 'parcelado')!.custoHoje;
    const naCompra = custo({ ...base, cashbackQuando: 'compra' });
    const porParcela = custo(base);
    expect(naCompra).toBeLessThan(porParcela);
  });

  it('estimates the prepayment discount from the rate when none is typed', () => {
    const r = comparar({ ...base, taxaAntecipacaoAnual: 10.58 });
    expect(r.descontoAntecipacaoEstimado).toBe(true);
    expect(r.descontoAntecipacao).toBeGreaterThan(0);
    expect(r.opcoes.find((o) => o.id === 'antecipado')!.totalPago).toBeCloseTo(1000 - r.descontoAntecipacao, 6);
  });

  it('a typed discount overrides the estimate', () => {
    const r = comparar({ ...base, taxaAntecipacaoAnual: 10.58, descontoAntecipacao: 12 });
    expect(r.descontoAntecipacaoEstimado).toBe(false);
    expect(r.descontoAntecipacao).toBe(12);
  });
});

describe('estimarDescontoAntecipacao', () => {
  const parcelas = (n: number) => Array.from({ length: n }, (_, i) => ({ dia: 30 + 30 * i, valor: 100 }));

  it('brings each installment back to the first bill at the annual rate', () => {
    // Second installment is 30 days after the first: 100 * (1 - 1.1058^(-30/365)).
    expect(estimarDescontoAntecipacao(parcelas(2), 10.58)).toBeCloseTo(0.82, 2);
  });

  it('is zero with one installment or no rate', () => {
    expect(estimarDescontoAntecipacao(parcelas(1), 10.58)).toBe(0);
    expect(estimarDescontoAntecipacao(parcelas(10), 0)).toBe(0);
  });

  it('grows with the rate and with the number of installments', () => {
    expect(estimarDescontoAntecipacao(parcelas(10), 12)).toBeGreaterThan(estimarDescontoAntecipacao(parcelas(10), 10));
    expect(estimarDescontoAntecipacao(parcelas(12), 10)).toBeGreaterThan(estimarDescontoAntecipacao(parcelas(10), 10));
  });
});
