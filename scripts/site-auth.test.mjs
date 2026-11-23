import test from "node:test";
import assert from "node:assert/strict";
import {localDatabase,localBucket} from "./local-bindings.mjs";
import {collectAssets} from "./build.mjs";
import {makeWorker} from "../worker/index.mjs";
import {withSiteAuth} from "../worker/site-auth.mjs";

const origin="https://shefa.example";
const env={DB:localDatabase(),BUCKET:localBucket(),OFFICE_PASSWORD:"correct horse",OFFICE_OWNER_EMAIL:"owner@shefa.example"};
const site=withSiteAuth(makeWorker(await collectAssets()));
const call=(path,init={})=>site.fetch(new Request(origin+path,{redirect:"manual",...init}),env);

test("spoofed platform identity headers are ignored",async()=>{
  const response=await call("/api/office/state",{headers:{"oai-authenticated-user-id":"x","oai-authenticated-user-email":"owner@shefa.example"}});
  assert.equal(response.status,403);
});
test("office page redirects anonymous visitors to the login page",async()=>{
  const response=await call("/office");
  assert.equal(response.status,303);
  assert.equal(response.headers.get("location"),"/login");
});
test("public inquiry works without login and gets a visitor cookie",async()=>{
  const response=await call("/api/inquiries",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},
    body:JSON.stringify({name:"בדיקה",phone:"0501234567",propertyId:"gedera-01",intent:"buy",consent:true})});
  assert.equal(response.status,201);
  assert.match(response.headers.get("set-cookie")||"",/shefa_visitor=/);
});
test("wrong password is rejected, right password opens the office",async()=>{
  const form=password=>({method:"POST",headers:{Origin:origin},body:new URLSearchParams({password})});
  assert.equal((await call("/login",form("wrong"))).status,401);
  const ok=await call("/login",form("correct horse"));
  assert.equal(ok.status,303);
  const session=ok.headers.get("set-cookie").split(";")[0];
  assert.equal((await call("/api/office/state",{headers:{cookie:session}})).status,200);
  assert.equal((await call("/api/office/state",{headers:{cookie:session.slice(0,-3)+"abc"}})).status,403);
});
test("canonical links point at the current site",async()=>{
  const html=await (await call("/")).text();
  assert.ok(html.includes(`href="${origin}/"`));
  assert.ok(!html.includes("chatgpt.site"));
});

test("robots.txt and sitemap.xml are served",async()=>{
  const robots=await (await call("/robots.txt")).text();
  assert.match(robots,/Disallow: \/office/);
  assert.match(robots,new RegExp(`Sitemap: ${origin}/sitemap.xml`));
  const sitemap=await (await call("/sitemap.xml")).text();
  assert.match(sitemap,/<urlset/);
  assert.ok(sitemap.includes(`<loc>${origin}/</loc>`));
});
test("public pages are indexable, demo and office pages are not",async()=>{
  const home=await call("/");
  assert.equal(home.headers.get("x-robots-tag"),null);
  assert.ok(!(await home.text()).includes('content="noindex'));
  const demo=await call("/properties/gedera-01.html");
  assert.match(await demo.text(),/noindex/);
  const login=await call("/login");
  assert.match(login.headers.get("x-robots-tag")||"",/noindex/);
});
test("unknown pages get a friendly 404 page",async()=>{
  const response=await call("/no-such-page");
  assert.equal(response.status,404);
  assert.match(await response.text(),/העמוד שחיפשתם לא נמצא/);
});
test("AI copy is owner-only and uses only the property's facts",async()=>{
  const form={method:"POST",headers:{Origin:origin},body:new URLSearchParams({password:"correct horse"})};
  const session=(await call("/login",form)).headers.get("set-cookie").split(";")[0];
  const draft={title:"דירת בדיקה",town:"אשדוד",neighborhood:"מרכז",price:1990000,deal:"sale",type:"דירה",status:"draft",rooms:4,area:100,
    address:"רחוב סודי 1",owner:"בעל נכס",ownerPhone:"0501234567",agent:"סוכן",notes:"פנימי",parking:true,description:"דירה מוארת"};
  const created=await call("/api/office/properties",{method:"POST",headers:{cookie:session,Origin:origin,"Content-Type":"application/json"},body:JSON.stringify(draft)});
  const {id}=await created.json();
  let prompt="";
  env.AI={run:async(model,input)=>{prompt=JSON.stringify(input);return {response:"כותרת: דירה מוארת באשדוד\n\nגוף הנוסח לבדיקה עם מספיק טקסט."};}};
  const anonymous=await call(`/api/office/properties/${id}/ai-copy`,{method:"POST",headers:{Origin:origin},body:"{}"});
  assert.equal(anonymous.status,403);
  const response=await call(`/api/office/properties/${id}/ai-copy`,{method:"POST",headers:{cookie:session,Origin:origin,"Content-Type":"application/json"},body:JSON.stringify({channel:"facebook"})});
  assert.equal(response.status,200);
  const copy=await response.json();
  assert.equal(copy.title,"דירה מוארת באשדוד");
  assert.ok(prompt.includes("אשדוד")&&prompt.includes("חניה"));
  assert.ok(!prompt.includes("רחוב סודי")&&!prompt.includes("0501234567"),"private details must not reach the AI");
  delete env.AI;
});
