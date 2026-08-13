import { computeCardAmounts, PAYPHONE_FEE_RATE } from './payphone-fee.util';

describe('computeCardAmounts', () => {
  it('never lets the platform net less than the fare after Payphone deducts its cut', () => {
    // Simula lo que Payphone realmente liquida: chargedAmount - (chargedAmount * tasa)
    const fares = [1, 5, 9.99, 10, 10.01, 15.5, 23.33, 50, 99.99, 123.45, 500, 1000.01];
    for (const fare of fares) {
      const { chargedAmount, feeAmount } = computeCardAmounts(fare);
      const settledByPayphone = chargedAmount - chargedAmount * PAYPHONE_FEE_RATE;
      expect(settledByPayphone).toBeGreaterThanOrEqual(fare - 0.005);
      expect(feeAmount).toBeCloseTo(chargedAmount - fare, 2);
    }
  });

  it('matches the documented example: $10 fare -> $10.62 charged (rounded up)', () => {
    const { chargedAmount, feeAmount } = computeCardAmounts(10);
    expect(chargedAmount).toBe(10.62);
    expect(feeAmount).toBe(0.62);
  });

  it('always rounds the charged amount UP, never to nearest, when the division is inexact', () => {
    // 3 / (1 - 0.0575) = 3.1830079... -> el céntimo de diferencia debe
    // quedar a favor de la plataforma, nunca en contra.
    const { chargedAmount } = computeCardAmounts(3);
    const exact = 3 / (1 - PAYPHONE_FEE_RATE);
    expect(chargedAmount).toBe(Math.ceil(exact * 100) / 100);
    expect(chargedAmount).toBeGreaterThanOrEqual(exact);
  });

  it('returns amounts rounded to 2 decimals', () => {
    const { chargedAmount, feeAmount } = computeCardAmounts(17.37);
    expect(Number.isInteger(chargedAmount * 100)).toBe(true);
    expect(Number.isInteger(feeAmount * 100)).toBe(true);
  });

  it('produces a zero fee for a zero fare', () => {
    const { chargedAmount, feeAmount } = computeCardAmounts(0);
    expect(chargedAmount).toBe(0);
    expect(feeAmount).toBe(0);
  });
});
