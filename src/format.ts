/**
 * Parses a number typed the Brazilian way ("1.299,90", "1299,9", "5") or the
 * dotted way ("1299.90"). With a comma present, dots are thousand separators.
 * Returns null for empty or invalid input.
 */
export function parseDecimal(raw: string): number | null {
  const s = raw.trim().replace(/^R\$\s*/i, '').replace(/%$/, '').trim();
  if (s === '') return null;
  // "1.000" and "1.299.000" are thousands in pt-BR; "1.5" and "1299.90" stay decimal.
  const normalized =
    s.includes(',') || /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s;
  if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

/** "R$ 1.299,90", or "1.299,90" without the symbol (for input fields). */
export function brl(n: number, symbol = true): string {
  return symbol ? brlFmt.format(n) : numFmt.format(n);
}

/** "1,25" (no % sign; up to two decimals). */
export function pct(n: number): string {
  return pctFmt.format(n);
}
