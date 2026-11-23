import {propertyStates,leadStates,intents,channels,featureNames,supportedTypes,matchProperty} from "./office-model.mjs";
import {bindBrandStudio} from "./brand-studio.mjs";
import {withBrandContacts} from "./brand.mjs";
import {mountProspects} from "./prospect-office.mjs";
import {officeOperations} from "./operations-office.mjs";

const byId=id=>document.getElementById(id);
const view=byId("office-view");
const status=byId("office-status");
const error=byId("office-error");
const dialog=byId("office-dialog");
const edit=byId("edit-body");
const currency=new Intl.NumberFormat("he-IL");
const time=new Intl.DateTimeFormat("he-IL",{dateStyle:"short",timeStyle:"short",timeZone:"Asia/Jerusalem"});
const pageNames={dashboard:"סקירה",properties:"נכסים",leads:"לידים ולקוחות",work:"משימות וסיורים",deals:"עסקאות ועמלות",marketing:"סטודיו שיווק","visit-forms":"טופסי תיווך",prospects:"שפע מודיעין"};
const safe=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=value=>value?`<bdi>${currency.format(value)} ₪</bdi>`:"";
const stamp=value=>value?time.format(new Date(value)):"";
const propertyName=(id, list=state?.properties??[])=>list.find(x=>x.id===id)?.title??(id&&!id.includes("-0")?"נכס מקושר":"");
const option=(value,label,current)=>`<option value="${safe(value)}"${value===current?" selected":""}>${safe(label)}</option>`;
const options=(dict,current)=>Object.entries(dict).map(([value,label])=>option(value,label,current)).join("");
const select=(name,label,values,current,required=false)=>`<label class="field"><span>${label}</span><select name="${name}" ${required?"required":""}>${options(values,current)}</select></label>`;
const input=(name,label,value="",attrs="")=>`<label class="field"><span>${label}</span><input name="${name}" value="${safe(value)}" ${attrs}></label>`;
const area=(name,label,value="",max=5000)=>`<label class="field wide"><span>${label}</span><textarea name="${name}" maxlength="${max}">${safe(value)}</textarea></label>`;
const badge=label=>`<span class="office-pill">${safe(label)}</span>`;
const button=(action,label,id="",kind="outline")=>`<button type="button" class="button ${kind}" data-action="${action}"${id?` data-id="${id}"`:""}>${label}</button>`;
const actionRow=content=>`<div class="office-actions">${content}</div>`;
const panel=(title,body)=>`<section class="office-panel"><h2>${title}</h2>${body}</section>`;
const empty=message=>`<p class="office-panel">${message}</p>`;
let state;
let opener;
let requestKey;
let studioSeq=0;

async function api(path,{method="GET",data,body}={}) {
  const response=await fetch(`/api/office/${path}`,{method,body:body??(data?JSON.stringify(data):undefined),headers:data?{"Content-Type":"application/json"}:undefined});
  const result=await response.json();
  if (!response.ok) throw Error(result.error??"הבקשה נכשלה.");
  return result;
}
async function refresh(message="") {
  try {
    state=await api("state");
    error.hidden=true;
    render();
    status.textContent=message;
  } catch(problem) {
    error.textContent=problem.message;
    error.hidden=false;
    status.textContent="";
  }
}
function currentPage() {
  const id=location.hash.slice(1);
  return Object.hasOwn(pageNames,id)?id:"dashboard";
}
function navRender() {
  const page=currentPage();
  byId("office-heading").textContent=pageNames[page];
  for(const link of document.querySelectorAll(".office-nav a")) {
    if(link.hash===`#${page}`) link.setAttribute("aria-current","page");
    else link.removeAttribute("aria-current");
  }
}
function render() {
  navRender();
  if (!state) return;
  const page=currentPage();
  if(page==="prospects"){
    view.innerHTML='<div id="prospect-office"></div>';
    mountProspects(byId("prospect-office"),{api,showEdit,dialog,submitting,select,input,area,safe,actionRow});
    return;
  }
  if(page==="deals"){
    view.innerHTML='<div id="deals-office"></div>';
    ops.mountLedger(byId("deals-office"));
    return;
  }
  view.innerHTML={dashboard,properties:propertiesPage,leads:leadsPage,work:workPage,marketing:marketingPage,"visit-forms":visitFormsPage}[page]();
}
function listLine(title,sub,actions) {
  return `<article class="office-item"><div><h3>${safe(title)}</h3><p class="office-small">${sub}</p></div>${actions}</article>`;
}
function dashboard() {
  const {stats,leads,work}=state;
  const metrics=[["פעילים למכירה",stats.activeSales],["פעילים להשכרה",stats.activeRentals],["במשא ומתן",stats.negotiation],["נמכרו",stats.sold],["הושכרו",stats.rented],
    ["לידים חדשים",stats.newLeads],["לידים פתוחים",stats.openLeads],["בעלי נכסים מאומתים",stats.verifiedProspects],["סיורים קרובים",stats.upcomingTours],
    ["משימות פתוחות",stats.openTasks],["משימות באיחור",stats.lateTasks]];
  const stageCounts=Object.fromEntries(Object.keys(leadStates).map(key=>[key,leads.filter(x=>x.stage===key).length]));
  const stageRows=`<ul class="office-bars">${Object.entries(stageCounts).map(([key,count])=>`<li><span>${leadStates[key]}</span><progress aria-label="${leadStates[key]}" max="${Math.max(1,leads.length)}" value="${count}"></progress><span>${count}</span></li>`).join("")}</ul>`;
  const sources=new Map();
  for (const lead of leads) sources.set(lead.source,(sources.get(lead.source)??0)+1);
  const sourceRows=sources.size?`<ul class="office-files">${[...sources].map(([label,count])=>`<li>${safe(label)} · ${count}</li>`).join("")}</ul>`:"<p class=office-small>מקורות יופיעו לאחר קליטת פניות.</p>";
  const next=work.filter(item=>item.status==="open"&&item.starts_at&&item.starts_at>=new Date().toISOString()).sort((a,b)=>a.starts_at.localeCompare(b.starts_at)).slice(0,5);
  return `<section class="office-metrics" aria-label="מדדי פעילות">${metrics.map(([name,value])=>`<div class="office-metric"><strong>${value}</strong><span>${name}</span></div>`).join("")}</section>
  <div class="office-panels">${panel("משפך לידים",stageRows)}${panel("מקורות פניות",sourceRows)}
  ${panel("יומן קרוב",next.length?`<ul class="office-files">${next.map(x=>`<li>${safe(x.title)} · ${stamp(x.starts_at)}</li>`).join("")}</ul>`:"<p class=office-small>אין כרגע פגישות קרובות.</p>")}</div>`;
}
const propertyOptions=()=>({"":"בחרו נכס",...Object.fromEntries(state.properties.map(x=>[x.id,x.title]))});
const leadOptions=()=>({"":"בחירת פנייה (רשות)",...Object.fromEntries(state.leads.map(x=>[x.id,x.name]))});
const ops=officeOperations({api,showEdit,submitting,select,input,area,safe,actionRow,dialog,edit,stamp,propertyOptions,leadOptions});
function filters(items,keyword) {
  const value=(keyword??"").toLowerCase().trim();
  return !value||items.some(item=>String(item??"").toLowerCase().includes(value));
}
function propertyList(q="",chosen="",deal="") {
  const items=state.properties.filter(p=>(!chosen||p.status===chosen)&&(!deal||p.deal===deal)&&filters([p.title,p.town,p.neighborhood,p.property_type,p.id],q));
  return items.length?items.map(p=>listLine(p.title,`${safe(p.town)} · ${p.deal==="sale"?"מכירה":"השכרה"} · ${fmt(p.price)} · ${badge(propertyStates[p.status])}`,
    actionRow(button("edit-property","עריכה",p.id)+button("duplicate-property","שכפול",p.id)+button("property-files","קבצים ומחירים",p.id)+button("property-history","היסטוריה",p.id)+button("property-comparables","עסקאות השוואה",p.id)+button("market-property","הכנת פרסום",p.id)+button("owner-documents","מסמכים לבעל נכס",p.id)))).join(""):empty("אין נכסים מתאימים. אפשר להתחיל בהוספת נכס.");
}
function propertiesPage() {
  return `<div class="office-view-head"><p>הזנה, עריכה ובקרה על פרטי הנכס והפרסום שלו.</p>${button("edit-property","הוספת נכס","","primary")}</div>
  <div class="office-filters">${input("query","חיפוש לפי נכס או יישוב","","id=office-query type=search")}${select("status","סטטוס",{"":"כל הסטטוסים",...propertyStates},"")}${select("deal","סוג עסקה",{"":"כל העסקאות",sale:"מכירה",rent:"השכרה"},"")}</div>
  <h2 class="sr-only">רשימת נכסים</h2><div class="office-list" id="list-body">${propertyList()}</div>`;
}
function leadList(q="",chosen="") {
  const items=state.leads.filter(l=>(!chosen||l.stage===chosen)&&filters([l.name,l.phone,l.source,l.profile.town,l.assigned_to],q));
  return items.length?items.map(l=>listLine(l.name,`<bdi>${safe(l.phone)}</bdi> · ${safe(intents[l.intent]??l.intent)} · ${safe(l.source)} · ${badge(leadStates[l.stage])}${l.assigned_to?` · ${safe(l.assigned_to)}`:""}`,
    actionRow(button("edit-lead","טיפול בפנייה",l.id)+button("lead-activity","היסטוריית לקוח",l.id)+button("lead-matches","התאמות",l.id)+(l.has_visit_form?button("lead-visit","הזמנת תיווך",l.id):"")))).join(""):empty("אין פניות מתאימות. פניות מהאתר יופיעו כאן.");
}
function leadsPage() {
  return `<div class="office-view-head"><p>קליטת פניות מהאתר והזנה ידנית של לקוחות.</p>${button("edit-lead","הוספת ליד","","primary")}</div>
  <div class="office-filters">${input("query","חיפוש ליד, טלפון או מקור","","id=office-query type=search")}${select("status","שלב טיפול",{"":"כל השלבים",...leadStates},"")}</div><h2 class="sr-only">רשימת פניות</h2><div class="office-list" id="list-body">${leadList()}</div>`;
}
const taskDay=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jerusalem",year:"numeric",month:"2-digit",day:"2-digit"});
function workList(period="") {
  const now=new Date();
  const today=taskDay.format(now);
  const move=days=>new Date(Date.parse(today+"T00:00:00Z")+days*86400000).toISOString().slice(0,10);
  const inPeriod=state.work.filter(w=>{
    if(!period) return true;
    if(w.status!=="open"||!w.starts_at) return false;
    const day=taskDay.format(new Date(w.starts_at));
    if(period==="late") return w.kind==="task"&&w.starts_at<now.toISOString();
    if(period==="today") return day===today;
    if(period==="tomorrow") return day===move(1);
    return day>=today&&day<=move(6);
  });
  return inPeriod.length?inPeriod.map(w=>listLine(w.title,`${w.kind==="tour"?"סיור":"משימה"} · ${safe({open:"פתוח",done:"בוצע",cancelled:"בוטל"}[w.status])} ${w.starts_at?`· ${stamp(w.starts_at)}`:""} · ${safe(w.assigned_to)}`,actionRow(button("edit-work","עריכה",w.id)))).join(""):empty("אין משימות או סיורים מתאימים.");
}
function workPage() {
  return `<div class="office-view-head"><p>תיעוד משימות, סיורים ותוצאות. השעות מוצגות לפי שעון ישראל.</p>${button("edit-work","משימה או סיור חדשים","","primary")}</div>
  <div class="office-filters">${select("work-period","מועד",{"":"כל המועדים",today:"היום",tomorrow:"מחר",week:"7 הימים הקרובים",late:"באיחור"},"")}</div>
  <h2 class="sr-only">רשימת משימות וסיורים</h2><div id="work-list" class="office-list">${workList()}</div>`;
}
function marketingPage() {
  return `<section class="office-panel office-studio"><h2>הכנת מודעה מנכס קיים</h2><p class="office-small">אפשר להפיק, לערוך ולאשר נוסח לפי ערוץ. ההפצה מתבצעת ידנית לאחר העתקה.</p>
  <form id="studio-form"><div class="office-fields">${select("propertyId","נכס",propertyOptions(),"",true)}${select("channel","ערוץ",channels,"site",true)}</div>
  ${actionRow('<button type="submit" class="button primary">הצגת נוסח</button>')}</form><div id="studio-draft"></div></section>`;
}

function controls(p) {
  const x=p?.specs??{}, internal=p?.internal??{};
  const range='type="number" min="0" step="0.5"';
  return `${input("title","כותרת נכס",p?.title,'required maxlength="130"')}${input("town","יישוב",p?.town,'required maxlength="70"')}
  ${input("neighborhood","שכונה",p?.neighborhood,'maxlength="95"')}${input("address","כתובת מדויקת · פנימי",internal.address,'maxlength="200"')}
  <div class="wide">${input("agreementAddress","כתובת או מזהה שיוצגו בטופס התיווך בלבד",internal.agreementAddress,'maxlength="200"')}
  <p class="office-small">יש להזין מזהה שמאפשר ללקוח לזהות את הנכס. השדה יוצג לעיון בטופס ויישמר בעותק החתום.</p></div>
  ${select("deal","סוג עסקה",{sale:"מכירה",rent:"השכרה"},p?.deal??"sale")}${select("type","סוג נכס",Object.fromEntries(supportedTypes.map(x=>[x,x])),p?.property_type??"דירה")}
  ${input("price","מחיר בש״ח",p?.price,'type=number min=1 step=1 required')}${input("rooms","חדרים",p?.rooms,range)}
  ${input("area","שטח בנוי (מ״ר)",p?.area,range)}${input("additionalArea","שטח נוסף (מ״ר)",x.additionalArea,range)}
  ${input("floor","קומה",x.floor,'type=number min=-10 max=200')}${input("floorCount","מספר קומות",x.floorCount,'type=number min=0 max=200')}
  ${input("condition","מצב הנכס",x.condition,'maxlength="90"')}${input("availableOn","תאריך פינוי",x.availableOn,'type=date')}
  ${Object.entries(featureNames).map(([key,label])=>select(key,label,{"":"לא נבדק",yes:"כן",no:"לא"},x[key]===true?"yes":x[key]===false?"no":"")).join("")}
  ${input("owner","שם בעל הנכס · פנימי",internal.owner,'maxlength="100"')}${input("ownerPhone","טלפון בעל הנכס · פנימי",internal.ownerPhone,'type=tel maxlength="30" dir=ltr')}
  ${input("agent","סוכן אחראי · פנימי",internal.agent,'maxlength="100"')}${select("status","סטטוס נכס",propertyStates,p?.status??"draft")}
  ${area("description","תיאור שיווקי",p?.description)}${area("notes","הערות משרדיות · פנימי",internal.notes,3500)}
  <label class="office-check wide"><input name="verified" type="checkbox" ${p?.verified?"checked":""}> פרטי הנכס אומתו</label>`;
}
function preferences(l) {
  const x=l?.profile??{};
  return `${input("town","יישוב מועדף",x.town,'maxlength="70"')}${input("budget","תקציב מרבי",x.budget,'type=number min=0 step=1')}
  ${input("rooms","חדרים לפחות",x.rooms,'type=number min=0 step=.5')}${input("area","שטח מינימלי",x.area,'type=number min=0 step=.5')}
  <fieldset class="wide"><legend>מאפיינים נדרשים</legend><div class="checks">${Object.entries(featureNames).map(([key,label])=>`<label><input type="checkbox" name="features" value="${key}" ${x.features?.includes(key)?"checked":""}> ${label}</label>`).join("")}</div></fieldset>
  ${area("message","דרישות והערות",x.message,1700)}`;
}
function editLead(l) {
  const fields=l?`<p class="office-small wide">${safe(l.name)} · <bdi>${safe(l.phone)}</bdi> · ${safe(l.source)}${l.property_id?` · ${safe(propertyName(l.property_id)||l.property_id)}`:""}</p>${select("stage","שלב טיפול",leadStates,l.stage)}`
  :`${input("name","שם מלא","","required maxlength=80")}${input("phone","טלפון","","required type=tel dir=ltr maxlength=30")}
  ${input("email","דוא״ל","","type=email dir=ltr maxlength=180")}${input("source","מקור הפנייה","הזנה משרדית","maxlength=55")}
  ${select("intent","סוג פנייה",intents,"buy")}${select("propertyId","שיוך נכס",propertyOptions(),"")}`;
  const requested=l?.profile?.selectedProperties;
  const visit=requested?.length?`<p class="office-small wide">נכסים לסיור ${requested.map(id=>safe(propertyName(id)||id)).join(" · ")}
    ${l.profile.visitDay?" · תאריך מועדף "+safe(l.profile.visitDay):""}
    ${l.profile.visitWindow?" · "+({morning:"בוקר",afternoon:"צהריים",evening:"ערב"}[l.profile.visitWindow]??""):""}</p>`:"";
  return fields+visit+input("assignedTo","סוכן אחראי",l?.assigned_to,'maxlength=100')+preferences(l);
}
function localValue(value) {
  if(!value) return "";
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jerusalem",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(value));
  const x=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return `${x.year}-${x.month}-${x.day}T${x.hour}:${x.minute}`;
}
function israelInstant(value) {
  if(!value) return "";
  const naive=Date.parse(value+"Z");
  const zone=new Intl.DateTimeFormat("en",{timeZone:"Asia/Jerusalem",timeZoneName:"longOffset"}).formatToParts(new Date(naive)).find(part=>part.type==="timeZoneName").value;
  const offset=zone==="GMT"?"+00:00":zone.slice(3);
  const date=new Date(value+offset);
  if(localValue(date.toISOString())!==value) throw Error("השעה אינה תקינה בשעון ישראל.");
  return date.toISOString();
}
function workControls(w) {
  return `${input("title","כותרת",w?.title,'required maxlength=150')}${select("kind","סוג",{task:"משימה",tour:"סיור"},w?.kind??"task")}
  ${select("status","סטטוס",{open:"פתוח",done:"בוצע",cancelled:"בוטל"},w?.status??"open")}${input("assignedTo","אחראי",w?.assigned_to,'maxlength=100')}
  ${select("propertyId","נכס",propertyOptions(),w?.property_id??"")}${select("leadId","ליד",leadOptions(),w?.lead_id??"")}
  ${input("startsAt","תחילה · שעון ישראל",localValue(w?.starts_at),'type=datetime-local')}${input("endsAt","סיום · שעון ישראל",localValue(w?.ends_at),'type=datetime-local')}
  ${area("notes","הערות או תוצאת סיור",w?.notes,1700)}`;
}
function showEdit(title,html,trigger) {
  if(!dialog.open) opener=trigger;
  edit.innerHTML=`<button class="dialog-close" type="button" data-dismiss aria-label="סגירה">×</button><div class="office-edit"><h2 id="edit-title" tabindex="-1">${title}</h2>${html}</div>`;
  dialog.setAttribute("aria-labelledby","edit-title");
  if(!dialog.open) dialog.showModal();
  dialog.scrollTop=0;
  byId("edit-title").focus({preventScroll:true});
}
function editable(kind,id,trigger,duplicate=false) {
  const groups={
    property:[state.properties,"נכס",controls,"properties"],
    lead:[state.leads,"ליד",editLead,"leads"],
    work:[state.work,"משימה או סיור",workControls,"work"],
  };
  const [items,label,fields,resource]=groups[kind];
  const original=items.find(x=>x.id===id);
  const record=duplicate?null:original;
  const initial=duplicate?{...original,status:"draft",verified:0}:record;
  requestKey=crypto.randomUUID();
  showEdit(duplicate?"שכפול נכס לטיוטה":`${record?"עריכת":"הוספת"} ${label}`,`<form id="office-edit-form"><div class="office-fields">${fields(initial)}
    ${kind==="property"?area("changeReason","מקור השינוי או הערה להיסטוריה",null,400)+
      '<label class="office-check wide"><input type="checkbox" name="approved"> אני מאשר הצגה בקטלוג או שינוי במחיר, לפי הפעולה</label>'+
      (!record?'<label class="office-check wide"><input type="checkbox" name="distinctProperty"> אם קיימת כתובת זהה, בדקתי וזה נכס נפרד</label>':""):""}</div>
    <p class="office-error" role="alert" hidden></p><div class="office-dialog-actions">${actionRow('<button type="submit" class="button primary">שמירה</button><button type="button" class="button outline" data-dismiss>ביטול</button>')}</div></form>`,trigger);
  byId("office-edit-form").addEventListener("submit",async event=>{
    event.preventDefault();
    const form=event.currentTarget;
    await submitting(form,async ()=>{
      const entries=new FormData(form);
      const data=Object.fromEntries(entries);
      data.features=entries.getAll("features");
      data.requestId=requestKey;
      if(kind==="property"){
        data.verified=entries.has("verified");
        data.approved=entries.has("approved");
        data.distinctProperty=entries.has("distinctProperty");
        for(const key of Object.keys(featureNames)) data[key]=data[key]==="yes"?true:data[key]==="no"?false:null;
      }
      if(kind==="work"){
        data.startsAt=israelInstant(data.startsAt);
        data.endsAt=israelInstant(data.endsAt);
      }
      if(record) data.version=record.version;
      await api(`${resource}${record?`/${record.id}`:""}`,{method:record?"PUT":"POST",data});
      dialog.close();
      await refresh("השינויים נשמרו.");
      byId("office-heading").focus({preventScroll:true});
    });
  });
}
async function submitting(form,callback) {
  const actions=form.querySelectorAll('button[type="submit"]');
  const alert=form.querySelector("[role=alert]");
  for(const action of actions) action.disabled=true;
  if(alert) alert.hidden=true;
  try {await callback();} catch(problem) {
    if(alert){alert.textContent=problem.message;alert.hidden=false;}
    else {error.textContent=problem.message;error.hidden=false;}
  } finally {for(const action of actions) action.disabled=false;}
}
async function files(id,trigger) {
  const result=await api(`properties/${id}`);
  const fileList=result.files.map(f=>`<li><a href="/api/office/files/${f.id}">${safe(f.label)}</a> · ${f.public_photo?"תמונה מאושרת לקטלוג":"קובץ פנימי"}
  ${f.mime.startsWith("image/")?`<button type="button" class="button outline" data-photo-flags="${f.id}">שימוש ומיתוג</button>`:""}</li>`).join("");
  showEdit("קבצים והיסטוריית מחירים",`<p class=office-small>${safe(result.property.title)}</p>
  <ul class="office-files">${fileList||"<li>טרם הועלו קבצים.</li>"}</ul>
  <form id="file-form"><div class="office-fields">
  <label class="field"><span>קובץ · עד 6MB</span><input name="file" type="file" required accept="image/jpeg,image/png,image/webp,application/pdf"></label>
  ${input("label","תיאור הקובץ. לתמונה תארו מה רואים בה","","required maxlength=120")}
  <label class="office-check wide"><input name="publicPhoto" type="checkbox"> למשרד יש הרשאה לשווק את התמונה ולהציגה בקטלוג כשהנכס פעיל</label>
  <label class="office-check wide"><input name="alreadyBranded" type="checkbox"> כבר מופיע בתמונה הלוגו הרשמי של שפע נדל״ן</label>
  </div><p class="office-error" role="alert" hidden></p>${actionRow('<button type="submit" class="button primary">העלאה</button>')}</form>
  <details class="office-history"><summary>היסטוריית מחירים</summary><ul>${result.prices.map(p=>`<li>${fmt(p.price)} · ${stamp(p.recorded_at)}</li>`).join("")}</ul></details>`,trigger);
  for(const target of edit.querySelectorAll("[data-photo-flags]")) target.onclick=()=>{
    const f=result.files.find(item=>item.id===target.dataset.photoFlags);
    showEdit("תיאור, הרשאת שימוש ומיתוג תמונה",`
      <form id="photo-flags"><div class="office-fields">
      ${input("label","תיאור חלופי לתמונה. תארו מה רואים בה",f.label,"required maxlength=120")}</div>
      <label class="office-check"><input type="checkbox" name="publicPhoto" ${f.public_photo?"checked":""}> התמונה מאושרת לשיווק ולהצגה בקטלוג כשהנכס פעיל</label>
      <label class="office-check"><input type="checkbox" name="alreadyBranded" ${f.already_branded?"checked":""}> הלוגו הרשמי כבר מופיע בתמונה</label>
      <p class="office-error" role="alert" hidden></p>${actionRow('<button class="button primary" type="submit">שמירת הגדרות תמונה</button>')}</form>`,trigger);
    const form=byId("photo-flags");
    form.onsubmit=event=>{
      event.preventDefault();
      submitting(form,async()=>{
        const data=new FormData(form);
        await api(`files/${f.id}`,{method:"PUT",data:{label:data.get("label"),publicPhoto:data.has("publicPhoto"),alreadyBranded:data.has("alreadyBranded")}});
        await files(id,trigger);
        status.textContent="הגדרות התמונה נשמרו.";
      });
    };
  };
  byId("file-form").addEventListener("submit",async event=>{
    event.preventDefault();
    const form=event.currentTarget;
    await submitting(form,async ()=>{
      const data=new FormData(form);
      const search=new URLSearchParams({label:data.get("label"),public:data.has("publicPhoto")?"1":"0",branded:data.has("alreadyBranded")?"1":"0"});
      await api(`properties/${id}/files?${search}`,{method:"POST",body:data.get("file")});
      await files(id,trigger);
      status.textContent="הקובץ הועלה.";
    });
  });
}
async function comparableEditor(id,trigger,message="") {
  const {property,comparables}=await api(`properties/${id}`);
  const path=`properties/${id}/comparables`;
  const requestId=crypto.randomUUID();
  const day=new Intl.DateTimeFormat("he-IL",{dateStyle:"short",timeZone:"UTC"});
  const deals=comparables.map(c=>listLine(c.area_label||property.town,`${day.format(new Date(c.deal_date))} · ${fmt(c.price)} · ${safe(c.source_ref)} · ${badge(c.archived_at?"ארכיון":c.deal!==property.deal?"סוג עסקה קודם":c.in_window?"בתוך טווח ההשוואה":"מחוץ לטווח ההשוואה")}`,
    c.archived_at?"":`<button type="button" class="button outline" data-archive-comparable="${c.id}">העברה לארכיון</button>`)).join("");
  showEdit("עסקאות השוואה",`<p class="office-small">${safe(property.title)} · ${property.deal==="sale"?"מכר":"שכירות"} · 36 החודשים האחרונים</p>
    <p role="status">${safe(message)}</p>
    <div class="office-list">${deals||empty("טרם שויכו עסקאות לנכס.")}</div>
    <h3>שיוך עסקה שנבדקה</h3><p class="office-small">פרטי ההשוואה והקישור יוצגו בדף הנכס. הזינו אסמכתה שאפשר לאתר במקור, בלי פרטים מזהים של בעלי העסקה.</p>
    <form id="comparable-form"><div class="office-fields">
    ${input("dealDate","תאריך העסקה","","type=date required")}${input("price",property.deal==="sale"?"מחיר עסקה בש״ח":"דמי שכירות חודשיים בש״ח","","type=number min=1 step=1 required")}
    ${input("area","שטח (מ״ר)","","type=number min=0.1 step=any")}${input("rooms","חדרים","","type=number min=0.5 step=0.5")}
    ${input("areaLabel","אזור או שכונה","","maxlength=95")}${input("sourceRef","אסמכתה לחיפוש במקור","","maxlength=160 required")}
    ${input("sourceUrl","קישור HTTPS למקור","","type=url dir=ltr maxlength=850 required")}
    <label class="office-check wide"><input name="verified" type="checkbox" required> בדקתי את העסקה מול המקור ומותר להציג את הפרטים שהוזנו.</label>
    </div><p class="office-error" role="alert" hidden></p>${actionRow('<button type="submit" class="button primary">שמירת עסקה</button>')}</form>`,trigger);
  const form=byId("comparable-form");
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    const fields=new FormData(form);
    await submitting(form,async ()=>{
      await api(path,{method:"POST",data:{...Object.fromEntries(fields),requestId,verified:fields.has("verified")}});
      await comparableEditor(id,trigger,"העסקה נשמרה.");
    });
  });
  for (const archive of edit.querySelectorAll("[data-archive-comparable]")) archive.addEventListener("click",async ()=>{
    archive.disabled=true;
    try {
      await api(path,{method:"PUT",data:{id:archive.dataset.archiveComparable}});
      await comparableEditor(id,trigger,"העסקה הועברה לארכיון והוסרה מהתצוגה.");
    } catch(problem) {
      const alert=form.querySelector("[role=alert]");
      alert.textContent=problem.message;alert.hidden=false;
    } finally {archive.disabled=false;}
  });
}
function matches(id,trigger) {
  const lead=state.leads.find(l=>l.id===id);
  const result=state.properties.flatMap(p=>{
    const match=matchProperty(lead,p);
    return match?[{p,...match}]:[];
  }).sort((a,b)=>b.score-a.score);
  showEdit("התאמת נכסים לליד",`<p class="office-small">${safe(lead.name)} · ${safe(intents[lead.intent])}</p>
  <div class="office-list">${result.length?result.map(x=>listLine(x.p.title,`${fmt(x.p.price)} · ${x.score} נקודות · ${safe(x.reasons.join(" · "))}`,`<a href="/listing/${x.p.id}" class="button outline">לעמוד הנכס</a>`)).join(""):empty("אין התאמות פעילות לפי הדרישות שסומנו.")}</div>`,trigger);
}
function visitFormsPage() {
  return panel("הזמנת שירותי תיווך",`<p>הגדירו את פרטי המתווך ואת העמלות למכירה ולהשכרה. לשינוי עמלה בטופס שכבר נחתם, פתחו את ההזמנה מכרטיס הליד.</p>
    ${actionRow(button("visit-settings","הגדרת פרטי מתווך ועמלות","","primary")+'<a class="button outline" href="/visit?property=gedera-01">הדגמת טופס</a>')}`);
}
function visitFeeFields(key,label,fee,optional=false) {
  return `<fieldset><legend>${safe(label)}</legend>
    ${optional?`<label class="office-check"><input type="checkbox" name="${key}-enabled" ${fee?"checked":""}> לאפשר טופס חתימה לסוג עסקה זה</label>`:""}
    <div class="office-fields">${select(`${key}-mode`,"צורת העמלה",{fixed:"סכום קבוע בש״ח",percent:"אחוז מהעסקה"},fee?.mode??"fixed")}
    ${input(`${key}-amount`,"סכום או אחוז",fee?.amount,'type=number min=0 step=0.01')}
    ${select(`${key}-vat`,"מע״מ",{included:"כולל מע״מ",plus:"בתוספת מע״מ"},fee?.vat??"plus")}</div></fieldset>`;
}
function visitFeeValues(form,key) {
  return {mode:form.get(`${key}-mode`),amount:form.get(`${key}-amount`),vat:form.get(`${key}-vat`)};
}
async function visitSettings(trigger) {
  const {keyReady,configuration}=await api("visit-settings");
  if (!keyReady) {
    showEdit("הגדרת טופסי תיווך",'<p>הצפנת הטפסים עדיין לא הוגדרה בסביבת האתר.</p>',trigger);
    return;
  }
  const broker=configuration?.broker;
  const fees=configuration?.fees;
  showEdit("הגדרת פרטי מתווך ועמלות",`<form id="visit-settings-form" class="visit-office-terms"><div class="office-fields">
    ${input("name","שם מלא של המתווך",broker?.name,'required maxlength=60 autocomplete=off')}
    ${input("identity","מספר זהות של המתווך",broker?.identity,'required pattern="[0-9]{9}" maxlength=9 inputmode=numeric dir=ltr autocomplete=off')}
    ${input("license","מספר רישיון תיווך",broker?.license,'required maxlength=30')}
    ${input("phone","טלפון המתווך",broker?.phone,'required type=tel dir=ltr maxlength=25')}
    ${input("address","כתובת המתווך",broker?.address,'required maxlength=200')}
    ${area("paymentTerms","תנאי תשלום נוספים שאושרו לשימוש בטופס",configuration?.paymentTerms,750)}
    </div><p class="office-small">פרטי המתווך יופיעו בטופס הלקוח. יש להגדיר עמלה לכל סוג עסקה שמעוניינים להפעיל. בהשכרה, עמלה באחוזים מחושבת מדמי השכירות החודשיים המוסכמים.</p>
    ${visitFeeFields("sale","מכירה",fees?.sale,true)}${visitFeeFields("rent","השכרה",fees?.rent,true)}
    <p class="office-error" role="alert" hidden></p>${actionRow('<button type="submit" class="button primary">שמירת הגדרות</button>')}</form>`,trigger);
  const form=byId("visit-settings-form");
  form.addEventListener("submit",event=>{
    event.preventDefault();
    submitting(form,async ()=>{
      const fields=new FormData(form);
      const data=Object.fromEntries(fields);
      data.fees=Object.fromEntries(["sale","rent"].filter(key=>fields.has(`${key}-enabled`)).map(key=>[key,visitFeeValues(fields,key)]));
      await api("visit-settings",{method:"PUT",data});
      dialog.close();
      status.textContent="הגדרות טופס התיווך נשמרו.";
    });
  });
}
async function leadVisit(id,trigger,message="") {
  const {history,properties,preferred,currentId,brokerName}=await api(`visit-forms/${id}`);
  const pending=history.find(version=>version.status==="pending");
  const share=pending?new URL(`/visit?amend=${pending.id}`,location.origin).href:"";
  const when=[preferred.day,({morning:"בוקר",afternoon:"צהריים",evening:"ערב"})[preferred.window]].filter(Boolean).join(" · ");
  const updates=history.map(version=>`<li>גרסה ${version.version} · ${({signed:"נחתמה",pending:"ממתינה ללקוח",withdrawn:"בוטלה"})[version.status]}
    · ${stamp(version.signed_at??version.created_at)} ${version.status==="signed"?`· <a href="/visit/copy/${version.id}" target="_blank" rel="noopener">פתיחת העותק</a>`:""}</li>`).join("");
  showEdit("הזמנת שירותי תיווך",`<p class="office-small">נכסים בסיור ${properties.map(p=>safe(p.title)).join(" · ")}</p>
    <p class="office-small">מועד מועדף ${safe(when||"לא צוין")}</p><p role="status">${safe(message)}</p><ul class="office-files">${updates}</ul>
    <form id="visit-update-form" class="visit-office-terms"><h3>עדכון עמלה בהסכמה</h3>
    ${pending?`<p>ההצעה ממתינה לחתימת הלקוח. אפשר להעתיק את הקישור למסירה ללקוח שמורשה להיכנס בחשבון שבו חתם.</p>
      ${input("link","קישור אישי לעיון וחתימה",share,"readonly dir=ltr")}
      ${actionRow('<button type="button" class="button outline" id="copy-visit-link">העתקת קישור</button><button type="submit" class="button outline">ביטול ההצעה הממתינה</button>')}`:
      `<p>שינוי מוצע יישמר כגרסה נפרדת. העמלה תתעדכן רק אחרי חתימת הלקוח.</p>
      ${properties.map(p=>visitFeeFields(p.id,p.title,p.fee)).join("")}
      <p class="office-small">המתווך שמופיע בהזמנה ${safe(brokerName)}</p>
      ${input("brokerSignature","חתימת המתווך בהקלדת השם המלא","","required maxlength=130 autocomplete=off")}
      <label class="office-check"><input name="brokerAccepted" type="checkbox" required> אני המתווך שמופיע בהזמנה ומאשר את הצעת העמלה המעודכנת.</label>
      ${actionRow('<button type="submit" class="button primary">חתימה והכנת הצעת עמלה מעודכנת</button>')}`}
    <p class="office-error" role="alert" hidden></p></form>`,trigger);
  const form=byId("visit-update-form");
  form.querySelector("#copy-visit-link")?.addEventListener("click",async ()=>{
    const info=edit.querySelector("[role=status]");
    try {await navigator.clipboard.writeText(share);info.textContent="הקישור הועתק.";}
    catch {form.elements.link.focus();form.elements.link.select();info.textContent="הקישור סומן להעתקה.";}
  });
  form.addEventListener("submit",event=>{
    event.preventDefault();
    submitting(form,async ()=>{
      const fields=new FormData(form);
      const data=pending?{base:currentId,action:"withdraw",id:pending.id}:
        {base:currentId,brokerSignature:fields.get("brokerSignature"),brokerAccepted:fields.has("brokerAccepted"),fees:Object.fromEntries(properties.map(p=>[p.id,visitFeeValues(fields,p.id)]))};
      await api(`visit-forms/${id}`,{method:"POST",data});
      if (form.isConnected) await leadVisit(id,trigger,pending?"ההצעה בוטלה.":"ההצעה נשמרה וממתינה לחתימת הלקוח.");
    });
  });
}
async function studio(form) {
  const sequence=++studioSeq;
  const {propertyId,channel}=Object.fromEntries(new FormData(form));
  await submitting(form,async ()=>{
    const areaNode=byId("studio-draft");
    const {drafts,files,property}=await api(`properties/${propertyId}`);
    const draft=drafts.find(item=>item.channel===channel);
    const suggested=draft??await api(`properties/${propertyId}/marketing`,{method:"POST",data:{channel,preview:true}});
    if(sequence!==studioSeq||currentPage()!=="marketing"||!areaNode.isConnected) return;
    areaNode.innerHTML=`<form id="studio-edit"><div class="office-fields">
    ${input("title","כותרת",suggested.title,"required maxlength=220")}
    ${select("status","מצב נוסח",{draft:"טיוטה",approved:"מאושר להפצה ידנית"},draft?.status??"draft")}
    ${area("body","תוכן הפרסום",withBrandContacts(suggested.body),10000)}
    </div><p class="office-error" role="alert" hidden></p>
    ${actionRow('<button type="submit" class="button primary">שמירת נוסח</button><button type="button" class="button outline" id="copy-draft">העתקת נוסח</button>')}</form><section class="brand-studio"></section>`;
    bindBrandStudio(areaNode.querySelector(".brand-studio"),property,files,channel);
    const editor=byId("studio-edit");
    editor.addEventListener("submit",async event=>{
      event.preventDefault();
      await submitting(editor,async ()=>{
        await api(`properties/${propertyId}/marketing`,{method:"POST",data:{...Object.fromEntries(new FormData(editor)),channel}});
        status.textContent="הנוסח נשמר.";
      });
    });
    byId("copy-draft").addEventListener("click",async ()=>{
      const field=editor.elements.body;
      field.value=withBrandContacts(field.value);
      try {await navigator.clipboard.writeText(field.value);status.textContent="הנוסח הועתק.";}
      catch {field.focus();field.select();status.textContent="הנוסח סומן להעתקה.";}
    });
    editor.elements.title.focus();
  });
}

document.addEventListener("click",async event=>{
  const dismiss=event.target.closest("[data-dismiss]");
  if(dismiss){dialog.close();return;}
  const target=event.target.closest("[data-action]");
  if(!target||!state) return;
  const {action,id}=target.dataset;
  try {
    if(action.startsWith("edit-")) editable(action.slice(5),id,target);
    if(action==="duplicate-property") editable("property",id,target,true);
    if(action==="property-files") await files(id,target);
    if(action==="property-history") await ops.propertyHistory(id,target,propertyStates);
    if(action==="owner-documents") await ops.ownerDocuments(id,target);
    if(action==="lead-activity") await ops.activity(id,target);
    if(action==="property-comparables") await comparableEditor(id,target);
    if(action==="lead-matches") matches(id,target);
    if(action==="visit-settings") await visitSettings(target);
    if(action==="lead-visit") await leadVisit(id,target);
    if(action==="market-property") {
      history.pushState(null,"","#marketing");
      render();
      const form=byId("studio-form");
      form.elements.propertyId.value=id;
      await studio(form);
    }
  } catch(problem) {
    error.textContent=problem.message;
    error.hidden=false;
  }
});
view.addEventListener("input",event=>{
  if(!event.target.closest(".office-filters")) return;
  if(event.target.name==="work-period") {byId("work-list").innerHTML=workList(event.target.value);return;}
  const list=byId("list-body");
  const query=byId("office-query")?.value;
  const stage=view.querySelector("[name=status]")?.value;
  const deal=view.querySelector("[name=deal]")?.value;
  if(list) list.innerHTML=(currentPage()==="properties"?propertyList:leadList)(query,stage,deal);
});
view.addEventListener("submit",event=>{
  if(event.target.id!=="studio-form")return;
  event.preventDefault();
  studio(event.target);
});
dialog.addEventListener("close",()=>{dialog.removeAttribute("aria-labelledby");edit.replaceChildren();if(opener?.isConnected)opener.focus();});
window.addEventListener("hashchange",()=>{if(currentPage()==="marketing"&&byId("studio-draft")?.children.length)return;render();byId("office-heading").focus();});
await refresh();
