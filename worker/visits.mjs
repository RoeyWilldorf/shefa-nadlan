import {properties as visitExamples} from "../dist/listings.mjs";
import {renderBrokeragePdf,visitDocumentSpec} from "./print-documents.mjs";
import {visitReference} from "./owner-drafts.mjs";

const visitFeeChange = "לאחר הפגישה ניתן לבקש לעדכן את דמי התיווך בכל עת. השינוי ייכנס לתוקף בהסכמה הדדית ובחתימה על נוסח מעודכן. עד אז יחולו התנאים שנחתמו.";
const visitOrderText = "אני מזמין או מזמינה משפע נדל״ן שירותי תיווך לגבי הנכסים המפורטים בהזמנה זו. דמי התיווך לכל נכס הם כמפורט להלן ויחולו עם התקיימות התנאים המזכים בדמי תיווך לפי דין.";
const visitConsentText = "מסירת הפרטים תלויה בהסכמתך. שפע נדל״ן והמתווך המופיע בטופס ישתמשו בהם לזיהוי, לטיפול בבקשת הסיור, לתיעוד הזמנת התיווך ולמסירת עותק. המידע נגיש למשרד ולספקי התשתית והאחסון במסגרת תפעול האתר. ללא הפרטים אי אפשר להשלים חתימה באתר. לפנייה בעניין עיון במידע או תיקונו, אפשר לפנות למתווך לפי פרטי הקשר המופיעים בטופס.";
const visitSampleConsentText = "זהו טופס להמחשה בלבד. משתמשים בפרטי דוגמה, והחתימה אינה נשמרת ואינה שולחת בקשת פגישה.";
const visitTypes={sale:"מכירה",rent:"השכרה"};
const visitNumber=new Intl.NumberFormat("he-IL",{maximumFractionDigits:2});
const visitDate=new Intl.DateTimeFormat("he-IL",{dateStyle:"long",timeStyle:"short",timeZone:"Asia/Jerusalem"});
const visitDay=new Intl.DateTimeFormat("en-CA",{year:"numeric",month:"2-digit",day:"2-digit",timeZone:"Asia/Jerusalem"});
const visitEncode=new TextEncoder();
const visitDecode=new TextDecoder();
const visitB64=bytes=>btoa(Array.from(new Uint8Array(bytes),n=>String.fromCharCode(n)).join("")).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"");
const visitBytes=base64=>Uint8Array.from(atob(base64.replaceAll("-","+").replaceAll("_","/")),c=>c.charCodeAt(0));
const visitDigest=async value=>visitB64(await crypto.subtle.digest("SHA-256",visitEncode.encode(JSON.stringify(value))));
const visitVat=vat=>vat==="included"?"כולל מע״מ":"בתוספת מע״מ";
function visitFeeLabel(fee,deal) {
  if (fee.amount===0) return "ללא דמי תיווך";
  const value=visitNumber.format(fee.amount);
  return (fee.mode==="fixed"?value+" ₪":value+"% "+(deal==="rent"?"מדמי השכירות החודשיים המוסכמים":"ממחיר העסקה המוסכם"))+" · "+visitVat(fee.vat);
}
function visitValidId(value) {
  if (!/^[0-9]{9}$/.test(value)||value==="000000000") return false;
  return [...value].reduce((sum,char,i)=>{const n=Number(char)*(i%2+1);return sum+(n>9?n-9:n);},0)%10===0;
}

export function makeVisits({assets,first,rows,statements,clean,numeric,fail,json,now,uid,idPattern,published,escaped,phoneNumber,dateOrNull,leadInsert,audit,privateHeaders}) {
  const keyValid=env=>/^[\da-f]{64}$/i.test(env.VISIT_ENCRYPTION_KEY??"");
  async function cipherKey(env) {
    if (!keyValid(env)) fail(503,"שמירת טופסי תיווך עדיין לא הוגדרה.");
    const raw=Uint8Array.from(env.VISIT_ENCRYPTION_KEY.match(/../g),value=>Number.parseInt(value,16));
    return crypto.subtle.importKey("raw",raw,"AES-GCM",false,["encrypt","decrypt"]);
  }
  async function seal(env,scope,value) {
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const body=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:visitEncode.encode(scope)},await cipherKey(env),visitEncode.encode(JSON.stringify(value)));
    return visitB64(iv)+"."+visitB64(body);
  }
  async function unseal(env,scope,value) {
    const [iv,body]=value.split(".");
    const clear=await crypto.subtle.decrypt({name:"AES-GCM",iv:visitBytes(iv),additionalData:visitEncode.encode(scope)},await cipherKey(env),visitBytes(body));
    return JSON.parse(visitDecode.decode(clear));
  }
  const formScope=row=>"visit:form:"+row.id+":"+row.lead_id+":"+row.visitor_id;
  const currentSigned=(db,lead)=>first(db,"SELECT * FROM office_visit_forms WHERE lead_id=? AND status='signed' ORDER BY version DESC LIMIT 1",lead);
  const canUse=(row,visitor,owner)=>row&&(owner||row.visitor_id===visitor);
  function feeInput(fee) {
    if (!fee||!["fixed","percent"].includes(fee.mode)||!["included","plus"].includes(fee.vat)) fail(400,"יש לבחור סוג עמלה ואופן חישוב מע״מ.");
    const amount=numeric(fee.amount,fee.mode==="percent"?100:100000000,true);
    if (Math.abs(amount*100-Math.round(amount*100))>0.00001) fail(400,"אפשר להזין עד שתי ספרות אחרי הנקודה.");
    return {mode:fee.mode,amount,vat:fee.vat};
  }
  function personName(value) {
    const name=clean(value,60,true);
    if (!/\p{L}/u.test(name)) fail(400,"יש להזין שם תקין.");
    return name;
  }
  async function settings(env) {
    const row=await first(env.DB,"SELECT body FROM office_visit_settings WHERE id=1");
    return row?unseal(env,"visit:settings",row.body):null;
  }
  async function saveSettings(env,actor,data) {
    const identity=clean(data.identity,9,true);
    if (!visitValidId(identity)) fail(400,"מספר הזהות של המתווך אינו תקין.");
    const broker={name:personName(data.name),identity,address:clean(data.address,200,true),license:clean(data.license,30,true),phone:phoneNumber(data.phone)};
    const fees={};
    for (const type of Object.keys(visitTypes)) if (data.fees?.[type]) fees[type]=feeInput(data.fees[type]);
    const config={broker,fees,paymentTerms:clean(data.paymentTerms,750)};
    const at=now();
    const encrypted=await seal(env,"visit:settings",config);
    await env.DB.batch([
      statements(env.DB,"INSERT INTO office_visit_settings (id,body,updated_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at",encrypted,at),
      audit(env.DB,actor,"visit.settings", "broker",at),
    ]);
    return json({saved:true});
  }
  async function options(env) {
    const config=keyValid(env)?await settings(env):null;
    return json({configured:Boolean(config),deals:Object.keys(config?.fees??{}),signingApproved:env.BROKERAGE_SIGNING_APPROVED==="1"});
  }
  function ids(data) {
    const selected=data.properties;
    if (!Array.isArray(selected)||selected.length<1||selected.length>10||new Set(selected).size!==selected.length||
      selected.some(id=>typeof id!=="string"||(!idPattern.test(id)&&!visitExamples.some(p=>p.id===id)))) fail(400,"יש לבחור בין נכס אחד לעשרה נכסים שונים.");
    return selected;
  }
  function schedule(data) {
    const day=dateOrNull(data.day);
    if (day&&day<visitDay.format(new Date())) fail(400,"יש לבחור מועד מהיום ואילך.");
    const window=clean(data.window,16);
    if (!["","morning","afternoon","evening"].includes(window)) fail(400,"חלון השעות לא תקין.");
    return {day,window};
  }
  function termsFor(properties,broker,example=false,paymentTerms="") {
    return {version:"2026-11-12",properties,broker,example,orderText:visitOrderText,
      paymentTerms,feeChange:visitFeeChange,consentText:example?visitSampleConsentText:visitConsentText};
  }
  async function liveTerms(env,selected) {
    if (!keyValid(env)) fail(409,"החתימה הדיגיטלית עדיין לא הוגדרה. אפשר לפנות למשרד.");
    const config=await settings(env);
    if (!config) fail(409,"פרטי המתווך והעמלות עדיין לא הוגדרו. אפשר לפנות למשרד.");
    const records=await rows(env.DB,`SELECT id,title,town,deal,property_type,price,internal_json FROM office_properties WHERE id IN (${selected.map(()=>"?").join(",")}) AND status IN ${published}`,...selected);
    const props=selected.map(id=>{
      const p=records.find(r=>r.id===id);
      if (!p) fail(409,"אחד הנכסים כבר אינו זמין לסיור. חזרו לבחירת נכסים.");
      const location=JSON.parse(p.internal_json).agreementAddress;
      const fee=config.fees[p.deal];
      if (!location||!fee) fail(409,"טרם הוגדרו פרטי טופס או עמלה לאחד הנכסים. אפשר לעדכן את הבחירה או לפנות למשרד.");
      return {id,title:p.title,address:location,town:p.town,deal:p.deal,type:p.property_type,price:p.price,fee};
    });
    return termsFor(props,config.broker,false,config.paymentTerms??"");
  }
  async function quote(env,visitor,data) {
    const selected=ids(data);
    const preferred=schedule(data);
    const examples=selected.map(id=>visitExamples.find(p=>p.id===id)).filter(Boolean);
    if (examples.length&&examples.length!==selected.length) fail(400,"יש לבחור נכסי משרד או נכסי דוגמה באותה בקשה.");
    if (examples.length) {
      const props=examples.map(p=>({id:p.id,title:p.title,town:p.town,address:"כתובת להמחשה",deal:p.deal,type:p.type,price:p.price,
        fee:p.deal==="sale"?{mode:"percent",amount:1,vat:"plus"}:{mode:"fixed",amount:3000,vat:"included"}}));
      return json({terms:termsFor(props,{name:"מתווך לדוגמה",identity:"להמחשה",address:"כתובת משרד לדוגמה",license:"להמחשה",phone:""},true),preferred});
    }
    const terms=await liveTerms(env,selected);
    const ticket=await seal(env,"visit:quote",{visitor,id:uid(),expires:Date.now()+30*60*1000,terms,preferred});
    return json({terms,preferred,ticket});
  }
  function signature(data,expected) {
    const input=clean(data.signature,130,true).replace(/\s+/g," ");
    if (input!==expected.replace(/\s+/g," ")) fail(400,"יש להקליד את השם המלא בדיוק כפי שהוא מופיע בטופס.");
    if (data.accepted!==true||data.privacy!==true) fail(400,"יש לאשר את תוכן ההזמנה ואת השימוש בפרטים לפני חתימה.");
    return input;
  }
  async function sign(env,visitor,data) {
    let ticket;
    try {ticket=await unseal(env,"visit:quote",clean(data.ticket,22000,true));}
    catch {fail(400,"יש לפתוח את הטופס מחדש לפני חתימה.");}
    if (ticket.visitor!==visitor) fail(403,"הטופס נפתח בחשבון אחר.");
    const prior=await first(env.DB,"SELECT id,visitor_id FROM office_visit_forms WHERE id=?",ticket.id);
    if (canUse(prior,visitor,false)) return json({id:prior.id});
    if (ticket.expires<Date.now()) fail(409,"תוקף הטופס פג. פתחו טופס עדכני ובדקו שוב את הפרטים.");
    const terms=await liveTerms(env,ticket.terms.properties.map(p=>p.id));
    if (JSON.stringify(terms)!==JSON.stringify(ticket.terms)) fail(409,"פרטי הנכסים או העמלה השתנו. חזרו לבחירת נכסים ועיינו בנוסח החדש.");
    const firstName=personName(data.firstName),lastName=personName(data.lastName);
    const name=firstName+" "+lastName;
    const identity=clean(data.identity,9,true);
    if (!visitValidId(identity)) fail(400,"יש להזין תעודת זהות ישראלית בת תשע ספרות.");
    const email=clean(data.email,180);
    if(email&&!/^\S+@\S+\.\S+$/.test(email)) fail(400,"כתובת הדוא״ל אינה תקינה.");
    const customer={firstName,lastName,identity,address:clean(data.address,200,true),phone:phoneNumber(data.phone),email};
    const signedBy=signature(data,name);
    const at=now();
    const doc={terms,preferred:ticket.preferred,customer,signedBy,signedAt:at,method:"typed-name-and-site-session"};
    const digest=await visitDigest(doc);
    const row={id:ticket.id,lead_id:ticket.id,visitor_id:visitor};
    const body=await seal(env,formScope(row),{...doc,digest});
    const profile=JSON.stringify({message:"",features:[]});
    await env.DB.batch([
      ...leadInsert(env.DB,"site",{key:ticket.id,name,phone:customer.phone,email,property:terms.properties[0].id,intent:"visit",source:"אתר · בקשת סיור",profile,assigned:"",consent:at,at}),
      statements(env.DB,"INSERT INTO office_visit_forms (id,lead_id,visitor_id,version,status,body,created_at,signed_at) VALUES (?,?,?,1,'signed',?,?,?) ON CONFLICT(id) DO NOTHING",row.id,row.lead_id,row.visitor_id,body,at,at),
      statements(env.DB,"INSERT OR IGNORE INTO office_document_refs (visit_id,at) SELECT id,signed_at FROM office_visit_forms WHERE id=? AND status='signed'",row.id),
      audit(env.DB,visitor,"visit.signed",row.id,at,"visit:sign:"+row.id),
    ]);
    return json({id:row.id},201);
  }
  async function officeVisit(env,lead) {
    const signed=await currentSigned(env.DB,lead);
    if (!signed) fail(404,"טרם נשמר טופס להזמנת הסיור.");
    const document=await unseal(env,formScope(signed),signed.body);
    const history=await rows(env.DB,"SELECT id,version,status,created_at,signed_at FROM office_visit_forms WHERE lead_id=? ORDER BY version DESC",lead);
    return json({history,properties:document.terms.properties,preferred:document.preferred,currentId:signed.id,brokerName:document.terms.broker.name});
  }
  async function propose(env,actor,lead,data) {
    const current=await currentSigned(env.DB,lead);
    if (!current) fail(404,"לא נמצא טופס חתום.");
    if (current.id!==data.base) fail(409,"ההזמנה עודכנה. יש לפתוח מחדש לפני הצעת שינוי.");
    const pending=await first(env.DB,"SELECT id FROM office_visit_forms WHERE lead_id=? AND status='pending'",lead);
    if (data.action==="withdraw") {
      if (!pending||pending.id!==data.id) fail(409,"הצעת העדכון כבר אינה ממתינה.");
      const at=now();
      const [result]=await env.DB.batch([
        statements(env.DB,"UPDATE office_visit_forms SET status='withdrawn' WHERE id=? AND status='pending'",pending.id),
        statements(env.DB,"INSERT OR IGNORE INTO office_audit SELECT ?,?,?,id,? FROM office_visit_forms WHERE id=? AND status='withdrawn'","visit:withdraw:"+pending.id,actor,"visit.withdrawn",at,pending.id),
      ]);
      if (result.meta.changes!==1) fail(409,"הצעת העדכון כבר אינה ממתינה.");
      return json({id:pending.id});
    }
    if (pending) fail(409,"יש לסגור את הצעת העמלה הקודמת לפני יצירת הצעה נוספת.");
    const old=await unseal(env,formScope(current),current.body);
    const brokerName=clean(data.brokerSignature,130,true).replace(/\s+/g," ");
    if(data.brokerAccepted!==true||brokerName!==old.terms.broker.name.replace(/\s+/g," ")) fail(400,"המתווך שמופיע בהזמנה צריך לאשר את הנוסח ולהקליד את שמו המלא.");
    const updates=data.fees;
    if (!updates||typeof updates!=="object"||Array.isArray(updates)) fail(400,"יש להזין תנאי עמלה מעודכנים.");
    const properties=old.terms.properties.map(p=>({...p,fee:feeInput(updates[p.id])}));
    if (properties.every((p,i)=>JSON.stringify(p.fee)===JSON.stringify(old.terms.properties[i].fee))) fail(400,"יש לשנות עמלה של נכס אחד לפחות.");
    const row={id:uid(),lead_id:lead,visitor_id:current.visitor_id};
    const at=now();
    const body=await seal(env,formScope(row),{terms:{...old.terms,properties},preferred:old.preferred,customer:old.customer,base:current.id,
      brokerAcceptance:{name:brokerName,at,method:"typed-name-and-office-session"}});
    const [result]=await env.DB.batch([
      statements(env.DB,`INSERT OR IGNORE INTO office_visit_forms (id,lead_id,visitor_id,version,status,body,created_at)
        SELECT ?,?,?,MAX(version)+1,'pending',?,? FROM office_visit_forms WHERE lead_id=?
        HAVING EXISTS (SELECT 1 FROM office_visit_forms WHERE id=? AND status='signed')
        AND NOT EXISTS (SELECT 1 FROM office_visit_forms WHERE lead_id=? AND status='signed' AND version>?)`,
        row.id,lead,row.visitor_id,body,at,lead,current.id,lead,current.version),
      statements(env.DB,"INSERT INTO office_audit SELECT ?,?,?,id,? FROM office_visit_forms WHERE id=?",uid(),actor,"visit.proposed",at,row.id),
    ]);
    if (result.meta.changes!==1) fail(409,"ההזמנה השתנתה. יש לפתוח אותה מחדש.");
    return json({id:row.id},201);
  }
  async function amendment(env,visitor,id,method,data) {
    const row=await first(env.DB,"SELECT * FROM office_visit_forms WHERE id=? AND version>1",id);
    if (!canUse(row,visitor,false)) fail(404,"עדכון העמלה אינו זמין בחשבון זה.");
    if (row.status==="signed") return json({id,signed:true});
    if (row.status!=="pending") fail(409,"הצעת העמלה כבר אינה זמינה.");
    const previous=await unseal(env,formScope(row),row.body);
    const fullName=previous.customer.firstName+" "+previous.customer.lastName;
    if (method==="GET") {
      const base=await first(env.DB,"SELECT * FROM office_visit_forms WHERE id=? AND lead_id=? AND status='signed'",previous.base,row.lead_id);
      const original=base?await unseal(env,formScope(base),base.body):null;
      const oldFees=Object.fromEntries((original?.terms.properties??[]).map(p=>[p.id,p.fee]));
      return json({terms:previous.terms,preferred:previous.preferred,fullName,oldFees,brokerAcceptance:previous.brokerAcceptance});
    }
    const signedBy=signature(data,fullName);
    const signedAt=now();
    const doc={...previous,signedBy,signedAt,method:"typed-name-and-site-session"};
    const encrypted=await seal(env,formScope(row),{...doc,digest:await visitDigest(doc)});
    const [result]=await env.DB.batch([
      statements(env.DB,"UPDATE office_visit_forms SET status='signed',body=?,signed_at=? WHERE id=? AND status='pending'",encrypted,signedAt,id),
      statements(env.DB,"INSERT OR IGNORE INTO office_document_refs (visit_id,at) SELECT id,signed_at FROM office_visit_forms WHERE id=? AND status='signed'",id),
      statements(env.DB,"INSERT OR IGNORE INTO office_audit SELECT ?,?,?,id,? FROM office_visit_forms WHERE id=? AND signed_at=?","visit:sign:"+id,visitor,"visit.amendment_signed",signedAt,id,signedAt),
    ]);
    if (result.meta.changes!==1) {
      const latest=await first(env.DB,"SELECT status FROM office_visit_forms WHERE id=?",id);
      if (latest?.status!=="signed") fail(409,"הצעת העמלה כבר אינה זמינה.");
    }
    return json({id,signed:true});
  }
  async function copy(env,visitor,owner,id,format) {
    const row=await first(env.DB,"SELECT * FROM office_visit_forms WHERE id=? AND status='signed'",id);
    if (!canUse(row,visitor,owner)) fail(404,"המסמך אינו זמין בחשבון זה.");
    const doc=await unseal(env,formScope(row),row.body);
    const reference=visitReference(await first(env.DB,"SELECT serial,at FROM office_document_refs WHERE visit_id=?",id),id);
    if(format==="pdf"){
      const data=await renderBrokeragePdf(visitDocumentSpec(doc,reference),assets);
      return new Response(data,{headers:{...privateHeaders,"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${reference}.pdf"`,"Referrer-Policy":"no-referrer"}});
    }
    const {terms,customer}=doc;
    const e=escaped;
    const info=(label,value)=>"<p><strong>"+label+"</strong> "+e(value)+"</p>";
    const list=terms.properties.map(p=>"<li><h3>"+e(p.title)+"</h3>"+info("נכס",p.type+" · "+p.address+" · "+p.town)+
      info("סוג העסקה",visitTypes[p.deal])+info("מחיר מבוקש בקירוב",visitNumber.format(p.price)+" ₪"+(p.deal==="rent"?" לחודש":""))+
      info("דמי תיווך",visitFeeLabel(p.fee,p.deal))+"</li>").join("");
    const html=`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <meta name="robots" content="noindex,nofollow"><title>עותק הזמנת שירותי תיווך | שפע נדל״ן</title>
      <style>body{font:16px/1.55 system-ui,sans-serif;color:#172720;background:#fff;margin:1rem}main{max-width:44rem;margin:auto}h1,h2,h3,p{margin:.4rem 0}section{margin:1rem 0}ol{padding-inline-start:1.4rem}li{border-bottom:1px solid #ccc;padding:.5rem}li,section{break-inside:avoid}.ref{overflow-wrap:anywhere}button{font:inherit;padding:.5rem 1rem}@media print{.print{display:none}body{margin:0}}</style>
      <script type="module" src="/visit-print.mjs"></script><main>
      <p>שפע נדל״ן · עותק ללקוח · גרסה ${row.version}</p><h1>הזמנה בכתב לשירותי תיווך והצגת נכסים</h1>
      ${info("נחתם",visitDate.format(new Date(doc.signedAt)))}${info("אסמכתת המסמך",reference)}
      <p>${e(terms.orderText)}</p><section><h2>פרטי המתווך</h2>${info("שם מלא",terms.broker.name)}${info("מספר זהות",terms.broker.identity)}${info("כתובת",terms.broker.address)}${info("מספר רישיון",terms.broker.license)}${info("טלפון",terms.broker.phone)}</section>
      <section><h2>פרטי הלקוח</h2>${info("שם מלא",customer.firstName+" "+customer.lastName)}${info("מספר זהות",customer.identity)}${info("כתובת מגורים",customer.address)}${info("טלפון",customer.phone)}${customer.email?info("דוא״ל",customer.email):""}</section>
      <section><h2>הנכסים והעמלה</h2><ol>${list}</ol>${terms.paymentTerms?info("תנאי תשלום",terms.paymentTerms):""}<p>${e(terms.feeChange)}</p></section>
      <section><h2>תיעוד החתימה</h2>${info("שם שהוקלד ואושר",doc.signedBy)}<p>חתימה אלקטרונית בהקלדת שם ובאישור מפורש בחשבון האתר.</p>
      ${doc.brokerAcceptance?info("אישור המתווך",doc.brokerAcceptance.name+" · "+visitDate.format(new Date(doc.brokerAcceptance.at))):""}
      <p>${e(terms.consentText)}</p><p class="ref">טביעת מסמך <bdi>${e(doc.digest)}</bdi></p></section>
      <p class="print"><a href="/visit/copy/${id}?format=pdf">הורדת PDF</a></p>
      <button type="button" id="print-copy" class="print">הדפסה או שמירה כ־PDF</button></main></html>`;
    return new Response(html,{headers:{...privateHeaders,"Content-Type":"text/html; charset=utf-8","Referrer-Policy":"no-referrer",
      "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"}});
  }
  return {keyValid,settings,saveSettings,options,quote,sign,officeVisit,propose,amendment,copy,seal,unseal};
}
