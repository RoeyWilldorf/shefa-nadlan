// Privacy-friendly visitor statistics: counts page views per page and per traffic source
// per day. No cookies, no IP addresses, nothing that identifies a visitor.
import {isIndexable} from "./site-growth.mjs";

const bot=/bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|lighthouse|headless/i;
const israelDay=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jerusalem"}).format(new Date());

function sourceOf(request,url) {
  const utm=url.searchParams.get("utm_source");
  if (utm) return {facebook:"Facebook",instagram:"Instagram",whatsapp:"WhatsApp",marketplace:"Marketplace",story:"סטוריז",landing:"דף נחיתה"}[utm]||utm.slice(0,40);
  const referer=request.headers.get("referer");
  if (!referer) return "כניסה ישירה";
  try {
    const host=new URL(referer).hostname.replace(/^www\./,"");
    if (host===url.hostname) return null;
    if (/google\./.test(host)) return "Google";
    if (/facebook\.com|fb\.com|fb\.me/.test(host)) return "Facebook";
    if (/instagram\.com/.test(host)) return "Instagram";
    if (/whatsapp|wa\.me/.test(host)) return "WhatsApp";
    if (/bing\./.test(host)) return "Bing";
    if (/yad2/.test(host)) return "יד2";
    return host.slice(0,60);
  } catch { return null; }
}

export async function countView(env,request,url) {
  if (!env.DB||request.method!=="GET"||bot.test(request.headers.get("user-agent")||"")) return;
  const path=url.pathname==="/index.html"?"/":url.pathname;
  if (!isIndexable(path)&&!path.startsWith("/properties/")) return;
  const day=israelDay();
  const source=sourceOf(request,url);
  const batch=[env.DB.prepare("INSERT INTO site_page_views (day,path,views) VALUES (?,?,1) ON CONFLICT(day,path) DO UPDATE SET views=views+1").bind(day,path)];
  if (source) batch.push(env.DB.prepare("INSERT INTO site_sources (day,source,views) VALUES (?,?,1) ON CONFLICT(day,source) DO UPDATE SET views=views+1").bind(day,source));
  await env.DB.batch(batch);
}

export async function statsReport(env,days,loadCatalog,towns) {
  const since=new Date(Date.now()-(days-1)*86400000).toISOString().slice(0,10);
  const [daily,pages,sources]=await Promise.all([
    env.DB.prepare("SELECT day,sum(views) AS views FROM site_page_views WHERE day>=? GROUP BY day ORDER BY day").bind(since).all(),
    env.DB.prepare("SELECT path,sum(views) AS views FROM site_page_views WHERE day>=? GROUP BY path ORDER BY views DESC LIMIT 15").bind(since).all(),
    env.DB.prepare("SELECT source,sum(views) AS views FROM site_sources WHERE day>=? GROUP BY source ORDER BY views DESC LIMIT 10").bind(since).all(),
  ]);
  let titles={};
  try { titles=Object.fromEntries(((await (await loadCatalog()).json()).properties??[]).map(p=>[`/listing/${p.id}`,`${p.title} · ${p.town}`])); } catch {}
  const label=path=>titles[path]||(path==="/"?"דף הבית":path==="/valuation.html"?"הערכת שווי":path==="/about.html"?"אודות":path==="/mortgage.html"?"מחשבון משכנתא":path==="/privacy.html"?"מדיניות פרטיות":path==="/accessibility.html"?"הצהרת נגישות":
    path.startsWith("/areas/")?`אזור: ${towns[path.slice(7,-5)]||path}`:path.startsWith("/guides/")?`מדריך: ${path.slice(8,-5)}`:
    path.startsWith("/properties/")?`נכס לדוגמה: ${path.slice(12,-5)}`:path.startsWith("/listing/")?"נכס שהוסר":path);
  const total=daily.results.reduce((sum,row)=>sum+row.views,0);
  return {days,total,daily:daily.results,pages:pages.results.map(row=>({...row,label:label(row.path)})),sources:sources.results};
}
