import { describe, expect, it } from 'vitest';
import { clampAdvanceDiscount } from './payrollPayment';

describe('clampAdvanceDiscount', () => {
  it.each([
    { value: 80, available: 100, expected: 80 },
    { value: 150, available: 100, expected: 100 },
    { value: -10, available: 100, expected: 0 },
    { value: 10, available: -20, expected: 0 },
    { value: Number.NaN, available: 100, expected: 0 },
    { value: 10, available: Number.POSITIVE_INFINITY, expected: 0 },
  ])('normalizes $value with $available available', ({ value, available, expected }) => {
    expect(clampAdvanceDiscount(value, available)).toBe(expected);
  });
});
