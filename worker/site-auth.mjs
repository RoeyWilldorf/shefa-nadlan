// Standalone hosting layer (Cloudflare Workers or any host that runs a fetch() worker).
//
// The core app (worker/index.mjs) was written for a platform that authenticated every
// visitor itself and passed the identity in trusted "oai-authenticated-user-*" headers.
// Outside that platform this wrapper takes over that job:
//   * Any incoming "oai-*" header is DROPPED, so nobody can fake an identity.
//   * The office owner logs in at /login with OFFICE_PASSWORD and gets a signed,
//     HttpOnly session cookie; only then are the owner headers injected.
//   * Every other visitor gets a random anonymous visitor id (cookie), so the public
//     site, contact forms and visit forms work without any login.
//   * Login attempts and public inquiries are rate limited per IP.
//   * If no R2 bucket is bound but a KV namespace "FILES" is, files are stored in KV.

import {robotsTxt,sitemapXml,aiCopy,aiCopyPath,notFoundPage,publicHtml,publicHeaders} from "./site-growth.mjs";
import {notifyReady,sendEmail,leadEmail,notifyMatches} from "./site-notify.mjs";
import {countView,statsReport} from "./site-stats.mjs";
import {townSlugs} from "../dist/listings.mjs";
const slugTowns=Object.fromEntries(Object.entries(townSlugs).map(([town,slug])=>[slug,town]));

const SESSION_COOKIE="shefa_session";
const VISITOR_COOKIE="shefa_visitor";
const SESSION_HOURS=12;
const LOGIN_LIMIT={max:5,minutes:15};
const INQUIRY_LIMIT={max:8,minutes:60};
const LEGACY_ORIGIN="https://shefa-nadlan-gedera.roivil13.chatgpt.site";
const DEFAULT_OWNER_EMAIL="owner@shefa-nadlan.local";
const encoder=new TextEncoder();

const b64url=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");

function cookies(request) {
  const result={};
  for (const part of (request.headers.get("cookie")||"").split(";")) {
    const index=part.indexOf("=");
    if (index>0) result[part.slice(0,index).trim()]=part.slice(index+1).trim();
  }
  return result;
}
function cookie(name,value,maxAge,sameSite="Strict") {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=${sameSite}`;
}
async function hmacKey(secret,label) {
  const base=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const derived=await crypto.subtle.sign("HMAC",base,encoder.encode(label));
  return crypto.subtle.importKey("raw",derived,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
}
async function sign(secret,label,message) {
  return b64url(await crypto.subtle.sign("HMAC",await hmacKey(secret,label),encoder.encode(message)));
}
function sameText(a,b) {
  if (a.length!==b.length) return false;
  let diff=0;
  for (let i=0;i<a.length;i++) diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
async function passwordMatches(env,given) {
  // Compare HMAC digests so the comparison time does not depend on the password.
  const expected=await sign(env.OFFICE_PASSWORD,"shefa-password-v1","password");
  const actual=await sign(typeof given==="string"?given:"","shefa-password-v1","password");
  return sameText(expected,actual);
}
async function newSession(env) {
  const expires=Date.now()+SESSION_HOURS*3600*1000;
  return `${expires}.${await sign(env.OFFICE_PASSWORD,"shefa-session-v1",`office:${expires}`)}`;
}
async function validSession(env,value) {
  if (!env.OFFICE_PASSWORD||!value) return false;
  const [expires,signature]=value.split(".");
  if (!/^\d{13}$/.test(expires||"")||Number(expires)<Date.now()) return false;
  return sameText(signature||"",await sign(env.OFFICE_PASSWORD,"shefa-session-v1",`office:${expires}`));
}

async function limited(env,kind,ip,limit) {
  if (!env.DB) return false;
  const since=new Date(Date.now()-limit.minutes*60000).toISOString();
  try {
    const row=await env.DB.prepare("SELECT count(*) AS count FROM site_rate_events WHERE kind=? AND ip=? AND at>?").bind(kind,ip,since).first();
    return (row?.count??0)>=limit.max;
  } catch { return false; }
}
async function record(env,kind,ip) {
  if (!env.DB) return;
  try {
    await env.DB.prepare("INSERT INTO site_rate_events (kind,ip,at) VALUES (?,?,?)").bind(kind,ip,new Date().toISOString()).run();
    if (Math.random()<0.05) await env.DB.prepare("DELETE FROM site_rate_events WHERE at<?").bind(new Date(Date.now()-86400000).toISOString()).run();
  } catch {}
}
async function clearAttempts(env,kind,ip) {
  try { await env.DB?.prepare("DELETE FROM site_rate_events WHERE kind=? AND ip=?").bind(kind,ip).run(); } catch {}
}

export function kvBucket(kv) {
  return {
    async put(key,bytes,options={}) {
      await kv.put(key,bytes,{metadata:{contentType:options.httpMetadata?.contentType||""}});
    },
    async get(key) {
      const value=await kv.get(key,"arrayBuffer");
      return value?{body:value,arrayBuffer:async()=>value}:null;
    },
    async delete(key) { await kv.delete(key); },
  };
}

const escapeHtml=text=>String(text).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function loginPage({error="",configured=true}={}) {
  const message=!configured
    ?`<p class="note" role="alert">הכניסה למשרד עדיין לא הוגדרה. יש להגדיר סיסמה (OFFICE_PASSWORD) בהגדרות השרת.</p>`
    :error?`<p class="note" role="alert">${escapeHtml(error)}</p>`:"";
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>כניסה לאזור המשרד | שפע נדל״ן</title>
<link rel="icon" href="/media/shefa-round.webp">
<style>
@font-face{font-family:Shefa Hebrew;src:url(/media/hebrew-regular.ttf) format("truetype");font-weight:400;font-display:swap}
@font-face{font-family:Shefa Hebrew;src:url(/media/hebrew-bold.ttf) format("truetype");font-weight:700;font-display:swap}
:root{--page:#faf9f5;--ink:#20372e;--forest:#264539;--muted:#53645a;--line:#e1e4db;--sand:#e9d7b3}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;background:var(--page);color:var(--ink);font-family:"Shefa Hebrew",Arial,sans-serif;line-height:1.55}
main{width:min(420px,100%);background:#fff;border:1px solid var(--line);border-radius:18px;padding:32px 28px;box-shadow:0 12px 40px #253d2e14}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:22px}
.brand img{width:52px;height:52px;border-radius:50%}
.brand strong{display:block;font-size:1.25rem}
.brand span{color:var(--muted);font-size:.95rem}
h1{font-size:1.45rem;margin:0 0 6px}
p{margin:0 0 18px;color:var(--muted)}
label{display:block;font-weight:700;margin-bottom:6px}
input{width:100%;font:inherit;padding:12px 14px;border:1.5px solid #9aa69e;border-radius:10px;background:#fff;color:var(--ink)}
input:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid #a97526;outline-offset:3px}
button{margin-top:18px;width:100%;font:inherit;font-weight:700;padding:13px;border:0;border-radius:10px;background:var(--forest);color:#fff;cursor:pointer}
button:hover{background:#1b3329}
.note{background:#fff4e0;border:1px solid var(--sand);color:#5b3b06;border-radius:10px;padding:10px 12px}
.back{display:inline-block;margin-top:18px;color:var(--forest);font-weight:700}
</style>
</head>
<body>
<main>
  <div class="brand"><img src="/media/shefa-round.webp" alt=""><div><strong>שפע נדל״ן</strong><span>אזור המשרד</span></div></div>
  <h1>כניסה לאזור המשרד</h1>
  <p>האזור מיועד לצוות המשרד בלבד.</p>
  ${message}
  <form method="post" action="/login">
    <label for="password">סיסמה</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required autofocus ${configured?"":"disabled"}>
    <button type="submit" ${configured?"":"disabled"}>כניסה</button>
  </form>
  <a class="back" href="/">חזרה לאתר ↩</a>
</main>
</body>
</html>`;
}
const htmlHeaders={"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow","X-Frame-Options":"DENY"};
const redirect=(location,extra={})=>new Response(null,{status:303,headers:{Location:location,"Cache-Control":"no-store",...extra}});

function sameOrigin(request) {
  const origin=request.headers.get("origin");
  return !origin||origin===new URL(request.url).origin;
}

// Applies the SQL files from drizzle/ to a fresh database, once, in order. Each file runs in
// one D1 batch (a transaction) together with its bookkeeping row, so two instances starting
// at the same moment cannot apply the same file twice.
let migrated=null;
async function migrate(db,migrations) {
  await db.prepare("CREATE TABLE IF NOT EXISTS _site_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL)").run();
  const done=new Set((await db.prepare("SELECT name FROM _site_migrations").all()).results.map(row=>row.name));
  for (const {name,sql} of migrations) {
    if (done.has(name)) continue;
    const parts=sql.split("--> statement-breakpoint").map(part=>part.trim()).filter(Boolean);
    try {
      await db.batch([db.prepare("INSERT INTO _site_migrations (name,applied_at) VALUES (?,?)").bind(name,new Date().toISOString()),
        ...parts.map(part=>db.prepare(part))]);
    } catch(error) {
      const again=await db.prepare("SELECT name FROM _site_migrations WHERE name=?").bind(name).first();
      if (!again) throw error;
    }
  }
}

export function withSiteAuth(worker,{migrations=[],guides=[]}={}) {
  return {async fetch(request,env,ctx) {
    if (!env.BUCKET&&env.FILES) env={...env,BUCKET:kvBucket(env.FILES)};
    if (env.DB&&migrations.length) {
      migrated??=migrate(env.DB,migrations).catch(error=>{migrated=null;throw error;});
      await migrated;
    }
    const url=new URL(request.url);
    const path=url.pathname;
    const method=request.method;
    const ip=request.headers.get("cf-connecting-ip")||request.headers.get("x-forwarded-for")?.split(",")[0].trim()||"local";
    const jar=cookies(request);
    const owner=await validSession(env,jar[SESSION_COOKIE]);
    const setCookies=[];

    if (path==="/login") {
      if (method==="GET"||method==="HEAD") {
        if (owner) return redirect("/office");
        return new Response(method==="HEAD"?null:loginPage({configured:Boolean(env.OFFICE_PASSWORD)}),{headers:htmlHeaders});
      }
      if (method==="POST") {
        if (!env.OFFICE_PASSWORD) return new Response(loginPage({configured:false}),{status:503,headers:htmlHeaders});
        if (!sameOrigin(request)) return new Response(loginPage({error:"מקור הבקשה לא אושר."}),{status:403,headers:htmlHeaders});
        if (await limited(env,"login",ip,LOGIN_LIMIT)) {
          return new Response(loginPage({error:"יותר מדי ניסיונות כניסה. נסו שוב בעוד כרבע שעה."}),{status:429,headers:htmlHeaders});
        }
        const form=await request.formData().catch(()=>null);
        if (await passwordMatches(env,form?.get("password"))) {
          await clearAttempts(env,"login",ip);
          return redirect("/office",{"Set-Cookie":cookie(SESSION_COOKIE,await newSession(env),SESSION_HOURS*3600)});
        }
        await record(env,"login",ip);
        return new Response(loginPage({error:"הסיסמה שגויה."}),{status:401,headers:htmlHeaders});
      }
      return new Response("Method not allowed",{status:405});
    }
    if (path==="/logout") {
      if (method!=="POST"||!sameOrigin(request)) return new Response("Method not allowed",{status:405});
      return redirect("/",{"Set-Cookie":cookie(SESSION_COOKIE,"",0)});
    }
    if (!owner&&(path==="/office"||path==="/office/"||path==="/office.html")&&(method==="GET"||method==="HEAD")) {
      return redirect("/login");
    }
    if (path==="/api/inquiries"&&method==="POST"&&!owner) {
      if (await limited(env,"inquiry",ip,INQUIRY_LIMIT)) {
        return new Response(JSON.stringify({error:"נשלחו יותר מדי פניות. נסו שוב מאוחר יותר או התקשרו אלינו."}),
          {status:429,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
      }
      await record(env,"inquiry",ip);
    }

    // Rebuild the identity headers from scratch: never trust what the client sent.
    const headers=new Headers();
    for (const [name,value] of request.headers) if (!name.toLowerCase().startsWith("oai-")) headers.append(name,value);
    if (owner) {
      headers.set("oai-authenticated-user-id","office-owner");
      headers.set("oai-authenticated-user-email",(env.OFFICE_OWNER_EMAIL||DEFAULT_OWNER_EMAIL).trim().toLowerCase());
    } else {
      let visitor=jar[VISITOR_COOKIE];
      if (!/^[0-9a-f-]{36}$/.test(visitor||"")) {
        visitor=crypto.randomUUID();
        setCookies.push(cookie(VISITOR_COOKIE,visitor,365*86400,"Lax"));
      }
      headers.set("oai-authenticated-user-id",`visitor-${visitor}`);
    }
    const innerEnv=env.OFFICE_OWNER_EMAIL?env:{...env,OFFICE_OWNER_EMAIL:DEFAULT_OWNER_EMAIL};
    const innerHeaders=new Headers(headers); innerHeaders.delete("content-length"); innerHeaders.delete("content-type");
    const inner=(target,init2={})=>worker.fetch(new Request(new URL(target,url),{method:"GET",headers:innerHeaders,redirect:"manual",...init2}),innerEnv,ctx);

    if (path==="/robots.txt"&&method==="GET") return robotsTxt(url);
    if (path==="/sitemap.xml"&&method==="GET") return sitemapXml(url,guides,()=>inner("/api/catalog"));
    if (path==="/api/office/site-stats"&&method==="GET") {
      if (!owner) return new Response(JSON.stringify({error:"אזור המשרד זמין לבעל האתר לאחר התחברות."}),{status:403,headers:{"Content-Type":"application/json; charset=utf-8"}});
      const days=[7,30,90].includes(Number(url.searchParams.get("days")))?Number(url.searchParams.get("days")):30;
      return new Response(JSON.stringify(await statsReport(env,days,()=>inner("/api/catalog"),slugTowns)),{headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
    }
    const ai=path.match(aiCopyPath);
    if (ai&&method==="POST") {
      if (!owner||!sameOrigin(request)) return new Response(JSON.stringify({error:"אזור המשרד זמין לבעל האתר לאחר התחברות."}),{status:403,headers:{"Content-Type":"application/json; charset=utf-8"}});
      const data=await request.json().catch(()=>({}));
      return aiCopy(env,data,()=>inner(`/api/office/properties/${ai[1]}`),url.origin);
    }

    const init={method,headers,redirect:"manual"};
    // New inquiries are read here first so the office can be emailed about them.
    const inquiryText=path==="/api/inquiries"&&method==="POST"&&notifyReady(env)?await request.text():null;
    if (inquiryText!==null) init.body=inquiryText;
    else if (method!=="GET"&&method!=="HEAD") {init.body=request.body; init.duplex="half";}
    let response=await worker.fetch(new Request(request.url,init),innerEnv,ctx);
    const later=promise=>{const task=promise.catch(error=>console.error("notify_error",error?.message)); if (ctx?.waitUntil) ctx.waitUntil(task); return task;};
    if (inquiryText!==null&&response.status===201) {
      try { const {subject,html}=leadEmail(JSON.parse(inquiryText),url.origin); later(sendEmail(env,subject,html)); } catch {}
    }
    const savedProperty=owner&&notifyReady(env)&&response.ok&&path.match(/^\/api\/office\/properties(?:\/([0-9a-f-]{36}))?$/i);
    if (savedProperty&&(method==="POST"||method==="PUT")) {
      const id=savedProperty[1]||(await response.clone().json().catch(()=>({}))).id;
      if (id) later(notifyMatches(env,id,()=>inner("/api/office/state"),url.origin));
    }

    const type=response.headers.get("content-type")||"";
    if (response.status===404&&(method==="GET"||method==="HEAD")&&!path.startsWith("/api/")&&!/\.(webp|jpg|png|svg|ttf|css|m?js|txt)$/.test(path)) {
      response=new Response(method==="HEAD"?null:notFoundPage(),{status:404,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}});
    } else if (type.startsWith("text/html")||type.includes("xml")) {
      // The pages were written for the old address; point canonical/OG links at this site.
      const text=publicHtml((await response.text()).replaceAll(LEGACY_ORIGIN,url.origin),path,env);
      response=new Response(method==="HEAD"?null:text,response);
    }
    response=new Response(response.body,response);
    for (const value of setCookies) response.headers.append("Set-Cookie",value);
    const h=response.headers;
    h.set("X-Content-Type-Options","nosniff");
    h.set("Referrer-Policy","strict-origin-when-cross-origin");
    h.set("Permissions-Policy","camera=(), microphone=(), geolocation=(), interest-cohort=()");
    if ((h.get("content-type")||"").startsWith("text/html")) h.set("X-Frame-Options","SAMEORIGIN");
    if (url.protocol==="https:") h.set("Strict-Transport-Security","max-age=31536000");
    publicHeaders(response,path,env);
    if (!owner&&response.status===200&&(response.headers.get("content-type")||"").startsWith("text/html")) later(countView(env,request,url));
    return response;
  }};
}
