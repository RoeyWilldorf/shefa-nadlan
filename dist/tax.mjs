export const PURCHASE_START = "2025-01-16";
export const singleBrackets = [[1978745, 0], [2347040, 0.035], [6055070, 0.05], [20183565, 0.08], [Infinity, 0.10]];
export const additionalBrackets = [[6055070, 0.08], [Infinity, 0.10]];
export const purchaseRules = {
  single: {lastDate: "2028-01-15", brackets: singleBrackets},
  additional: {lastDate: "2026-12-31", brackets: additionalBrackets},
};

export function estimatePurchase({price, percent, kind, date}) {
  const rule = purchaseRules[kind];
  if (!rule || date < PURCHASE_START || date > rule.lastDate) {
    throw new Error("תאריך העסקה מחוץ לתקופה שהמחשבון מכסה לסוג הרכישה שנבחר. אפשר לעבור לסימולטור הרשמי.");
  }
  const share = percent / 100;
  let lower = 0;
  const bands = [];
  for (const [upper, rate] of rule.brackets) {
    const slice = Math.min(price, upper) - lower;
    if (slice <= 0) break;
    bands.push({rate, base: slice, tax: slice * rate * share});
    lower = upper;
  }
  return {total: bands.reduce((sum, band) => sum + band.tax, 0), bands};
}

export function estimateGain({sale, adjustedBasis, costs}) {
  const gain = Math.max(0, sale - adjustedBasis - costs);
  return {gain, tax: gain * 0.25};
}
