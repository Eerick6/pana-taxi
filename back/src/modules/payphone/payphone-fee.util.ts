// Payphone cobra 5.75% por pago con tarjeta (5% comisión + 15% IVA sobre esa
// comisión) y lo DESCUENTA del monto liquidado al comercio — no te cobran
// aparte, te depositan el total cobrado menos este %. Confirmado en su doc
// oficial (docs.payphone.app/api-link, sección Split de Pagos): "ten en
// cuenta la comisión del 5.75% por pagos con tarjeta".
export const PAYPHONE_FEE_RATE = 0.0575;

export interface CardAmounts {
  chargedAmount: number;
  feeAmount: number;
}

// Fórmula divisiva (no aditiva): si sumáramos fare * 1.0575, Payphone
// descontaría su 5.75% de ESE total y la plataforma recibiría menos que el
// fare original. Para que el fare quede intacto tras el descuento, hay que
// cobrarle al cliente fare / (1 - tasa) — así lo que Payphone liquida
// ($chargedAmount - comisión) es exactamente el fare.
//
// Ejemplo: fare = $10 → 10 / 0.9425 = $10.6100... → redondeado hacia
// arriba, chargedAmount = $10.62 → Payphone descuenta 5.75% de $10.62
// ($0.61) → te liquidan $10.0095, un poco MÁS que el fare, nunca menos.
//
// Redondeo SIEMPRE hacia arriba (Math.ceil), nunca al más cercano — si el
// cálculo da 3+ decimales, el centavo de diferencia queda a nuestro favor,
// nunca en contra. .toFixed(2) redondea al más cercano y podía dejarnos
// short por una fracción de centavo.
export function computeCardAmounts(fare: number): CardAmounts {
  const chargedAmount = Math.ceil((fare / (1 - PAYPHONE_FEE_RATE)) * 100) / 100;
  const feeAmount = +(chargedAmount - fare).toFixed(2);
  return { chargedAmount, feeAmount };
}
