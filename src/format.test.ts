import { describe, expect, it } from 'vitest';
import { brl, parseDecimal, pct } from './format';

describe('parseDecimal', () => {
  it.each([
    ['1.299,90', 1299.9],
    ['1299,9', 1299.9],
    ['1299.90', 1299.9],
    ['R$ 1.000', 1000],
    ['5', 5],
    ['1.000', 1000],
    ['1.5', 1.5],
    ['1,25%', 1.25],
    [',5', 0.5],
  ])('%s → %s', (raw, expected) => {
    expect(parseDecimal(raw)).toBeCloseTo(expected, 10);
  });

  it.each(['', '  ', 'abc', '1,2,3', '--1'])('rejects %j', (raw) => {
    expect(parseDecimal(raw)).toBeNull();
  });
});

describe('formatting', () => {
  it('formats BRL', () => {
    expect(brl(1299.9).replace(/\s/g, ' ')).toBe('R$ 1.299,90');
    expect(brl(1299.9, false)).toBe('1.299,90');
  });

  it('formats percentages', () => {
    expect(pct(1.25)).toBe('1,25');
    expect(pct(5)).toBe('5');
  });
});
