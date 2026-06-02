/**
 * CONT-PLATA: deterministic line + document total computation in minor units (bani).
 * Kept pure and dependency-free so it can be unit-tested and reused by the route.
 */

export interface LineInput {
  quantity: number | string;
  unitPriceCents: number;
  vatRate: number;
}

export interface LineTotals {
  lineSubtotalCents: number;
  lineVatCents: number;
  lineTotalCents: number;
}

export interface DocumentTotals {
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
}

/** Compute the three cent values for a single line. Rounds half-up to the nearest ban. */
export function computeLineTotals(line: LineInput): LineTotals {
  const qty = typeof line.quantity === "string" ? parseFloat(line.quantity) : line.quantity;
  const safeQty = Number.isFinite(qty) && qty > 0 ? qty : 0;
  const unit = Math.max(0, Math.round(line.unitPriceCents));
  const rate = Math.max(0, line.vatRate);

  const lineSubtotalCents = Math.round(safeQty * unit);
  const lineVatCents = Math.round((lineSubtotalCents * rate) / 100);
  const lineTotalCents = lineSubtotalCents + lineVatCents;
  return { lineSubtotalCents, lineVatCents, lineTotalCents };
}

/** Sum line totals into the document header totals. */
export function computeDocumentTotals(lines: LineInput[]): {
  totals: DocumentTotals;
  lines: LineTotals[];
} {
  const perLine = lines.map(computeLineTotals);
  const totals = perLine.reduce<DocumentTotals>(
    (acc, l) => ({
      subtotalCents: acc.subtotalCents + l.lineSubtotalCents,
      vatCents: acc.vatCents + l.lineVatCents,
      totalCents: acc.totalCents + l.lineTotalCents,
    }),
    { subtotalCents: 0, vatCents: 0, totalCents: 0 }
  );
  return { totals, lines: perLine };
}
