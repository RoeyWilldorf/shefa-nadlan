import {parsePrice} from "./listings.mjs";

const number=new Intl.NumberFormat("he-IL",{maximumFractionDigits:2});
const money=value=>`<bdi>${number.format(value)} ₪</bdi>`;
const officialGuide="https://www.gov.il/he/pages/bidguide?chapterIndex=3";
const reviewDate="2026-11-19";

function invalid(field,message){
  throw Object.assign(new Error(message),{field});
}

function amount(value,field){
  const result=parsePrice(value??"");
  if(!Number.isSafeInteger(result)||result<0||result>1000000000)
    invalid(field,"יש להזין סכום בשקלים שלמים, בין 0 למיליארד, עם או בלי פסיקים.");
  return result;
}

function percent(value,field,allowZero){
  const text=String(value??"").trim();
  if(!/^\d{1,3}(?:\.\d{1,2})?$/.test(text))
    invalid(field,"יש להזין אחוז תקין עם עד שתי ספרות אחרי הנקודה.");
  const result=Number(text);
  if(result>100||(allowZero?result<0:result<=0))
    invalid(field,allowZero?"יש להזין שיעור בין 0 ל־100 אחוז.":"יש להזין חלק זכויות גדול מ־0 ועד 100 אחוז.");
  return result;
}

export function estimateBetterment({method="uplift",uplift,before,after,share="100",rateMode="standard",rate}={}){
  if(!["uplift","values"].includes(method)) invalid("method","יש לבחור דרך לחישוב ההשבחה.");
  if(!["standard","documented"].includes(rateMode)) invalid("rateMode","יש לבחור שיעור היטל.");
  const change=method==="values"?amount(after,"after")-amount(before,"before"):amount(uplift,"uplift");
  const ownership=percent(share,"share",false);
  const levyRate=rateMode==="standard"?50:percent(rate,"rate",true);
  const increase=Math.max(0,change);
  const shareIncrease=increase*ownership/100;
  return {increase,shareIncrease,ownership,rate:levyRate,total:Math.round(shareIncrease*levyRate)/100};
}

function amountField(name,label){
  return `<div class="field"><label for="levy-${name}">${label}</label>
    <input id="levy-${name}" name="${name}" type="text" inputmode="numeric" maxlength="14" dir="ltr" required aria-describedby="levy-error-${name}">
    <span id="levy-error-${name}" class="input-error" hidden></span></div>`;
}

export function bettermentMarkup(){
  return `<div class="dialog-content dialog-form calc-dialog betterment-dialog">
    <h2 id="dialog-title" tabindex="-1">מחשבון היטל השבחה</h2>
    <p class="dialog-copy">אומדן בגין עליית שווי בעקבות אישור תכנית, הקלה או שימוש חורג. סכום ההשבחה נקבע בשומה ביחס למועד הקובע.</p>
    <form class="tax-form" id="betterment-form" novalidate>
      <div class="field"><label for="levy-method">איך תרצו להזין את ההשבחה?</label>
        <select id="levy-method" name="method"><option value="uplift">יש לי סכום השבחה</option><option value="values">שווי לפני ואחרי השינוי התכנוני</option></select>
      </div>
      <div data-levy-uplift>${amountField("uplift","סכום ההשבחה למלוא הזכויות (₪)")}</div>
      <fieldset data-levy-values hidden disabled><legend>שווי המקרקעין באותו מועד קובע</legend>
        <p class="levy-help">הזינו שווי במצב התכנוני הקודם והחדש לאותו מועד. יש לכלול את השינוי הנובע מהתכנון בלבד.</p>
        <div class="calc-fields">${amountField("before","שווי במצב התכנוני הקודם (₪)")}${amountField("after","שווי במצב התכנוני החדש (₪)")}</div>
      </fieldset>
      <div class="calc-fields">
        <div class="field"><label for="levy-share">חלק הזכויות שלכם (%)</label>
          <input id="levy-share" name="share" type="number" min="0.01" max="100" step="0.01" value="100" inputmode="decimal" dir="ltr" required aria-describedby="levy-share-help levy-error-share">
          <span id="levy-share-help" class="levy-help">למשל 50 עבור מחצית הזכויות.</span><span id="levy-error-share" class="input-error" hidden></span>
        </div>
        <div class="field"><label for="levy-rate-mode">שיעור ההיטל</label>
          <select id="levy-rate-mode" name="rateMode"><option value="standard">שיעור רגיל · 50%</option><option value="documented">שיעור לפי שומה או החלטה</option></select>
        </div>
      </div>
      <fieldset data-levy-rate hidden disabled><legend>שיעור שנקבע לנכס</legend>
        <div class="field"><label for="levy-rate">השיעור שנקבע (%)</label>
          <input id="levy-rate" name="rate" type="number" min="0" max="100" step="0.01" inputmode="decimal" dir="ltr" required aria-describedby="levy-rate-help levy-error-rate">
          <span id="levy-rate-help" class="levy-help">יש להזין שיעור מיוחד רק לפי שומה או החלטה החלה על הנכס. הזנת 0 מניחה פטור שנקבע.</span><span id="levy-error-rate" class="input-error" hidden></span>
        </div>
      </fieldset>
      <p class="field-error calc-error" role="alert" hidden></p>
      <button class="button primary" type="submit">חישוב אומדן היטל השבחה</button>
      <div class="calc-result" role="status" aria-atomic="true" hidden></div>
    </form>
    <p class="detail-note">החישוב לפני הצמדה, ריבית, אגרות והוצאות. פטורים, שיעורים מיוחדים וריבוי אירועי השבחה מחייבים בדיקה פרטנית. הסכום לתשלום נקבע בהליך השומה מול הוועדה המקומית.</p>
    <p class="levy-source">מידע ושיעור רגיל נבדקו ב־<time datetime="${reviewDate}">19.11.2026</time> לפי <a class="inline-link" href="${officialGuide}" target="_blank" rel="noopener noreferrer">מדריך מינהל התכנון להיטל השבחה (נפתח בחלון חדש)</a>.</p>
    <button class="button outline yield-inquiry" type="button" data-contact="sell">שיחה עם שפע נדל״ן על מכירת נכס</button>
  </div>`;
}

export function bindBetterment(container){
  const form=container.querySelector("#betterment-form");
  const result=form.querySelector(".calc-result");
  const summary=form.querySelector("[role=alert]");
  const fields=["uplift","before","after","share","rate"];
  function clear(){
    result.hidden=true;
    summary.hidden=true;
    for(const name of fields){
      form.elements[name].removeAttribute("aria-invalid");
      form.querySelector(`#levy-error-${name}`).hidden=true;
    }
  }
  function setMode(){
    const values=form.elements.method.value==="values";
    const direct=form.querySelector("[data-levy-uplift]");
    const comparisons=form.querySelector("[data-levy-values]");
    direct.hidden=values;
    form.elements.uplift.disabled=values;
    comparisons.hidden=!values;
    comparisons.disabled=!values;
    const custom=form.querySelector("[data-levy-rate]");
    custom.hidden=form.elements.rateMode.value!=="documented";
    custom.disabled=custom.hidden;
  }
  form.addEventListener("input",clear);
  form.addEventListener("change",()=>{clear();setMode();});
  form.addEventListener("submit",event=>{
    event.preventDefault();
    clear();
    try{
      const value=estimateBetterment(Object.fromEntries(new FormData(form)));
      result.innerHTML=`<span>אומדן היטל לחלק הזכויות שלכם</span><strong>${money(value.total)}</strong>
        <dl class="yield-results"><div><dt>השבחה למלוא הזכויות</dt><dd>${money(value.increase)}</dd></div>
        <div><dt>חלק הזכויות</dt><dd><bdi>${number.format(value.ownership)}%</bdi></dd></div>
        <div><dt>שיעור ההיטל שהוזן</dt><dd><bdi>${number.format(value.rate)}%</bdi></dd></div></dl>
        <p>לפני הצמדה וריבית.${value.increase===0?" לפי הנתונים שהוזנו, אין עליית שווי חיובית. יש לברר את החבות מול הוועדה המקומית.":""}</p>`;
      result.hidden=false;
    }catch(problem){
      summary.textContent=problem.message;
      summary.hidden=false;
      const input=form.elements.namedItem(problem.field);
      if(input){
        const hint=form.querySelector(`#levy-error-${problem.field}`);
        input.setAttribute("aria-invalid","true");
        if(hint){hint.textContent=problem.message;hint.hidden=false;}
        input.focus();
      }
    }
  });
  setMode();
}
