// Mortgage calculator (fixed-rate, equal monthly payments - "Spitzer").
const form=document.querySelector("#mortgage-form");
const out=document.querySelector("#mortgage-result");
const nis=new Intl.NumberFormat("he-IL",{maximumFractionDigits:0});
const num=value=>Number(String(value).replace(/[^\d.]/g,""));
function calc() {
  const v=Object.fromEntries(new FormData(form));
  const price=num(v.price), equity=num(v.equity), rate=num(v.rate), years=num(v.years), maxLtv=Number(v.buyer);
  if (!price||!years||equity>=price||rate>30||years>40) {out.innerHTML='<p class="field-error">יש לבדוק את הנתונים: הון עצמי קטן ממחיר הדירה, תקופה עד 40 שנה.</p>';return;}
  const loan=price-equity, n=years*12, r=rate/100/12;
  const monthly=r?loan*r/(1-Math.pow(1+r,-n)):loan/n;
  const interest=monthly*n-loan;
  const minEquity=price*(1-maxLtv);
  const warn=equity<minEquity?`<p class="mortgage-warn">⚠️ לסוג רכישה זה נדרש הון עצמי של לפחות <bdi>${nis.format(minEquity)} ₪</bdi> (${Math.round((1-maxLtv)*100)}% ממחיר הדירה).</p>`:"";
  out.innerHTML=`<div class="mortgage-main"><span>החזר חודשי משוער</span><strong><bdi>${nis.format(monthly)} ₪</bdi></strong></div>
    <dl class="property-facts"><div><dt>סכום המשכנתא</dt><dd><bdi>${nis.format(loan)} ₪</bdi></dd></div><div><dt>שיעור מימון</dt><dd>${Math.round(loan/price*100)}%</dd></div>
    <div><dt>סך הריבית לכל התקופה</dt><dd><bdi>${nis.format(interest)} ₪</bdi></dd></div><div><dt>סך כל ההחזרים</dt><dd><bdi>${nis.format(monthly*n)} ₪</bdi></dd></div></dl>${warn}`;
}
form?.addEventListener("input",calc);
form?.addEventListener("change",calc);
if (form) calc();
