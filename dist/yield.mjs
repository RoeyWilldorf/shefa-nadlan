import {parsePrice} from "./listings.mjs";

const money = new Intl.NumberFormat("he-IL", {style:"currency", currency:"ILS", maximumFractionDigits:0});
const percentage = new Intl.NumberFormat("he-IL", {style:"percent", maximumFractionDigits:2});
const fields = [
  ["price", "מחיר הנכס (₪)", true],
  ["rent", "שכירות חודשית צפויה (₪)", true],
  ["purchaseCosts", "עלויות רכישה חד־פעמיות (₪)", false],
  ["expenses", "הוצאות חודשיות ממוצעות (₪)", false],
  ["payment", "החזר משכנתה חודשי (₪)", false],
];

export function calculateYield({price, rent, purchaseCosts, expenses, payment}) {
  const operating = rent - expenses;
  return {gross: rent * 12 / price, net: operating * 12 / (price + purchaseCosts), cash: operating - payment};
}

export function yieldMarkup(price, propertyId) {
  return `<div class="dialog-content dialog-form">
    <h2 id="dialog-title" tabindex="-1">מחשבון תשואה ותזרים</h2>
    <p class="dialog-copy">בדקו תרחיש השקעה לפי ההנחות שלכם. אפשר לכלול תחזוקה ותקופות ללא שוכר בתוך ממוצע ההוצאות החודשיות.</p>
    <form class="tax-form" method="dialog" novalidate>
      <div class="calc-fields">${fields.map(([name, label, required]) => `<label class="field"><span>${label}${required ? " · חובה" : ""}</span><input name="${name}" type="text" inputmode="numeric" maxlength="14" aria-describedby="yield-${name}" ${name === "price" && price ? `value="${price}"` : ""} ${required ? "required" : ""}><span class="input-error" id="yield-${name}" hidden></span></label>`).join("")}</div>
      <p class="field-error" role="alert" hidden>יש לבדוק את הסכומים שסומנו.</p>
      <button class="button primary" type="submit">חישוב אומדן</button>
      <div class="calc-result" role="status" aria-atomic="true" hidden></div>
    </form>
    <p class="detail-note">תשואה ברוטו מחושבת ממחיר הנכס. התשואה אחרי הוצאות כוללת עלויות רכישה, לפני מימון. התזרים החודשי כולל את ההחזר שהוזן. החישוב לפני מס על הכנסות שכירות.</p>
    <button class="button outline yield-inquiry" type="button" data-contact="invest" ${propertyId ? `data-contact-property="${propertyId}"` : ""}>שיחה על נכס להשקעה</button>
  </div>`;
}

export function bindYield(container) {
  const form = container.querySelector("form");
  const summary = form.querySelector("[role=alert]");
  const result = form.querySelector(".calc-result");
  function setError(input, message) {
    const hint = form.querySelector(`#yield-${input.name}`);
    input.setAttribute("aria-invalid", String(Boolean(message)));
    hint.hidden = !message;
    hint.textContent = message;
  }
  form.addEventListener("input", event => {
    if (event.target.matches("input")) setError(event.target, "");
    summary.hidden = true;
    result.hidden = true;
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const values = {};
    let first;
    for (const [name, , required] of fields) {
      const input = form.elements.namedItem(name);
      const amount = parsePrice(input.value);
      const invalid = Number.isNaN(amount) || (required && !(amount > 0));
      setError(input, invalid ? "יש להזין סכום תקין בשקלים שלמים." : "");
      if (invalid && !first) first = input;
      values[name] = amount ?? 0;
    }
    summary.hidden = !first;
    if (first) {
      first.focus();
      return;
    }
    const {gross, net, cash} = calculateYield(values);
    result.innerHTML = `<dl class="yield-results"><div><dt>תשואה שנתית ברוטו</dt><dd>${percentage.format(gross)}</dd></div><div><dt>תשואה שנתית אחרי הוצאות</dt><dd>${percentage.format(net)}</dd></div><div><dt>תזרים חודשי אחרי מימון</dt><dd>${money.format(cash)}</dd></div></dl>`;
    result.hidden = false;
  });
}
