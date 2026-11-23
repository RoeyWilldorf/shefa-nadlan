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
