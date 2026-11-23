import {properties as examples} from "./listings.mjs";

const view=document.querySelector("#visit-view");
const e=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const format=new Intl.NumberFormat("he-IL",{maximumFractionDigits:2});
const calendarDay=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jerusalem",year:"numeric",month:"2-digit",day:"2-digit"});
const readableDay=new Intl.DateTimeFormat("he-IL",{timeZone:"Asia/Jerusalem",dateStyle:"long"});
const windows={"":"ללא העדפה",morning:"בוקר",afternoon:"צהריים",evening:"ערב"};
const deals={sale:"מכירה",rent:"השכרה"};
const params=new URLSearchParams(location.search);
const selected=new Set();
let catalog=[];
let mode="sample";
let availability={configured:false,deals:[]};
let preferred={day:"",window:""};
const heading=(title,focus=true)=>'<h1 tabindex="-1"'+(focus?' data-heading':'')+'>'+title+'</h1>';
const field=(name,label,attrs="",value="")=>'<label class="field"><span>'+label+'</span><input name="'+name+'" '+attrs+' value="'+e(value)+'"></label>';
const button=(text,extra="",kind="primary")=>'<button class="button '+kind+'" '+extra+'>'+text+'</button>';
const errorLine='<p class="visit-error" data-error role="alert" tabindex="-1" hidden></p>';
const price=p=>format.format(p.price)+" ₪"+(p.deal==="rent"?" לחודש":"");
const fee=(f,type)=>f.amount===0?"ללא דמי תיווך":(f.mode==="fixed"?format.format(f.amount)+" ₪":format.format(f.amount)+"% "+(type==="rent"?"מדמי השכירות החודשיים המוסכמים":"ממחיר העסקה המוסכם"))+" · "+(f.vat==="included"?"כולל מע״מ":"בתוספת מע״מ");
const lookup=id=>catalog.find(p=>p.id===id);
const contact='<a class="visit-link" href="tel:+972527504034">אפשר לפנות למשרד בטלפון</a>';

async function request(path,data) {
  const res=await fetch("/api/visits/"+path,data?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)}:{cache:"no-store"});
  const result=await res.json();
  if (!res.ok) throw Error(result.error??"הפעולה לא הושלמה.");
  return result;
}
function present(html) {
  view.innerHTML=html;
  view.querySelector("[data-heading]")?.focus({preventScroll:true});
  window.scrollTo({top:0});
}
function showError(container,message) {
  const alert=container.querySelector("[data-error]");
  alert.textContent=message;
  alert.hidden=false;
  alert.focus();
}
function selectionPage() {
  const canSign=availability.signingApproved&&availability.configured&&availability.deals.length>0;
  const real=catalog.some(p=>p.publishedAt);
  present(heading("תיאום סיור בנכסים")+
    '<p>בחרו נכס אחד או כמה נכסים לביקור, השוו את הפרטים ובדקו את הזמנת התיווך לפני חתימה.</p>'+
    '<form id="choose"><section class="visit-panel" aria-labelledby="selection-title"><h2 id="selection-title">בחירת נכסים</h2>'+
    (real?'<div class="visit-mode" role="group" aria-label="סוג הנכסים">'+button("נכסי המשרד",'type="button" data-mode="real" aria-pressed="'+(mode==="real")+'"',"outline")+button("נכסי הדגמה",'type="button" data-mode="sample" aria-pressed="'+(mode==="sample")+'"',"outline")+'</div>':'')+
    (mode==="sample"?'<p class="visit-notice">הנכסים והעמלות במסלול זה להמחשה בלבד. אפשר לעבור על הטופס עם פרטי דוגמה.</p>':
      !canSign?'<p class="visit-notice">בקשת הסיור תישלח למשרד לבדיקה ואישור.</p>':'')+
    '<p id="selected-count" role="status"></p><div id="selected-list" class="visit-selected"></div>'+
    field("search","חיפוש לפי יישוב או שם נכס",'type="search" id="visit-search"')+
    '<div class="visit-picker" id="property-choices"></div></section>'+
    '<section class="visit-panel"><h2>מועד מועדף</h2><p>אפשר לציין יום ושעה מועדפים. המשרד יתאם את המועד מולכם.</p><div class="visit-fields">'+
    field("day","יום מועדף",'type="date" min="'+calendarDay.format(new Date())+'"',preferred.day)+
    '<label class="field"><span>חלון שעות</span><select name="window">'+Object.entries(windows).map(([key,label])=>'<option value="'+key+'" '+(key===preferred.window?'selected':'')+'>'+label+'</option>').join("")+'</select></label></div></section>'+
    errorLine+'<div class="visit-actions">'+button(mode==="sample"||canSign?"עיון בטופס התיווך":"המשך לבקשת סיור",'type="submit"')+'</div></form>');
  const form=view.querySelector("#choose");
  const search=form.elements.search;
  const eligible=()=>catalog.filter(p=>mode==="sample"?!p.publishedAt:Boolean(p.publishedAt));
  function renderOptions() {
    const filter=search.value.trim().toLowerCase();
    form.querySelector("#property-choices").innerHTML=eligible().filter(p=>[p.title,p.town,p.neighborhood].join(" ").toLowerCase().includes(filter)).map(p=>
      '<label class="visit-option"><input type="checkbox" value="'+p.id+'" data-choice '+(selected.has(p.id)?"checked":"")+
      '><span><strong>'+e(p.title)+'</strong><small>'+e(p.town)+' · '+deals[p.deal]+' · '+price(p)+'</small></span></label>').join("")||'<p>אין נכסים שתואמים לחיפוש.</p>';
  }
  function renderSelected() {
    form.querySelector("#selected-count").textContent=selected.size?"נכסים שנבחרו "+selected.size:"בחרו את הנכסים שתרצו לראות.";
    form.querySelector("#selected-list").innerHTML=[...selected].map(lookup).filter(Boolean).map(p=>
      '<article class="visit-tile"><h3>'+e(p.title)+'</h3><small>'+e(p.town)+' · '+e(p.type)+
      (p.rooms?' · '+p.rooms+' חדרים':'')+(p.area?' · '+p.area+' מ״ר':'')+'</small><strong>'+price(p)+'</strong><br>'+
      button("הסרה",'type="button" data-remove="'+p.id+'" aria-label="הסרת '+e(p.title)+'"',"outline")+'</article>').join("");
  }
  function savePreferred() {preferred={day:form.elements.day.value,window:form.elements.window.value};}
  search.addEventListener("input",renderOptions);
  form.addEventListener("change",event=>{
    const item=event.target;
    if (!item.matches("[data-choice]")) return;
    if (item.checked&&selected.size>=10) {item.checked=false;showError(form,"אפשר לבחור עד עשרה נכסים בבקשה אחת.");return;}
    if (item.checked) selected.add(item.value);
    else selected.delete(item.value);
    form.querySelector("[data-error]").hidden=true;
    renderSelected();
  });
  form.addEventListener("click",event=>{
    const control=event.target.closest("[data-mode],[data-remove]");
    if (!control) return;
    if (control.dataset.remove) {
      selected.delete(control.dataset.remove);
      renderSelected();
      renderOptions();
      search.focus({preventScroll:true});
    }
    if (control.dataset.mode&&control.dataset.mode!==mode) {
      savePreferred();
      mode=control.dataset.mode;
      selected.clear();
      selectionPage();
    }
  });
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    savePreferred();
    if (!selected.size) {showError(form,"יש לבחור לפחות נכס אחד.");return;}
    if(mode==="real"&&!canSign){inquiryPage();return;}
    const submit=form.querySelector("[type=submit]");
    submit.disabled=true;
    try {const prepared=await request("quote",{properties:[...selected],...preferred});if (form.isConnected) formPage(prepared);}
    catch(problem) {if (form.isConnected) showError(form,problem.message);}
    finally {submit.disabled=false;}
  });
  renderSelected();
  renderOptions();
}
function inquiryPage(){
  const ids=[...selected];
  const id=crypto.randomUUID();
  present(heading("בקשת תיאום סיור")+`<p>${ids.map(key=>e(lookup(key)?.title)).join(" · ")}</p>
    <form id="visit-inquiry" class="visit-panel"><div class="visit-fields">${field("name","שם מלא",'required maxlength="80" autocomplete="name"')}
    ${field("phone","מספר טלפון לחזרה",'required type="tel" dir="ltr" maxlength="25" autocomplete="tel"')}</div>
    <label class="visit-check"><input name="consent" type="checkbox" required> <span>אני מאשר למשרד להשתמש בפרטים כדי לחזור אליי לגבי הסיור.</span></label>
    ${errorLine}<div class="visit-actions">${button("שליחת בקשת סיור",'type="submit"')}${button("חזרה לבחירת נכסים",'type="button" data-back',"outline")}</div></form>`);
  const form=view.querySelector("form");
  form.querySelector("[data-back]").onclick=selectionPage;
  form.onsubmit=async event=>{
    event.preventDefault();
    const submit=form.querySelector("[type=submit]");
    submit.disabled=true;
    try{
      const fields=Object.fromEntries(new FormData(form));
      const response=await fetch("/api/inquiries",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        name:fields.name,phone:fields.phone,consent:fields.consent==="on",intent:"visit",
        propertyId:ids[0],propertyIds:ids,visitDay:preferred.day,visitWindow:preferred.window,requestId:id})});
      const result=await response.json();
      if(!response.ok) throw Error(result.error??"שליחת הבקשה נכשלה.");
      if(form.isConnected) present(heading("בקשת הסיור נקלטה")+'<p>המשרד יחזור אליכם לאישור מועד.</p><a class="button outline" href="/#listings">חזרה לנכסים</a>');
    }catch(problem){if(form.isConnected) showError(form,problem.message);}
    finally{submit.disabled=false;}
  };
}
function termsMarkup(terms,oldFees) {
  const broker=terms.broker;
  return '<section class="visit-panel"><h2>פרטי המתווך</h2><p>'+e(broker.name)+' · מספר זהות <bdi>'+e(broker.identity)+
    '</bdi> · רישיון <bdi>'+e(broker.license)+'</bdi></p><p>'+e(broker.address)+(broker.phone?' · <bdi>'+e(broker.phone)+'</bdi>':'')+
    '</p></section><section class="visit-panel"><h2>הנכסים ודמי התיווך</h2><div class="visit-terms">'+terms.properties.map(p=>
      '<article class="visit-term"><h3>'+e(p.title)+'</h3><p>'+e(p.type)+' · '+e(p.address)+' · '+e(p.town)+
      '</p><p>'+deals[p.deal]+' · מחיר מבוקש בקירוב '+price(p)+'</p>'+
      (oldFees?.[p.id]?'<p>עמלה בגרסה הקודמת '+fee(oldFees[p.id],p.deal)+'</p>':'')+
      '<strong>דמי תיווך '+fee(p.fee,p.deal)+'</strong></article>').join("")+
    '</div><p>'+e(terms.orderText)+'</p>'+(terms.paymentTerms?'<p><strong>תנאי תשלום</strong> '+e(terms.paymentTerms)+'</p>':'')+
    '<p class="visit-notice">'+e(terms.feeChange)+'</p></section>';
}
function customerFields(example) {
  const attr=example?' readonly':' required';
  return '<div class="visit-fields">'+field("firstName","שם פרטי",'maxlength="60" autocomplete="given-name"'+attr,example?"לקוח":"")+
    field("lastName","שם משפחה",'maxlength="60" autocomplete="family-name"'+attr,example?"לדוגמה":"")+
    field("identity","מספר תעודת זהות",'inputmode="numeric" pattern="[0-9]{9}" maxlength="9" dir="ltr" autocomplete="off"'+attr,example?"000000000":"")+
    field("phone","טלפון לחזרה",'type="tel" maxlength="25" dir="ltr" autocomplete="tel"'+attr,example?"0500000000":"")+
    field("email","דוא״ל (רשות)",'type="email" maxlength="180" dir="ltr" autocomplete="email"'+(example?' readonly':''))+
    '<div class="wide">'+field("address","כתובת מגורים מלאה",'maxlength="200" autocomplete="street-address"'+attr,example?"רחוב לדוגמה 1, גדרה":"")+'</div></div>';
}
function formPage(prepared,amendment="") {
  const {terms,ticket,fullName,oldFees,brokerAcceptance}=prepared;
  const sample=terms.example;
  present(heading(amendment?"אישור שינוי דמי התיווך":"הזמנה בכתב לשירותי תיווך והצגת נכסים")+
    (sample?'<p class="visit-notice">הדגמה עם פרטים ועמלות להמחשה בלבד.</p>':'')+
    termsMarkup(terms,oldFees)+(brokerAcceptance?'<p>הצעת העמלה אושרה בידי המתווך '+e(brokerAcceptance.name)+'.</p>':'')+
    '<form id="sign"><section class="visit-panel"><h2>'+(amendment?"אישור הלקוח":"פרטי הלקוח")+'</h2>'+
    (amendment?'<p>'+e(fullName)+'</p>':customerFields(sample))+
    '<p>תאריך החתימה יירשם אוטומטית לפי שעון ישראל. היום '+readableDay.format(new Date())+'.</p><p class="visit-notice">'+e(terms.consentText)+'</p>'+
    field("signature",sample?"חתימה להמחשה":"חתימה אלקטרונית בהקלדת השם המלא",'required maxlength="130" autocomplete="off"'+(sample?' readonly':''),sample?"לקוח לדוגמה":"")+
    '<label class="visit-check"><input type="checkbox" required name="accepted"><span>קראתי את ההזמנה ואת דמי התיווך לכל נכס ואני מסכים או מסכימה לתנאים.</span></label>'+
    '<label class="visit-check"><input type="checkbox" required name="privacy"><span>אני מאשר או מאשרת את השימוש בפרטים למטרות המפורטות בטופס.</span></label>'+
    errorLine+'<div class="visit-actions">'+button(sample?"סיום הדגמה":amendment?"חתימה על עדכון העמלה":"חתימה ושליחת בקשת סיור",'type="submit"')+
    (amendment?'':button("חזרה לבחירת נכסים",'type="button" id="back-to-selection"',"outline"))+'</div></section></form>');
  const form=view.querySelector("#sign");
  form.querySelector("#back-to-selection")?.addEventListener("click",selectionPage);
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    const formData=new FormData(form);
    if (sample) {done("",true);return;}
    const submit=form.querySelector("[type=submit]");
    submit.disabled=true;
    const data={...Object.fromEntries(formData),accepted:formData.has("accepted"),privacy:formData.has("privacy")};
    try {
      const result=await request(amendment?"amend/"+amendment:"sign",amendment?data:{...data,ticket});
      if (form.isConnected) done(result.id,false,Boolean(amendment));
    } catch(problem) {if (form.isConnected) showError(form,problem.message);}
    finally {submit.disabled=false;}
  });
}
function done(id,sample,amended=false) {
  present('<section class="visit-panel">'+heading(sample?"ההדגמה הסתיימה":amended?"נשמר נוסח עמלה מעודכן":"בקשת הסיור והטופס נקלטו")+
    '<p>'+(sample?"זו הייתה הדגמה בלבד. לא נשלחה בקשת פגישה.":amended?"אפשר לפתוח עותק של הגרסה המעודכנת.":"המשרד ייצור קשר לתיאום המועד. אפשר לפתוח עותק של ההזמנה החתומה ולהדפיס או לשמור אותו.")+'</p>'+
    '<div class="visit-actions">'+(id?'<a class="button primary" href="/visit/copy/'+e(id)+'">פתיחת עותק ההזמנה</a>':'')+
    '<a class="button outline" href="/#listings">חזרה לנכסים</a></div></section>');
}
async function start() {
  try {
    const amendment=params.get("amend");
    if (amendment) {
      const prepared=await request("amend/"+encodeURIComponent(amendment));
      if (prepared.signed) done(prepared.id,false,true);
      else formPage(prepared,amendment);
      return;
    }
    const [live,status]=await Promise.all([fetch("/api/catalog").then(res=>res.ok?res.json():{}).catch(()=>({})),request("options")]);
    availability=status;
    catalog=[...(live.properties??[]),...examples];
    const initial=lookup(params.get("property"));
    mode=initial?(initial.publishedAt?"real":"sample"):(catalog.some(p=>p.publishedAt)?"real":"sample");
    if (initial) selected.add(initial.id);
    selectionPage();
  } catch(problem) {
    present(heading("תיאום סיור בנכסים")+'<p class="visit-error" role="alert">'+e(problem.message)+'</p><p>'+contact+'.</p>');
  }
}
await start();
