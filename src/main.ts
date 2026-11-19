import { comparar, type CashbackTiming, type Comparison, type Inputs, type OptionResult } from './calc';
import { brl, parseDecimal, pct } from './format';

const DEFAULTS = {
  cashbackPct: 1.25,
  cashbackQuando: 'parcela' as CashbackTiming,
  cdiAnual: 13.65,
  pctCdi: 100,
  descontarIR: true,
  diasPrimeiraFatura: 30,
  taxaAntecipacaoAnual: 10.58,
  mostrarParcelado: false,
};
type Settings = typeof DEFAULTS;
const STORAGE_KEY = 'pix-ou-cartao:settings';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const el = {
  precoCartao: $<HTMLInputElement>('precoCartao'),
  precoPix: $<HTMLInputElement>('precoPix'),
  descontoPix: $<HTMLInputElement>('descontoPix'),
  parcelas: $<HTMLInputElement>('parcelas'),
  descontoAntecipacao: $<HTMLInputElement>('descontoAntecipacao'),
  cashbackPct: $<HTMLInputElement>('cashbackPct'),
  cashbackQuando: $<HTMLSelectElement>('cashbackQuando'),
  cdiAnual: $<HTMLInputElement>('cdiAnual'),
  pctCdi: $<HTMLInputElement>('pctCdi'),
  diasPrimeiraFatura: $<HTMLInputElement>('diasPrimeiraFatura'),
  taxaAntecipacaoAnual: $<HTMLInputElement>('taxaAntecipacaoAnual'),
  mostrarParcelado: $<HTMLInputElement>('mostrarParcelado'),
  descontarIR: $<HTMLInputElement>('descontarIR'),
  salvar: $<HTMLInputElement>('salvar'),
  reset: $<HTMLButtonElement>('reset'),
  form: $<HTMLFormElement>('form'),
  result: $<HTMLElement>('result'),
};

// Settings live in the browser only while "salvar" is checked: a stored entry
// means the toggle is on, and unchecking it deletes the entry.
function loadSettings(): Settings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    // Storage blocked or corrupt: fall back to defaults.
  }
  return null;
}

function persistSettings(s: Settings): void {
  try {
    if (el.salvar.checked) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Not persisting is fine.
  }
}

function fillSettings(s: Settings): void {
  el.cashbackPct.value = pct(s.cashbackPct);
  el.cashbackQuando.value = s.cashbackQuando;
  el.cdiAnual.value = pct(s.cdiAnual);
  el.pctCdi.value = pct(s.pctCdi);
  el.diasPrimeiraFatura.value = String(s.diasPrimeiraFatura);
  el.descontarIR.checked = s.descontarIR;
  el.taxaAntecipacaoAnual.value = pct(s.taxaAntecipacaoAnual);
  el.mostrarParcelado.checked = s.mostrarParcelado;
}

function readSettings(): Settings {
  return {
    cashbackPct: parseDecimal(el.cashbackPct.value) ?? DEFAULTS.cashbackPct,
    cashbackQuando: el.cashbackQuando.value as CashbackTiming,
    cdiAnual: parseDecimal(el.cdiAnual.value) ?? DEFAULTS.cdiAnual,
    pctCdi: parseDecimal(el.pctCdi.value) ?? DEFAULTS.pctCdi,
    diasPrimeiraFatura: Math.max(0, Math.round(parseDecimal(el.diasPrimeiraFatura.value) ?? DEFAULTS.diasPrimeiraFatura)),
    descontarIR: el.descontarIR.checked,
    taxaAntecipacaoAnual: parseDecimal(el.taxaAntecipacaoAnual.value) ?? DEFAULTS.taxaAntecipacaoAnual,
    mostrarParcelado: el.mostrarParcelado.checked,
  };
}

function readInputs(): Inputs | null {
  const precoCartao = parseDecimal(el.precoCartao.value);
  const precoPix = parseDecimal(el.precoPix.value);
  if (!precoCartao || precoCartao <= 0 || precoPix == null || precoPix < 0) return null;
  return {
    ...readSettings(),
    precoCartao,
    precoPix,
    parcelas: Math.min(48, Math.max(1, Math.round(parseDecimal(el.parcelas.value) ?? 1))),
    descontoAntecipacao: Math.max(0, parseDecimal(el.descontoAntecipacao.value) ?? 0),
  };
}

// The PIX price and the PIX discount are two views of one number: editing one rewrites the other.
function syncPix(source: 'preco' | 'desconto' | 'cartao'): void {
  const cartao = parseDecimal(el.precoCartao.value);
  if (!cartao) return;
  if (source === 'desconto') {
    const d = parseDecimal(el.descontoPix.value);
    el.precoPix.value = d == null ? '' : brl(cartao * (1 - d / 100), false);
  } else if (source === 'preco' || el.descontoPix.value === '') {
    const p = parseDecimal(el.precoPix.value);
    el.descontoPix.value = p == null ? '' : pct((1 - p / cartao) * 100);
  } else {
    // Card price changed with a discount typed: keep the discount, move the PIX price.
    syncPix('desconto');
  }
}

function verdict(c: Comparison, inputs: Inputs): string {
  const sorted = [...c.opcoes].sort((a, b) => a.custoHoje - b.custoHoje);
  const [first, second] = sorted;
  const gap = second.custoHoje - first.custoHoje;

  // Where PIX flips: the discount at which it ties the best card option.
  const pctVirada = pct(c.descontoPixEquilibrio);
  const precoVirada = brl(inputs.precoCartao * (1 - c.descontoPixEquilibrio / 100));
  const virada =
    first.id === 'pix'
      ? `Com desconto abaixo de ${pctVirada}% (PIX acima de ${precoVirada}), o cartão passa a compensar.`
      : `PIX só compensa com desconto acima de ${pctVirada}% (abaixo de ${precoVirada}).`;

  let principal: string;
  let tipo: string;
  if (gap < 0.005) {
    tipo = 'tie';
    principal = `Empate técnico entre <strong>${first.label}</strong> e <strong>${second.label}</strong>.`;
  } else {
    tipo = first.id === 'pix' ? 'pix' : 'card';
    const titulo =
      first.id === 'pix'
        ? 'Vá de PIX'
        : first.id === 'antecipado'
          ? 'Cartão e antecipe'
          : inputs.parcelas > 1
            ? 'Cartão sem antecipar'
            : 'Vá de cartão';
    const pctGap = (gap / inputs.precoCartao) * 100;
    const outro = second.id === 'pix' ? 'o PIX' : second.label.toLowerCase();
    principal = `<strong>${titulo}.</strong> Sai ${brl(gap)} mais barato hoje que ${outro} (${pct(pctGap)}% do preço).`;
  }
  return `<div class="verdict ${tipo}"><p>${principal}</p><p class="virada">${virada}</p></div>`;
}

function card(o: OptionResult, c: Comparison, inputs: Inputs): string {
  const melhor = c.melhor;
  const diff = o.custoHoje - melhor.custoHoje;
  const nPag = o.pagamentos.length;
  const pagamentos =
    nPag === 1
      ? o.pagamentos[0].dia === 0
        ? 'pago na hora'
        : `pago em ${o.pagamentos[0].dia} dias`
      : `${nPag}x de ${brl(o.pagamentos[nPag - 1].valor)}`;
  return `
    <article class="option ${o.id === melhor.id ? 'best' : ''}">
      <header>
        <h3>${o.label}</h3>
        ${o.id === melhor.id ? '<span class="badge">melhor</span>' : `<span class="diff">+${brl(diff)}</span>`}
      </header>
      <p class="cost">${brl(o.custoHoje)}<small>custo hoje</small></p>
      <dl>
        <div><dt>Você paga</dt><dd>${brl(o.totalPago)} <span class="muted">(${pagamentos})</span></dd></div>
        ${
          o.id === 'antecipado'
            ? `<div><dt>Desconto ${c.descontoAntecipacaoEstimado ? `estimado (${pct(inputs.taxaAntecipacaoAnual)}% a.a.)` : 'do app'}</dt><dd>${brl(c.descontoAntecipacao)}</dd></div>`
            : ''
        }
        ${o.cashback > 0 ? `<div><dt>Cashback</dt><dd>${brl(o.cashback)}</dd></div>` : ''}
        ${o.id !== 'pix' ? `<div><dt>Ganho com prazo e cashback</dt><dd>${brl(o.totalPago - o.custoHoje)}</dd></div>` : ''}
      </dl>
    </article>`;
}

function render(): void {
  const settings = readSettings();
  persistSettings(settings);
  const inputs = readInputs();
  if (!inputs) {
    el.result.innerHTML = '<p class="empty">Informe o preço no cartão e no PIX para comparar.</p>';
    return;
  }
  const c = comparar(inputs);
  el.descontoAntecipacao.placeholder =
    inputs.parcelas > 1 && c.descontoAntecipacaoEstimado && c.descontoAntecipacao > 0
      ? `estimado ${brl(c.descontoAntecipacao, false)}`
      : 'estimado';
  const sorted = [...c.opcoes].sort((a, b) => a.custoHoje - b.custoHoje);
  el.result.innerHTML = `
    ${verdict(c, inputs)}
    <div class="options">${sorted.map((o) => card(o, c, inputs)).join('')}</div>`;
}

el.precoCartao.addEventListener('input', () => syncPix('cartao'));
el.precoPix.addEventListener('input', () => syncPix('preco'));
el.descontoPix.addEventListener('input', () => syncPix('desconto'));
el.form.addEventListener('input', render);
el.form.addEventListener('change', render);
el.form.addEventListener('submit', (e) => e.preventDefault());

// On the phone keyboard, "next" jumps to the following field and "done" closes
// the keyboard and brings the verdict into view.
el.form.addEventListener('keydown', (e) => {
  const target = e.target;
  if (e.key !== 'Enter' || !(target instanceof HTMLInputElement) || target.type === 'checkbox') return;
  e.preventDefault();
  if (target.enterKeyHint === 'next') {
    const fields = [...el.form.querySelectorAll<HTMLInputElement>('fieldset input')];
    const next = fields[fields.indexOf(target) + 1];
    if (next) {
      next.focus();
      return;
    }
  }
  target.blur();
  el.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
el.reset.addEventListener('click', () => {
  fillSettings(DEFAULTS);
  render();
});

const salvas = loadSettings();
el.salvar.checked = salvas !== null;
fillSettings(salvas ?? DEFAULTS);
render();
