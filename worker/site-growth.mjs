// Growth features for the standalone site: search-engine indexing, robots.txt, sitemap.xml,
// a branded 404 page, optional Google verification + Cloudflare Web Analytics, and AI-written
// marketing copy (Cloudflare Workers AI) for the office marketing studio.

const ID="[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}";
const listingPath=new RegExp(`^/listing/${ID}$`,"i");
export const aiCopyPath=new RegExp(`^/api/office/properties/(${ID})/ai-copy$`,"i");

// Pages Google may index. The demo property pages (/properties/*.html) stay out on purpose:
// they show sample prices, so they should not appear in search results as real offers.
export function isIndexable(path) {
  return path==="/"||path==="/index.html"||path==="/accessibility.html"||path==="/valuation.html"||path==="/about.html"||path==="/mortgage.html"||path==="/privacy.html"||/^\/(guides|areas)\/[\w-]+\.html$/.test(path)||listingPath.test(path);
}
const isPrivate=path=>/^\/(office|login|logout|visit|api)(\/|$|\.)/.test(path)||path.startsWith("/office.");

export function robotsTxt(url) {
  return new Response(`User-agent: *
Allow: /
Disallow: /office
Disallow: /office.html
Disallow: /login
Disallow: /visit
Disallow: /api/
Disallow: /properties/

Sitemap: ${url.origin}/sitemap.xml
`,{headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"public, max-age=3600"}});
}

export async function sitemapXml(url,guides,loadCatalog) {
  const today=new Date().toISOString().slice(0,10);
  const entries=[{loc:"/",priority:"1.0",changefreq:"daily",lastmod:today},
    ...guides.map(path=>({loc:path,priority:path.startsWith("/areas/")||path==="/valuation.html"?"0.8":"0.7",changefreq:path.startsWith("/areas/")?"weekly":"monthly"})),
    {loc:"/accessibility.html",priority:"0.3",changefreq:"yearly"}];
  try {
    const response=await loadCatalog();
    if (response.ok) for (const p of (await response.json()).properties??[]) {
      entries.push({loc:`/listing/${p.id}`,priority:"0.8",changefreq:"weekly",lastmod:(p.publishedAt||"").slice(0,10)||undefined});
    }
  } catch {}
  const body=entries.map(e=>`  <url><loc>${url.origin}${e.loc}</loc>${e.lastmod?`<lastmod>${e.lastmod}</lastmod>`:""}<changefreq>${e.changefreq}</changefreq><priority>${e.priority}</priority></url>`).join("\n");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
    {headers:{"Content-Type":"application/xml; charset=utf-8","Cache-Control":"public, max-age=900"}});
}

export function notFoundPage() {
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>העמוד לא נמצא | שפע נדל״ן</title><link rel="icon" href="/media/shefa-round.webp">
<style>
@font-face{font-family:Shefa Hebrew;src:url(/media/hebrew-regular.ttf) format("truetype");font-weight:400;font-display:swap}
@font-face{font-family:Shefa Hebrew;src:url(/media/hebrew-bold.ttf) format("truetype");font-weight:700;font-display:swap}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;background:#faf9f5;color:#20372e;font-family:"Shefa Hebrew",Arial,sans-serif;text-align:center;line-height:1.55}
main{max-width:460px}img{width:88px;height:88px;border-radius:50%;margin:0 auto 18px;display:block}
h1{font-size:1.7rem;margin:0 0 8px}p{color:#53645a;margin:0 0 22px}
.row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
a{display:inline-block;padding:12px 18px;border-radius:10px;font-weight:700;text-decoration:none}
.primary{background:#264539;color:#fff}.outline{border:1.5px solid #264539;color:#264539}
a:focus-visible{outline:3px solid #a97526;outline-offset:3px}
</style></head><body><main>
<img src="/media/shefa-round.webp" alt="">
<h1>העמוד שחיפשתם לא נמצא</h1>
<p>ייתכן שהנכס כבר נמכר או הוסר מהאתר. אפשר לחזור לרשימת הנכסים או לפנות אלינו ונמצא עבורכם נכס מתאים.</p>
<div class="row"><a class="primary" href="/#listings">לכל הנכסים</a><a class="outline" href="/#contact">יצירת קשר</a></div>
</main></body></html>`;
}

// Turns a page that was written as "private, noindex" into a public, indexable one,
// and adds the optional Google verification tag and analytics beacon.
export function publicHtml(text,path,env) {
  let html=text;
  if (env.SITE_INDEXING!=="off"&&isIndexable(path)) html=html.replace(/<meta name="robots" content="noindex,\s*nofollow">\s*/i,"");
  const head=[];
  if ((path==="/"||path==="/index.html")&&/^[\w-]{10,100}$/.test(env.GOOGLE_SITE_VERIFICATION||"")) {
    head.push(`<meta name="google-site-verification" content="${env.GOOGLE_SITE_VERIFICATION}">`);
  }
  if (!isPrivate(path)&&/^[0-9a-f]{32}$/i.test(env.CF_ANALYTICS_TOKEN||"")) {
    head.push(`<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${env.CF_ANALYTICS_TOKEN}"}'></script>`);
  }
  if (head.length) html=html.replace("</head>",`${head.join("\n")}\n</head>`);
  return html;
}
export function publicHeaders(response,path,env) {
  if (response.status!==200) return;
  const type=response.headers.get("content-type")||"";
  if (type.startsWith("text/html")) {
    if (env.SITE_INDEXING!=="off"&&isIndexable(path)) {
      response.headers.delete("X-Robots-Tag");
      response.headers.set("Cache-Control","public, max-age=120");
    }
  } else if (!isPrivate(path)&&/^(image|font|text\/css|text\/javascript)/.test(type)) {
    response.headers.set("Cache-Control","public, max-age=3600");
  }
}

// ---------- AI marketing copy ----------
const MODELS=["@cf/google/gemma-3-12b-it","@cf/meta/llama-3.3-70b-instruct-fp8-fast"];
const channelGuide={
  site:"תיאור לדף הנכס באתר, מותאם לגוגל (SEO): 120-170 מילים, משפט פתיחה עם סוג הנכס והיישוב, פסקאות קצרות, בלי אימוג׳ים.",
  facebook:"פוסט לפייסבוק: 70-120 מילים, פתיח שתופס את העין, 2-4 אימוג׳ים במידה, רשימת יתרונות קצרה, קריאה לפעולה, ו-3 עד 5 האשטאגים בעברית בסוף.",
  instagram:"כיתוב לאינסטגרם: 40-80 מילים, אנרגטי, אימוג׳ים במידה, קריאה לפעולה (לשלוח הודעה), ו-6 עד 10 האשטאגים בעברית בסוף.",
  whatsapp:"הודעת וואטסאפ לשליחה ללקוחות ולקבוצות: 35-60 מילים, שורות קצרות, עובדות עיקריות כנקודות, קריאה לפעולה. בלי האשטאגים.",
  marketplace:"מודעה למרקטפלייס/יד2: עניינית ומסודרת, 60-100 מילים, עובדות קודם (חדרים, שטח, קומה, מחיר), ואז תיאור קצר.",
  story:"טקסט לסטורי: עד 15 מילים, כותרת קצרה וחזקה + קריאה לפעולה.",
  landing:"דף נחיתה: כותרת ראשית, משפט משנה, 3-5 נקודות יתרון, וקריאה לפעולה ברורה.",
};
const featureWords={lift:"מעלית",parking:"חניה",shelter:"ממ״ד",balcony:"מרפסת",storage:"מחסן",yard:"חצר"};
const toneGuide={warm:"חם ומזמין",luxury:"יוקרתי ומכובד",investor:"ענייני ומכוון למשקיעים (תשואה, ביקוש, פוטנציאל) בלי להבטיח תשואה",urgent:"דינמי עם תחושת הזדמנות, בלי לחץ מזויף"};

function facts(p) {
  const specs=p.specs||{};
  const nis=new Intl.NumberFormat("he-IL");
  return [
    `סוג עסקה: ${p.deal==="rent"?"להשכרה":"למכירה"}`,
    `סוג נכס: ${p.property_type||p.type||""}`,
    `יישוב: ${p.town}`,p.neighborhood&&`שכונה: ${p.neighborhood}`,
    p.rooms&&`חדרים: ${p.rooms}`,p.area&&`שטח: ${p.area} מ״ר`,specs.additionalArea&&`שטח נוסף (מרפסת/חצר): ${specs.additionalArea} מ״ר`,
    specs.floor!=null&&specs.floor!==""&&`קומה: ${specs.floor}${specs.floorCount?` מתוך ${specs.floorCount}`:""}`,
    `מחיר: ${nis.format(p.price)} ₪${p.deal==="rent"?" לחודש":""}`,
    specs.condition&&`מצב הנכס: ${specs.condition}`,specs.availableOn&&`כניסה: ${specs.availableOn}`,
    Object.entries(featureWords).filter(([k])=>specs[k]===true).length&&`מאפיינים: ${Object.entries(featureWords).filter(([k])=>specs[k]===true).map(([,v])=>v).join(", ")}`,
    p.description&&`תיאור מהמשרד: ${p.description}`,
  ].filter(Boolean).join("\n");
}
function parseCopy(text) {
  let clean=String(text||"").replace(/^```[a-z]*\s*|```\s*$/gim,"").trim();
  const lines=clean.split("\n");
  let title=lines.shift()?.replace(/^(כותרת|title)\s*[:：]\s*/i,"").replace(/^[#*\s]+|[*\s]+$/g,"").trim()||"";
  const body=lines.join("\n").replace(/^(תוכן|גוף|body)\s*[:：]\s*/im,"").replace(/\*\*(.+?)\*\*/g,"$1").trim();
  return {title:title.slice(0,220),body:body.slice(0,9000)};
}
// Writes marketing copy for one property with Workers AI. Returns {title,body,model} or null.
export async function writeCopy(env,p,channel="site",tone="warm",origin="") {
  if (!env.AI) return null;
  channel=Object.hasOwn(channelGuide,channel)?channel:"site";
  tone=Object.hasOwn(toneGuide,tone)?tone:"warm";
  const system=`אתה קופירייטר נדל״ן ישראלי מנוסה שכותב עבור משרד התיווך "שפע נדל״ן". כתוב בעברית תקנית, טבעית ושיווקית.
כללים מחייבים:
- השתמש אך ורק בעובדות שנמסרו. אסור להמציא פרטים (נוף, שיפוץ, קרבה למוסדות, תשואה, חניה וכד׳) שלא הופיעו.
- אל תציין כתובת מדויקת, שם בעלים או מספרי טלפון - פרטי הקשר יתווספו אוטומטית.
- בלי הבטחות, בלי הגזמות לא אמינות, ובלי ניסוח מפלה כלפי קבוצה כלשהי.
- פורמט התשובה: בשורה הראשונה כותרת קצרה (עד 12 מילים), שורה ריקה, ואחריה גוף הטקסט בלבד. בלי הסברים, בלי markdown.`;
  const user=`ערוץ: ${channelGuide[channel]}
טון: ${toneGuide[tone]}

פרטי הנכס:
${facts(p)}`;
  let lastError;
  for (const model of MODELS) {
    try {
      const result=await env.AI.run(model,{messages:[{role:"system",content:system},{role:"user",content:user}],max_tokens:900,temperature:0.7});
      const copy=parseCopy(result?.response??result?.result?.response);
      if (copy.title&&copy.body.length>15) {
        const live=["active","negotiation"].includes(p.status);
        const link=live&&origin?`${origin}/listing/${p.id}?utm_source=${channel}&utm_medium=organic&utm_campaign=ai`:"";
        if (link&&channel!=="story") copy.body+=`\n\n${link}`;
        return {...copy,model};
      }
      lastError=new Error("empty");
    } catch(error) { lastError=error; }
  }
  console.error("ai_copy_failed",lastError?.message);
  return null;
}

export async function aiCopy(env,data,loadProperty,origin) {
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
  if (!env.AI) return reply({error:"כתיבה עם AI עדיין לא הופעלה בשרת."},503);
  const response=await loadProperty();
  if (!response.ok) return response;
  const {property:p}=await response.json();
  const copy=await writeCopy(env,p,data?.channel,data?.tone,origin);
  return copy?reply(copy):reply({error:"שירות ה-AI לא החזיר טקסט כרגע. נסו שוב בעוד רגע."},502);
}
