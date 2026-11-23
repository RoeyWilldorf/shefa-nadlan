// Email notifications to the office (via Resend - https://resend.com, free tier).
// Needs two settings on the server: RESEND_API_KEY (secret) and NOTIFY_EMAIL (where to send).
// Without them nothing is sent and the site works exactly the same.
import {intents,matchProperty} from "./model.mjs";

const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const nis=value=>new Intl.NumberFormat("he-IL").format(value);
const waNumber=phone=>String(phone||"").replace(/\D/g,"").replace(/^0/,"972");
const wa=(phone,text)=>`https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;

export const notifyReady=env=>Boolean(env.RESEND_API_KEY&&env.NOTIFY_EMAIL);

export async function sendEmail(env,subject,html) {
  if (!notifyReady(env)) return false;
  const response=await fetch("https://api.resend.com/emails",{method:"POST",
    headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,"Content-Type":"application/json"},
    body:JSON.stringify({from:env.NOTIFY_FROM||"שפע נדל״ן <onboarding@resend.dev>",to:String(env.NOTIFY_EMAIL).split(",").map(s=>s.trim()).filter(Boolean),subject,html})});
  if (!response.ok) console.error("notify_failed",response.status,(await response.text()).slice(0,200));
  return response.ok;
}

function frame(title,body,origin) {
  return `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#20372e;max-width:560px">
  <h2 style="margin:0 0 12px;color:#264539">${title}</h2>${body}
  <p style="margin-top:22px"><a href="${origin}/office#leads" style="background:#264539;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">לאזור המשרד</a></p>
  <p style="color:#888;font-size:12px;margin-top:18px">הודעה אוטומטית מאתר שפע נדל״ן</p></div>`;
}
const row=(label,value)=>value?`<tr><td style="padding:3px 0 3px 14px;color:#53645a;white-space:nowrap">${label}</td><td style="padding:3px 0"><b>${esc(value)}</b></td></tr>`:"";

export function leadEmail(data,origin) {
  const valuation=/^בקשת הערכת שווי/.test(data.message||"");
  const alert=/^ביקש\/ה עדכון/.test(data.message||"");
  const kind=valuation?"בקשת הערכת שווי":alert?"בקשה לעדכון על נכס":intents[data.intent]||"פנייה";
  const subject=`ליד חדש מהאתר: ${kind}${data.town?` · ${data.town}`:""} · ${data.name}`;
  const greeting=`שלום ${data.name}, כאן שפע נדל״ן - קיבלנו את הפנייה שלך מהאתר.`;
  const body=`<table style="border-collapse:collapse">${row("סוג פנייה",kind)}${row("שם",data.name)}${row("טלפון",data.phone)}${row("דוא״ל",data.email)}
    ${row("יישוב",data.town)}${row("סוג נכס",data.type)}${row("חדרים",data.rooms)}${row("שטח",data.area&&`${data.area} מ״ר`)}${row("תקציב",data.budget&&`${nis(data.budget)} ₪`)}</table>
    ${data.message?`<p style="background:#f5f3ec;padding:10px 12px;border-radius:8px;white-space:pre-line">${esc(data.message)}</p>`:""}
    ${data.propertyId?`<p>נכס: <a href="${origin}/${/^[0-9a-f-]{36}$/i.test(data.propertyId)?`listing/${data.propertyId}`:`properties/${esc(data.propertyId)}.html`}">לעמוד הנכס</a></p>`:""}
    <p><a href="tel:${esc(data.phone)}">📞 להתקשר</a> &nbsp;|&nbsp; <a href="${wa(data.phone,greeting)}">💬 לשלוח WhatsApp</a></p>`;
  return {subject,html:frame(`🔔 ${esc(kind)}`,body,origin)};
}

export function matchesEmail(property,matches,origin) {
  const link=`${origin}/listing/${property.id}`;
  const subject=`נכס חדש מתאים ל-${matches.length} לקוחות: ${property.title} · ${property.town}`;
  const list=matches.map(({lead,match})=>{
    const text=`שלום ${lead.name}, כאן שפע נדל״ן. עלה נכס שמתאים למה שחיפשת: ${property.title} ב${property.town}, ${nis(property.price)} ₪${property.deal==="rent"?" לחודש":""}. לפרטים: ${link}`;
    return `<li style="margin-bottom:8px"><b>${esc(lead.name)}</b> · ${esc(lead.phone)} · ${esc(match.reasons.join(", "))}<br>
      <a href="${wa(lead.phone,text)}">💬 לשלוח לו/ה את הנכס ב-WhatsApp</a></li>`;
  }).join("");
  const body=`<p>הנכס <a href="${link}"><b>${esc(property.title)}</b></a> ב${esc(property.town)} (${nis(property.price)} ₪) פורסם באתר, והוא מתאים לחיפוש של:</p><ul style="padding-right:18px">${list}</ul>
    <p style="color:#53645a">לחיצה על הקישור פותחת WhatsApp עם הודעה מוכנה - אפשר לערוך לפני השליחה.</p>`;
  return {subject,html:frame("🏠 התאמה לנכס חדש",body,origin)};
}

// Called after the office saved a property. Emails the matching open leads once per property.
export async function notifyMatches(env,propertyId,loadState,origin) {
  if (!notifyReady(env)||!env.DB) return;
  const state=await (await loadState()).json();
  const property=state.properties?.find(p=>p.id===propertyId);
  if (!property||!["active","negotiation"].includes(property.status)) return;
  const done=await env.DB.prepare("SELECT 1 AS done FROM site_match_notices WHERE property_id=?").bind(propertyId).first();
  if (done) return;
  const matches=(state.leads??[]).filter(lead=>!["closed","lost"].includes(lead.stage))
    .map(lead=>({lead,match:matchProperty(lead,property)})).filter(item=>item.match)
    .sort((a,b)=>b.match.score-a.match.score).slice(0,30);
  await env.DB.prepare("INSERT OR IGNORE INTO site_match_notices (property_id,matched,at) VALUES (?,?,?)").bind(propertyId,matches.length,new Date().toISOString()).run();
  if (!matches.length) return;
  const {subject,html}=matchesEmail(property,matches,origin);
  await sendEmail(env,subject,html);
}
