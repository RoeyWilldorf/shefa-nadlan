// Scheduled jobs (Cloudflare Cron Triggers, see wrangler.toml):
//   hourly       - reminds the office about website leads nobody has handled yet
//   Sunday 07:00 - a weekly report: visits, where they came from, top pages, leads
import {sendEmail, notifyReady} from "./site-notify.mjs";
import {statsReport} from "./site-stats.mjs";
import {intents} from "./model.mjs";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const num = value => new Intl.NumberFormat("he-IL").format(value || 0);
const waNumber = phone => String(phone || "").replace(/\D/g, "").replace(/^0/, "972");
export const WEEKLY_CRON = "0 5 * * sun";
// A schedule with a day of the week (e.g. "0 5 * * sun") is the weekly report; any other runs the reminders.
export const isWeekly = cron => (String(cron || "").trim().split(/\s+/)[4] || "*") !== "*";

export function israelHour(date = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", {timeZone: "Asia/Jerusalem", hour: "2-digit", hour12: false}).format(date)) % 24;
}

function frame(title, body, origin) {
  return `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#20372e;max-width:600px">
  <h2 style="margin:0 0 12px;color:#153562">${title}</h2>${body}
  <p style="margin-top:22px"><a href="${origin}/office#leads" style="background:#153562;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">לאזור המשרד</a></p>
  <p style="color:#888;font-size:12px;margin-top:18px">הודעה אוטומטית מאתר שפע נדל״ן</p></div>`;
}

// Leads that are still "new" two hours after they came in (up to three days back), once each,
// and only between 08:00 and 21:00 Israel time.
export async function remindLeads(env, origin, now = new Date()) {
  if (!notifyReady(env) || !env.DB) return 0;
  const hour = israelHour(now);
  if (hour < 8 || hour >= 21) return 0;
  const before = new Date(now.getTime() - 2 * 3600000).toISOString();
  const after = new Date(now.getTime() - 72 * 3600000).toISOString();
  const {results} = await env.DB.prepare(`SELECT l.id,l.intent,l.created_at,c.name,c.phone FROM office_leads l JOIN office_contacts c ON c.id=l.contact_id
    WHERE l.stage='new' AND l.created_at<=? AND l.created_at>=? AND NOT EXISTS (SELECT 1 FROM site_lead_reminders r WHERE r.lead_id=l.id)
    ORDER BY l.created_at LIMIT 30`).bind(before, after).all();
  if (!results.length) return 0;
  const items = results.map(lead => {
    const hours = Math.round((now - Date.parse(lead.created_at)) / 3600000);
    const text = `שלום ${lead.name}, כאן שפע נדל״ן. קיבלנו את הפנייה שלך מהאתר ונשמח לעזור.`;
    return `<li style="margin-bottom:10px"><b>${esc(lead.name)}</b> · ${esc(intents[lead.intent] || "פנייה")} · לפני ${hours} שעות<br>
      <a href="tel:${esc(lead.phone)}">📞 ${esc(lead.phone)}</a> &nbsp;|&nbsp; <a href="https://wa.me/${waNumber(lead.phone)}?text=${encodeURIComponent(text)}">💬 WhatsApp</a></li>`;
  }).join("");
  const sent = await sendEmail(env, `תזכורת: ${results.length} ${results.length === 1 ? "פנייה מחכה" : "פניות מחכות"} לתשובה`,
    frame("⏰ פניות שעוד לא טופלו", `<p>הפניות האלה הגיעו מהאתר ועדיין מסומנות כ״חדש״. לקוח שחוזרים אליו מהר נוטה הרבה יותר להמשיך איתכם.</p><ul style="padding-right:18px">${items}</ul>
      <p style="color:#53645a">אחרי שחזרתם ללקוח, עדכנו את שלב הפנייה במשרד כדי שהתזכורת לא תחזור.</p>`, origin));
  if (sent) await env.DB.batch(results.map(lead => env.DB.prepare("INSERT OR IGNORE INTO site_lead_reminders (lead_id,at) VALUES (?,?)").bind(lead.id, now.toISOString())));
  return sent ? results.length : 0;
}

export async function weeklyReport(env, origin, loadCatalog, towns, now = new Date()) {
  if (!notifyReady(env) || !env.DB) return false;
  const report = await statsReport(env, 7, loadCatalog, towns);
  const since = new Date(now.getTime() - 7 * 86400000).toISOString();
  const [{results: leads}, {results: newProps}] = await Promise.all([
    env.DB.prepare("SELECT intent,count(*) AS n FROM office_leads WHERE created_at>=? GROUP BY intent ORDER BY n DESC").bind(since).all(),
    env.DB.prepare("SELECT count(*) AS n FROM office_properties WHERE published_at>=? AND status IN ('active','negotiation')").bind(since).all(),
  ]);
  const leadTotal = leads.reduce((sum, row) => sum + row.n, 0);
  const row = (label, value) => `<tr><td style="padding:4px 0 4px 16px">${esc(label)}</td><td style="padding:4px 0;font-weight:bold">${value}</td></tr>`;
  const table = rows => `<table style="border-collapse:collapse;margin-bottom:6px">${rows}</table>`;
  const body = `
    <p style="font-size:17px"><b>${num(report.total)}</b> צפיות בעמודים · <b>${num(leadTotal)}</b> פניות חדשות · <b>${num(newProps[0]?.n)}</b> נכסים חדשים באתר</p>
    <h3 style="margin:18px 0 6px">מאיפה הגיעו המבקרים</h3>${report.sources.length ? table(report.sources.map(s => row(s.source, num(s.views))).join("")) : "<p>עדיין אין נתונים.</p>"}
    <h3 style="margin:18px 0 6px">העמודים הנצפים ביותר</h3>${report.pages.length ? table(report.pages.slice(0, 8).map(p => row(p.label, num(p.views))).join("")) : "<p>עדיין אין נתונים.</p>"}
    <h3 style="margin:18px 0 6px">פניות לפי סוג</h3>${leads.length ? table(leads.map(l => row(intents[l.intent] || l.intent, num(l.n))).join("")) : "<p>לא היו פניות השבוע.</p>"}
    <p style="color:#53645a;margin-top:16px">טיפ: נכס שמתפרסם גם בפייסבוק, בוואטסאפ וביד 2 עם קישור לאתר מביא יותר כניסות ופניות.</p>`;
  return sendEmail(env, `הדוח השבועי של האתר: ${num(report.total)} צפיות, ${num(leadTotal)} פניות`, frame("📊 השבוע באתר שפע נדל״ן", body, origin));
}
