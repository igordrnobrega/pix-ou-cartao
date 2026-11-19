// Compares paying with PIX against the credit card (installments without
// interest, cashback, optional prepayment of the installments).
//
// Every option is reduced to its "custo hoje": the amount you would have to
// set aside today, invested at your yield, to cover every future payment.
// Cashback lowers that cost by its own present value. The cheapest custo hoje
// wins, whatever the nominal totals say.

export type CashbackTiming = 'compra' | 'parcela';

export interface Inputs {
  /** Price when paying with the card (full price, before cashback). */
  precoCartao: number;
  /** Price when paying with PIX. */
  precoPix: number;
  /** Number of installments without interest (1 = à vista no cartão). */
  parcelas: number;
  /** Cashback rate, in percent (1.25 = 1.25%). */
  cashbackPct: number;
  /** When the cashback reaches you: at purchase, or with each paid bill. */
  cashbackQuando: CashbackTiming;
  /** CDI, percent per year (13.65 = 13.65% a.a.). */
  cdiAnual: number;
  /** Your yield as a percent of the CDI (100 = 100% do CDI). */
  pctCdi: number;
  /** Discount income tax (tabela regressiva) from the yield. */
  descontarIR: boolean;
  /** Days from purchase to the due date of the first bill. */
  diasPrimeiraFatura: number;
  /** Also show the card with installments paid monthly, besides the prepaid card. */
  mostrarParcelado: boolean;
  /** Annual rate the card issuer uses to discount prepaid installments (10.58 = 10.58% a.a.). */
  taxaAntecipacaoAnual: number;
  /** Discount the app actually offers to prepay every installment, in R$ (0 = estimate from the rate). */
  descontoAntecipacao: number;
}

export type OptionId = 'pix' | 'parcelado' | 'antecipado';

export interface Payment {
  dia: number;
  valor: number;
}

export interface OptionResult {
  id: OptionId;
  label: string;
  /** Nominal amount leaving your account. */
  totalPago: number;
  /** Nominal cashback received. */
  cashback: number;
  /** Present value of payments minus present value of cashback. */
  custoHoje: number;
  pagamentos: Payment[];
}

export interface Comparison {
  opcoes: OptionResult[];
  melhor: OptionResult;
  /** Prepayment discount used (R$): the one typed, or the estimate from the rate. */
  descontoAntecipacao: number;
  /** Whether `descontoAntecipacao` came from the rate (true) or was typed (false). */
  descontoAntecipacaoEstimado: boolean;
  /** PIX discount (over the card price, in %) at which PIX ties the card. */
  descontoPixEquilibrio: number;
}

const DIAS_ENTRE_FATURAS = 30;

/** Income tax rate on fixed income by holding period (tabela regressiva). */
export function aliquotaIR(dias: number): number {
  if (dias <= 180) return 0.225;
  if (dias <= 360) return 0.2;
  if (dias <= 720) return 0.175;
  return 0.15;
}

/** Growth of R$ 1 invested for `dias` calendar days, net of income tax when asked. */
export function fatorLiquido(dias: number, inputs: Pick<Inputs, 'cdiAnual' | 'pctCdi' | 'descontarIR'>): number {
  if (dias <= 0) return 1;
  const taxaAnual = (inputs.cdiAnual / 100) * (inputs.pctCdi / 100);
  const bruto = Math.pow(1 + taxaAnual, dias / 365) - 1;
  const ir = inputs.descontarIR ? aliquotaIR(dias) : 0;
  return 1 + bruto * (1 - ir);
}

function valorPresente(pagamentos: Payment[], inputs: Inputs): number {
  return pagamentos.reduce((soma, p) => soma + p.valor / fatorLiquido(p.dia, inputs), 0);
}

function diaParcela(i: number, inputs: Inputs): number {
  return inputs.diasPrimeiraFatura + i * DIAS_ENTRE_FATURAS;
}

function parcelasDe(total: number, n: number, inputs: Inputs): Payment[] {
  // Card issuers round each installment to cents and put the remainder in the first.
  const base = Math.floor((total / n) * 100) / 100;
  const primeira = Math.round((total - base * (n - 1)) * 100) / 100;
  return Array.from({ length: n }, (_, i) => ({ dia: diaParcela(i, inputs), valor: i === 0 ? primeira : base }));
}

function cashbackDe(parcelas: Payment[], inputs: Inputs, diaUnico?: number): Payment[] {
  const taxa = inputs.cashbackPct / 100;
  if (inputs.cashbackQuando === 'compra') {
    const total = parcelas.reduce((s, p) => s + p.valor, 0);
    return [{ dia: 0, valor: total * taxa }];
  }
  return parcelas.map((p) => ({ dia: diaUnico ?? p.dia, valor: p.valor * taxa }));
}

/**
 * Discount for pulling every installment into the first bill: each one is
 * brought back from its due date to the first bill's date at the annual rate.
 * The first installment is already due then, so it gets no discount.
 */
export function estimarDescontoAntecipacao(parcelas: Payment[], taxaAnual: number): number {
  if (parcelas.length < 2 || taxaAnual <= 0) return 0;
  const d0 = parcelas[0].dia;
  const desconto = parcelas.reduce(
    (s, p) => s + p.valor * (1 - 1 / Math.pow(1 + taxaAnual / 100, (p.dia - d0) / 365)),
    0,
  );
  return Math.round(desconto * 100) / 100;
}

function soma(pagamentos: Payment[]): number {
  return pagamentos.reduce((s, p) => s + p.valor, 0);
}

export function comparar(inputs: Inputs): Comparison {
  const n = Math.max(1, Math.floor(inputs.parcelas));
  const opcoes: OptionResult[] = [];

  const pix: Payment[] = [{ dia: 0, valor: inputs.precoPix }];
  opcoes.push({
    id: 'pix',
    label: 'PIX',
    totalPago: inputs.precoPix,
    cashback: 0,
    custoHoje: inputs.precoPix,
    pagamentos: pix,
  });

  const parcelas = parcelasDe(inputs.precoCartao, n, inputs);
  const d0 = inputs.diasPrimeiraFatura;

  const descontoAntecipacaoEstimado = !(inputs.descontoAntecipacao > 0);
  const descontoAntecipacao =
    n > 1
      ? descontoAntecipacaoEstimado
        ? estimarDescontoAntecipacao(parcelas, inputs.taxaAntecipacaoAnual)
        : inputs.descontoAntecipacao
      : 0;

  // With installments the card is always compared prepaid; keeping the
  // installments open is an extra option shown only when asked for.
  if (n > 1) {
    const antecipado: Payment[] = [{ dia: d0, valor: inputs.precoCartao - descontoAntecipacao }];
    const cashback = cashbackDe(parcelas, inputs, d0);
    opcoes.push({
      id: 'antecipado',
      label: `Cartão em ${n}x, antecipando tudo`,
      totalPago: soma(antecipado),
      cashback: soma(cashback),
      custoHoje: valorPresente(antecipado, inputs) - valorPresente(cashback, inputs),
      pagamentos: antecipado,
    });
  }
  if (n === 1 || inputs.mostrarParcelado) {
    const cashback = cashbackDe(parcelas, inputs);
    opcoes.push({
      id: 'parcelado',
      label: n === 1 ? 'Cartão à vista' : `Cartão em ${n}x, sem antecipar`,
      totalPago: soma(parcelas),
      cashback: soma(cashback),
      custoHoje: valorPresente(parcelas, inputs) - valorPresente(cashback, inputs),
      pagamentos: parcelas,
    });
  }

  const melhor = opcoes.reduce((a, b) => (b.custoHoje < a.custoHoje ? b : a));
  const melhorCartao = opcoes.filter((o) => o.id !== 'pix').reduce((a, b) => (b.custoHoje < a.custoHoje ? b : a));
  const descontoPixEquilibrio =
    inputs.precoCartao > 0 ? (1 - melhorCartao.custoHoje / inputs.precoCartao) * 100 : 0;

  return { opcoes, melhor, descontoAntecipacao, descontoAntecipacaoEstimado, descontoPixEquilibrio };
}
