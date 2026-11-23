import {properties, towns, validPhone, parsePrice} from "./listings.mjs";
import {bindMarket, marketMarkup} from "./market-view.mjs";
import {bindCalculator, calculatorMarkup} from "./tool-views.mjs";
import {bindYield, yieldMarkup} from "./yield.mjs";
import {bindBetterment,bettermentMarkup} from "./betterment.mjs";

const icon = name => `<svg class="icon" aria-hidden="true"><use href="#${name}"/></svg>`;
const labels = {
  general: "יצירת קשר",
  visit: "בקשת תיאום סיור",
  buy: "בקשת התאמת נכס לקנייה",
  rent: "בקשת התאמת נכס להשכרה",
  sell: "בקשת שיחה על מכירת נכס",
  let: "בקשת שיחה על שיווק נכס להשכרה",
  invest: "בקשת שיחה על נכס להשקעה",
  access: "דיווח על בעיית נגישות",
  valuation: "כמה שווה הנכס שלי? בקשת הערכת שווי",
  alert: "עדכנו אותי כשיעלה נכס מתאים",
};
const localities = towns.map(town => `<option>${town}</option>`).join("");
const lookup = id => properties.find(property => property.id === id);
const escaped = value => String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function field(name, label, attributes) {
  return `<div class="field"><label for="inquiry-${name}">${label}</label><input id="inquiry-${name}" name="${name}" ${attributes} aria-describedby="error-${name}"><span id="error-${name}" class="input-error" hidden></span></div>`;
}

function inquiryMarkup(intent, property) {
  const valuation = intent === "valuation";
  const owner = intent === "sell" || intent === "let" || valuation;
  const search = ["buy", "rent", "invest", "alert"].includes(intent);
  const feedback = intent === "access";
  return `<div class="dialog-content dialog-form">
    <h2 id="dialog-title" tabindex="-1">${labels[intent]}</h2>
    ${property ? `<p class="dialog-copy">${escaped(property.title)} · ${escaped(property.town)}</p>` : ""}
    <p class="demo-note">${icon("info")}הפרטים יישמרו במערכת המשרד וישמשו לחזרה לפנייה. מסירת הפרטים לפי בחירתכם. באפשרותכם גם לפנות בטלפון.</p>
    <form id="inquiry-form" class="inquiry-form" method="dialog" novalidate>
      <p class="field-error" id="inquiry-error" role="alert" hidden>יש לבדוק את השדות המסומנים.</p>
      ${field("name", "שם מלא (חובה)", 'required maxlength="80" autocomplete="name"')}
      ${field("phone", "טלפון לחזרה (חובה)", 'required type="tel" maxlength="25" autocomplete="tel" inputmode="tel" dir="ltr"')}
      ${owner || search ? `<label class="field"><span>יישוב${owner ? " הנכס" : " מועדף"} (רשות)</span><select name="town"><option value="">לבחירת יישוב</option>${localities}<option>יישוב אחר</option></select></label>` : ""}
      ${intent === "alert" ? '<label class="field"><span>מה אתם מחפשים?</span><select name="alertDeal"><option value="buy">קנייה</option><option value="rent">שכירות</option></select></label>' : ""}
      ${valuation ? '<label class="field"><span>מה תרצו לעשות עם הנכס?</span><select name="valuationDeal"><option value="sell">למכור</option><option value="let">להשכיר</option><option value="">עוד לא החלטתי - רק לדעת כמה הוא שווה</option></select></label>' : ""}
      ${search || valuation ? '<label class="field"><span>מספר חדרים' + (valuation ? '' : ' (מינימום)') + ' (רשות)</span><select name="rooms"><option value="">לבחירה</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option></select></label>' : ""}
      ${valuation ? '<label class="field"><span>שטח במ״ר (רשות)</span><input name="area" type="text" inputmode="numeric" maxlength="6"></label><label class="field"><span>רחוב וקומה (רשות)</span><input name="street" maxlength="80" autocomplete="street-address"></label>' : ""}
      ${search ? '<label class="field"><span>תקציב בשקלים (רשות)</span><input name="budget" type="text" inputmode="numeric" maxlength="14"></label>' : ""}
      ${intent === "rent" || intent === "let" ? '<label class="field"><span>מועד כניסה (רשות)</span><input name="move-in" type="date"></label>' : ""}
      ${owner ? '<label class="field"><span>סוג הנכס (רשות)</span><select name="type"><option value="">לבחירת סוג</option><option>דירה</option><option>בית פרטי</option><option>נכס מסחרי</option><option>אחר</option></select></label>' : ""}
      ${feedback ? field("accessPage", "באיזה עמוד נתקלתם בקושי? (רשות)", 'maxlength="250"') : ""}
      <div class="field"><label for="inquiry-message">${feedback ? "תיאור התקלה או ההתאמה הדרושה (חובה)" : "הודעה (רשות)"}</label><textarea id="inquiry-message" name="message" maxlength="600" ${feedback ? 'required aria-describedby="error-message"' : ""}></textarea>${feedback ? '<span id="error-message" class="input-error" hidden></span>' : ""}</div>
      <div class="inquiry-consent"><input id="inquiry-consent" name="consent" type="checkbox" required aria-describedby="error-consent"><label for="inquiry-consent">אני מסכים או מסכימה לשימוש בפרטים לצורך טיפול בפנייה.</label><span id="error-consent" class="input-error" hidden></span></div>
      <button class="button primary" type="submit">שליחת פנייה ${icon("left")}</button>
    </form>
  </div>`;
}

function fieldError(input, message) {
  const hint = document.querySelector(`#error-${input.name}`);
  input.setAttribute("aria-invalid", String(Boolean(message)));
  hint.textContent = message;
  hint.hidden = !message;
}

export function initDialogs() {
  const dialog = document.querySelector("#dialog");
  const body = document.querySelector("#dialog-body");
  let opener;

  function show(view, markup, trigger) {
    if (!dialog.open) opener = trigger ?? document.activeElement;
    dialog.dataset.view = view;
    body.innerHTML = `<button class="dialog-close" type="button" data-dismiss aria-label="סגירה">${icon("close")}</button>${markup}`;
    dialog.setAttribute("aria-labelledby","dialog-title");
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    body.querySelector("#dialog-title").focus({preventScroll: true});
  }

  function success(intent, property, id) {
    show("success", `<div class="dialog-content dialog-success">
      <span class="success-icon">${icon("check")}</span>
      <h2 id="dialog-title" tabindex="-1">הפנייה נקלטה</h2>
      <p class="dialog-copy">${labels[intent]}${property ? ` · ${escaped(property.title)} · ${escaped(property.town)}` : ""}</p>
      <p class="demo-note">${icon("info")}${intent==="access"?`נפתחה משימת טיפול במשרד. מספר פנייה <bdi>${escaped(id)}</bdi>.`:"הפנייה נשמרה במערכת המשרד."}</p>
      <button class="button primary" type="button" data-dismiss>חזרה לאתר</button>
    </div>`);
  }

  function showInquiry(intent, property, trigger) {
    show("inquiry", inquiryMarkup(intent, property), trigger);
    const form = body.querySelector("form");
    // Values passed from the page (search filters, city pages): data-prefill-town / -budget / -rooms / -deal
    for (const [key, value] of Object.entries(trigger?.dataset ?? {})) {
      if (!key.startsWith("prefill") || !value) continue;
      const name = {Town:"town",Budget:"budget",Rooms:"rooms",Deal:intent==="alert"?"alertDeal":"valuationDeal"}[key.slice(7)];
      const field = name && form.elements[name];
      if (field && (field.tagName !== "SELECT" || [...field.options].some(option => (option.value || option.text) === value))) field.value = value;
    }
    const alert = form.querySelector("#inquiry-error");
    const inputs = [...form.querySelectorAll("[required]")];
    for (const input of inputs) input.addEventListener("input", () => fieldError(input, ""));
    const requestId = crypto.randomUUID();
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const errors = {
        name: value => value.trim().length < 2 ? "יש להזין שם באורך שני תווים לפחות." : "",
        phone: value => !validPhone(value) ? "יש להזין טלפון ישראלי, למשל 050-0000000." : "",
        message: value => !value.trim() ? "יש לתאר בקצרה את בעיית הנגישות." : "",
        consent: (_,input) => input.checked ? "" : "יש לסמן הסכמה לפני שליחה.",
      };
      let first;
      for (const input of inputs) {
        const message = errors[input.name](input.value,input);
        fieldError(input, message);
        if (message && !first) first = input;
      }
      alert.textContent = "יש לבדוק את השדות המסומנים.";
      alert.hidden = !first;
      if (first) {first.focus();return;}
      const values=Object.fromEntries(new FormData(form));
      const budget=values.budget?parsePrice(values.budget):null;
      if (Number.isNaN(budget)) {alert.textContent="יש להזין תקציב בספרות.";alert.hidden=false;form.elements.budget.focus();return;}
      const submit=form.querySelector("button[type=submit]");
      submit.disabled=true;
      try {
        let sentIntent=intent, message=values.message??"";
        if(intent==="valuation"){
          sentIntent=values.valuationDeal||"sell";
          message=["בקשת הערכת שווי לנכס",values.valuationDeal===""?"(עדיין לא הוחלט אם למכור או להשכיר)":"",values.street&&`רחוב/קומה: ${values.street}`,message].filter(Boolean).join("\n");
        }
        if(intent==="alert"){
          sentIntent=values.alertDeal==="rent"?"rent":"buy";
          message=["ביקש/ה עדכון כשיעלה נכס מתאים",message].filter(Boolean).join("\n");
        }
        const area=values.area?Number(String(values.area).replace(/[^\d.]/g,""))||null:null;
        const response=await fetch("/api/inquiries",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
          ...values,budget,area,rooms:values.rooms||null,message,moveIn:values["move-in"],consent:true,intent:sentIntent,propertyId:property?.id,requestId,source:new URLSearchParams(location.search).get("utm_source"),
        })});
        const result=await response.json();
        if(!response.ok) throw Error(result.error??"הפנייה לא נקלטה.");
        if(form.isConnected) success(intent,property,result.id);
      } catch(problem) {
        if(form.isConnected) {alert.textContent=problem.message;alert.hidden=false;}
      } finally {submit.disabled=false;}
    });
  }

  document.addEventListener("click", event => {
    const target = event.target.closest("[data-contact], [data-market], [data-calculator], [data-dismiss]");
    if (!target) return;
    if (target.hasAttribute("data-dismiss")) {
      dialog.close();
      return;
    }
    if (target.hasAttribute("data-contact")) {
      const intent = target.dataset.contact || "general";
      if (intent==="visit") {
        location.assign(target.dataset.contactProperty?`/visit?property=${encodeURIComponent(target.dataset.contactProperty)}`:"/visit");
        return;
      }
      showInquiry(intent, lookup(target.dataset.contactProperty), target);
      return;
    }
    const property = lookup(target.dataset.market ?? target.dataset.calculatorProperty);
    if (target.hasAttribute("data-market") && property) {
      show("market", marketMarkup(property, ""), target);
      bindMarket(body, property);
    } else if (target.dataset.calculator === "betterment") {
      show("calculator",bettermentMarkup(),target);
      bindBetterment(body);
    } else if (target.dataset.calculator === "yield") {
      show("calculator", yieldMarkup(property?.price, property?.id), target);
      bindYield(body);
    } else if (target.dataset.calculator) {
      show("calculator", calculatorMarkup(target.dataset.calculator, property?.price, ""), target);
      bindCalculator(body, target.dataset.calculator);
    }
  });
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    dialog.removeAttribute("aria-labelledby");
    body.replaceChildren();
    if (opener?.isConnected) opener.focus({preventScroll: true});
  });
}
