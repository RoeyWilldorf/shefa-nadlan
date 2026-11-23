import {parsePrice} from "./listings.mjs";
import {estimateGain, estimatePurchase} from "./tax.mjs";

const GOV = "https://www.gov.il/he/service/";
const officialLinks = {
  purchase: GOV + "real_eatate_taxsimulator",
  gain: GOV + "real_estate_selfshuma",
};
const instruction = "https://www.gov.il/BlobFolder/policy/inst-01-2026/he/realestate_inst-01-2026.pdf";
const number = new Intl.NumberFormat("he-IL", {maximumFractionDigits: 0});
const money = value => `<bdi>${number.format(value)} ₪</bdi>`;
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#${name}"/></svg>`;
export const externalLink = (url, label) => `<a class="external-link" href="${url}" target="_blank" rel="noopener noreferrer">${label} ${icon("external")}</a>`;

export function israelDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit"}).formatToParts();
  const get = type => parts.find(part => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function amountField(name, label, options = {}) {
  return `<label class="field"><span>${label}</span><input name="${name}" type="text" inputmode="numeric" maxlength="14"
    placeholder="${options.placeholder ?? "₪"}" ${options.required === false ? "" : "required"} ${options.value ? `value="${options.value}"` : ""}></label>`;
}

function purchaseFields(price) {
  return `
    ${amountField("price", "שווי הדירה המלא (₪)", {value: price ? number.format(price) : ""})}
    <label class="field"><span>סוג הרכישה</span><select name="kind" required><option value="single" selected>דירה יחידה (תושב ישראל)</option><option value="additional">דירה נוספת</option></select></label>
    <label class="field"><span>חלק נרכש (%)</span><input name="percent" type="number" min="0.01" max="100" step="0.01" value="100" required></label>
    <label class="field"><span>תאריך העסקה</span><input name="date" type="date" dir="ltr" value="${israelDate()}" required></label>`;
}

function gainFields() {
  return `
    ${amountField("sale", "מחיר מכירה (₪)")}
    ${amountField("adjustedBasis", "עלות רכישה מתואמת (₪)")}
    ${amountField("costs", "הוצאות מוכרות מתואמות (₪, רשות)", {required: false, placeholder: "0"})}`;
}

export function calculatorMarkup(kind, price, backButton) {
  const purchase = kind === "purchase";
  const label = purchase ? "מס רכישה" : "מס שבח";
  const intro = purchase
    ? "מס רכישה לפי המדרגות הרגילות לדירת מגורים. לדירה יחידה החישוב מכסה מ־16.1.2025 עד 15.1.2028, ולדירה נוספת מ־16.1.2025 עד 31.12.2026."
    : "אומדן בשיעור 25% מהשבח הריאלי לדירת מגורים מזכה שנרכשה מ־1.1.2014, בהנחה שכל השבח חייב במס בשיעור זה. הזינו עלות והוצאות אחרי התאמות הצמדה ופחת, ככל שחלות.";
  const note = purchase
    ? "האומדן מבוסס על הסיווג שבחרתם. לבדיקת זכאות לפטור, הקלה או שיעור אחר השתמשו בסימולטור הרשמי."
    : "לחישוב עם פטור, רכישה לפני 2014, זכויות בנייה, מס יסף או התאמות שטרם חושבו, השתמשו בשומה העצמית של רשות המסים.";
  return `<div class="dialog-content dialog-form calc-dialog">
    ${backButton}
    <h2 id="dialog-title" tabindex="-1">מחשבון ${label}</h2>
    <p class="dialog-copy">${intro}</p>
    <form class="tax-form" method="dialog">
      <div class="calc-fields">${purchase ? purchaseFields(price) : gainFields()}</div>
      <p class="field-error calc-error" role="alert" hidden></p>
      <button class="button primary" type="submit">חישוב אומדן ${icon("calculator")}</button>
      <div class="calc-result" role="status" aria-atomic="true" hidden></div>
    </form>
    <p class="detail-note">${note}</p>
    <div class="external-links">${externalLink(officialLinks[kind], purchase ? "סימולטור רשות המסים" : "חישוב שומה עצמית ברשות המסים")}
    ${purchase ? externalLink(instruction, "מדרגות מס רכישה") : ""}</div>
  </div>`;
}

function readAmount(form, values, name, optional, quiet = false) {
  const amount = parsePrice(values[name]);
  if (amount === null && optional) return 0;
  if (!Number.isFinite(amount) || amount <= 0 && !(optional && amount === 0)) {
    if (quiet) throw new Error("incomplete");
    const input = form.elements.namedItem(name);
    input.setCustomValidity("יש להזין סכום תקין בשקלים שלמים.");
    input.reportValidity();
    throw new Error("יש לתקן את הסכום שסומן.");
  }
  return amount;
}

function purchaseResult(form, values, quiet) {
  const price = readAmount(form, values, "price", false, quiet);
  const {total, bands} = estimatePurchase({...values, price, percent: Number(values.percent)});
  const formatter = new Intl.NumberFormat("he-IL", {style: "percent", maximumFractionDigits: 2});
  return `<span>אומדן מס רכישה לחלק שנרכש</span><strong>${money(total)}</strong>
    <ul>${bands.map(band => `<li><span><bdi>${formatter.format(band.rate)}</bdi> על ${money(band.base)}</span><strong>${money(band.tax)}</strong></li>`).join("")}</ul>`;
}

function gainResult(form, values, quiet) {
  const sale = readAmount(form, values, "sale", false, quiet);
  const adjustedBasis = readAmount(form, values, "adjustedBasis", false, quiet);
  const costs = readAmount(form, values, "costs", true, quiet);
  const {gain, tax} = estimateGain({sale, adjustedBasis, costs});
  return `<span>אומדן מס שבח</span><strong>${money(tax)}</strong><p>שבח ריאלי לפי הנתונים שהוזנו: ${money(gain)} · שיעור מס: 25%</p>`;
}

export function bindCalculator(container, kind) {
  const form = container.querySelector(".tax-form");
  const result = form.querySelector(".calc-result");
  const error = form.querySelector(".calc-error");
  // Results update live while typing; the button stays for keyboard and screen-reader users.
  const live = () => {
    error.hidden = true;
    try {
      const values = Object.fromEntries(new FormData(form));
      result.innerHTML = kind === "purchase" ? purchaseResult(form, values, true) : gainResult(form, values, true);
      result.hidden = false;
    } catch { result.hidden = true; }
  };
  form.addEventListener("input", event => { event.target.setCustomValidity?.(""); live(); });
  form.addEventListener("change", live);
  queueMicrotask(live);
  form.addEventListener("submit", event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    try {
      result.innerHTML = kind === "purchase" ? purchaseResult(form, values) : gainResult(form, values);
      result.hidden = false;
      error.hidden = true;
    } catch (problem) {
      result.hidden = true;
      error.textContent = problem.message;
      error.hidden = false;
    }
  });
}
