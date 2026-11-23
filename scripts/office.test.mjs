import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {collectAssets} from "./build.mjs";
import {localDatabase,localBucket} from "./local-bindings.mjs";
import {makeWorker} from "../worker/index.mjs";
import {matchProperty} from "../worker/model.mjs";
import {estimateBetterment} from "../dist/betterment.mjs";
import {brandContacts} from "../dist/brand.mjs";
import {contactHref} from "../dist/site-tools.mjs";
import {PDFDocument,PDFHexString,PDFName} from "pdf-lib";

const origin="https://shefa.example";
const actorEmail="owner@example.invalid";
const assets=await collectAssets();
const app=makeWorker(assets);
const owner={"oai-authenticated-user-id":"owner-local","oai-authenticated-user-email":actorEmail};
const staff={...owner,"oai-authenticated-user-email":"other@example.invalid"};

function client(env) {
  return (path,{method="GET",data,body,identity=owner,from=origin}={})=>app.fetch(new Request(origin+path,{method,headers:{...identity,...(method==="GET"?{}:{Origin:from}),...(data?{"Content-Type":"application/json"}:{})},body:data?JSON.stringify(data):body}),env);
}
const propertyDraft={title:"נכס בדיקה <משרד> $&",town:"גדרה",neighborhood:"מרכז",price:2000000,deal:"sale",type:"דירה",status:"draft",
  rooms:4,area:102,address:"כתובת פרטית",owner:"בעל נכס פרטי",ownerPhone:"0501234567",agent:"סוכן",notes:"הערות פנימיות",parking:true,
  description:"תיאור בדיקה <script>alert(1)</script> &"};
const validLead={name:"ליד בדיקה",phone:"050-0000000",email:"lead@example.invalid",intent:"buy",town:"גדרה",budget:2600000,consent:true,features:["parking"]};

test("betterment estimate uses planning uplift, ownership and explicit rates with validated inputs",()=>{
  assert.equal(estimateBetterment({uplift:"500,000"}).total,250000);
  assert.equal(estimateBetterment({method:"values",before:"2,000,000",after:"2,500,000",share:"50"}).total,125000);
  assert.equal(estimateBetterment({uplift:"500000",share:"50",rateMode:"documented",rate:"25"}).total,62500);
  assert.equal(estimateBetterment({uplift:"500000",rateMode:"documented",rate:"0"}).total,0);
  assert.equal(estimateBetterment({method:"values",before:"2500000",after:"2000000"}).total,0);
  assert.equal(estimateBetterment({uplift:"0"}).total,0);
  assert.equal(estimateBetterment({uplift:"100001",share:"33.33"}).total,16665.17);
  for(const input of [{uplift:""},{uplift:"-1"},{uplift:"1e6"},{uplift:"10,00"},{uplift:"1000000001"},
    {uplift:"100",share:"0"},{uplift:"100",share:"101"},{uplift:"100",share:"33.333"},
    {uplift:"100",rateMode:"documented",rate:""},{uplift:"100",rateMode:"documented",rate:"101"},
    {method:"values",before:"0",after:""}]) assert.throws(()=>estimateBetterment(input),Error);
});

test("accessibility feedback opens one queued task and both contact links keep their context",async t=>{
  const DB=localDatabase();
  t.after(()=>DB.close());
  const send=client({DB,BUCKET:localBucket(),OFFICE_OWNER_EMAIL:actorEmail});
  const requestId=crypto.randomUUID();
  const report={...validLead,requestId,intent:"access",message:"שדה בלתי קריא",accessPage:"טופס תיאום סיור"};
  const path="/api/inquiries";
  assert.equal((await send(path,{method:"POST",data:{...report,message:""}})).status,400);
  for(let attempt=0;attempt<2;attempt++) assert.equal((await send(path,{method:"POST",data:report})).status,201);
  const office=await (await send("/api/office/state")).json();
  assert.equal(office.work.length,1);
  assert.equal(office.work[0].lead_id,requestId);
  assert.equal(office.work[0].status,"open");
  assert.match(office.work[0].notes,/טופס תיאום סיור/);
  assert.equal(office.work[0].assigned_to,office.leads[0].assigned_to);
  const property={id:"gedera-01",deal:"sale",title:"דירה & מרפסת",town:"גדרה"};
  for(const [index,contact] of brandContacts.entries()){
    const destination=["972527504034","972527504037"][index];
    assert.equal(contact.tel,"+"+destination);
    const general=new URL(contactHref(contact,origin));
    assert.equal(general.origin,"https://wa.me");
    assert.equal(general.pathname,"/"+destination);
    assert.match(general.searchParams.get("text"),/הגעתי דרך האתר/);
    const details=new URL(contactHref(contact,origin,property)).searchParams.get("text");
    assert.match(details,/דירה & מרפסת/);
    assert.match(details,/נכס gedera-01/);
    assert.ok(details.endsWith(origin+"/properties/gedera-01.html"));
  }
});

test("office authorization, origin validation and existing site assets",async t=>{
  const DB=localDatabase();
  t.after(()=>DB.close());
  const send=client({DB,BUCKET:localBucket(),OFFICE_OWNER_EMAIL:actorEmail});
  assert.equal((await send("/")).status,200);
  assert.match(await (await send("/")).text(),/הכירו את שפע/);
  assert.equal((await send("/properties/gedera-01.html")).status,200);
  assert.equal((await send("/office",{identity:{}})).status,403);
  assert.equal((await send("/office.html",{identity:staff})).status,403);
  assert.equal((await send("/api/office/state",{identity:staff})).status,403);
  assert.equal((await send("/api/office/export",{identity:{}})).status,403);
  assert.equal((await send("/api/office/properties",{method:"POST",data:propertyDraft,from:"https://other.example"})).status,403);
  assert.equal((await send("/api/inquiries",{method:"POST",data:validLead,identity:{}})).status,403);
  assert.equal((await send("/office")).status,200);
  assert.deepEqual(await (await send("/api/health",{identity:{}})).json(),{database:true,storage:true,officeConfigured:true});
});
test("property persistence, status gates, optimistic revision, media access and export",async t=>{
  const directory=await mkdtemp(join(tmpdir(),"shefa-persistence-"));
  const filename=join(directory,"office.sqlite");
  let DB=localDatabase(filename);
  const BUCKET=localBucket(join(directory,"objects"));
  t.after(async()=>{DB.close();await rm(directory,{recursive:true,force:true});});
  const env={DB,BUCKET,OFFICE_OWNER_EMAIL:actorEmail};
  const send=client(env);
  assert.equal((await send("/api/office/properties",{method:"POST",data:{...propertyDraft,status:"active"}})).status,400);
  const created=await send("/api/office/properties",{method:"POST",data:propertyDraft});
  assert.equal(created.status,201);
  const {id}=await created.json();
  assert.deepEqual(await (await send("/api/catalog")).json(),{properties:[]});
  assert.equal((await send(`/listing/${id}`)).status,404);
  const png=Uint8Array.from([137,80,78,71,13,10,26,10,0]);
  const pdf=new TextEncoder().encode("%PDF-1.4");
  assert.equal((await send(`/api/office/properties/${id}/files?label=PDF&public=1`,{method:"POST",body:pdf})).status,415);
  const photo=await send(`/api/office/properties/${id}/files?label=photo&public=1`,{method:"POST",body:png});
  const document=await send(`/api/office/properties/${id}/files?label=private&public=0`,{method:"POST",body:pdf});
  assert.equal(photo.status,201);assert.equal(document.status,201);
  const photoId=(await photo.json()).id;const docId=(await document.json()).id;
  assert.equal((await send(`/listing-media/${photoId}`)).status,404);
  assert.equal((await send(`/api/office/files/${docId}`,{identity:staff})).status,403);
  const promoted={...propertyDraft,price:2100000,changeReason:"אישור מחיר לקוח בבדיקת דמה",status:"active",verified:true,approved:true,distinctProperty:true,version:1};
  assert.equal((await send(`/api/office/properties/${id}`,{method:"PUT",data:promoted})).status,200);
  assert.equal((await send(`/api/office/properties/${id}`,{method:"PUT",data:promoted})).status,409);
  DB.close();DB=localDatabase(filename);env.DB=DB;
  const detail=await (await send(`/api/office/properties/${id}`)).json();
  assert.equal(detail.property.price,2100000);
  assert.deepEqual(detail.prices.map(x=>x.price),[2100000,2000000]);
  const catalog=await (await send("/api/catalog")).json();
  assert.equal(catalog.properties.length,1);
  assert.equal(catalog.properties[0].image,`/listing-media/${photoId}`);
  const serialized=JSON.stringify(catalog);
  assert.doesNotMatch(serialized,/כתובת פרטית|בעל נכס פרטי|הערות פנימיות|0501234567/);
  const branded=await send(`/listing-media/${photoId}`);
  assert.match(branded.headers.get("content-type"),/image\/svg\+xml/);
  assert.match(await branded.text(),/data:image\/webp;base64,/);
  const original=await send(`/api/office/files/${photoId}`);
  assert.equal(original.headers.get("content-type"),"image/png");
  assert.deepEqual(new Uint8Array(await original.arrayBuffer()),png);
  assert.equal((await send(`/listing-media/${docId}`)).status,404);
  const html=await (await send(`/listing/${id}`)).text();
  assert.match(html,/&lt;script&gt;alert/);assert.doesNotMatch(html,/<script>alert/);
  assert.ok(html.includes("נכס בדיקה &lt;משרד&gt; $&amp;"));
  assert.match(html,/36 החודשים האחרונים/);
  assert.doesNotMatch(html,/כתובת פרטית|הערות פנימיות/);
  const exported=await (await send("/api/office/export")).json();
  assert.equal(exported.properties.length,1);assert.equal(exported.media.length,2);
  assert.equal((await send(`/api/office/properties/${id}`,{method:"PUT",data:{...promoted,status:"archived",version:2}})).status,200);
  assert.equal((await send(`/listing/${id}`)).status,404);
  assert.equal((await send(`/listing-media/${photoId}`)).status,404);
  assert.equal((await send(`/api/office/files/${docId}`)).status,200);
});
test("inquiries, contact deduplication, matching, tours and marketing approval",async t=>{
  const DB=localDatabase();t.after(()=>DB.close());
  const send=client({DB,BUCKET:localBucket(),OFFICE_OWNER_EMAIL:actorEmail});
  const propertyId=(await (await send("/api/office/properties",{method:"POST",data:{...propertyDraft,status:"active",verified:true,approved:true,distinctProperty:true}})).json()).id;
  const requestId=crypto.randomUUID();
  const inquiry={...validLead,requestId,propertyId,source:"facebook"};
  assert.equal((await send("/api/inquiries",{method:"POST",data:{...inquiry,consent:false}})).status,400);
  assert.equal((await send("/api/inquiries",{method:"POST",data:inquiry})).status,201);
  assert.equal((await send("/api/inquiries",{method:"POST",data:inquiry})).status,201);
  assert.equal((await send("/api/office/leads",{method:"POST",data:{...validLead,phone:"+972500000000"}})).status,201);
  const dashboard=await (await send("/api/office/state")).json();
  assert.equal(dashboard.stats.newLeads,2);
  assert.equal(dashboard.leads[0].contact_id,dashboard.leads[1].contact_id);
  const lead=dashboard.leads.find(l=>l.id===requestId);
  assert.equal(lead.property_id,propertyId);assert.equal(lead.source,"אתר · Facebook");
  assert.ok(lead.consent_at);assert.ok(matchProperty(lead,dashboard.properties[0]).score>0);
  assert.equal(matchProperty({...lead,profile:{...lead.profile,budget:1}},dashboard.properties[0]),null);
  const editLead={...lead.profile,stage:"tour",assignedTo:"סוכן",version:lead.version};
  assert.equal((await send(`/api/office/leads/${lead.id}`,{method:"PUT",data:editLead})).status,200);
  const work={title:"סיור בדיקה",kind:"tour",assignedTo:"סוכן",propertyId,leadId:lead.id,startsAt:"2027-01-01T10:00:00Z",endsAt:"2027-01-01T11:00:00Z"};
  assert.equal((await send("/api/office/work",{method:"POST",data:work})).status,201);
  assert.equal((await send("/api/office/work",{method:"POST",data:{...work,startsAt:"2027-01-01T10:15:00Z"}})).status,409);
  assert.equal((await send("/api/office/work",{method:"POST",data:{...work,startsAt:"2027-01-01T11:00:00Z",endsAt:"2027-01-01T12:00:00Z"}})).status,201);
  const marketing=`/api/office/properties/${propertyId}/marketing`;
  const copy=await (await send(marketing,{method:"POST",data:{channel:"facebook",preview:true}})).json();
  assert.match(copy.body,/utm_source=facebook/);
  assert.doesNotMatch(copy.body,/כתובת פרטית|הערות פנימיות/);
  assert.equal((await send(marketing,{method:"POST",data:{...copy,channel:"facebook",status:"published"}})).status,400);
  assert.equal((await send(marketing,{method:"POST",data:{...copy,channel:"facebook",status:"approved"}})).status,200);
  const property=await (await send(`/api/office/properties/${propertyId}`)).json();
  assert.equal(property.drafts[0].status,"approved");
  assert.equal(property.property.title,propertyDraft.title);
});

test("dated and sourced comparisons, publication, duplicate prevention and archive",async t=>{
  const DB=localDatabase();t.after(()=>DB.close());
  const send=client({DB,BUCKET:localBucket(),OFFICE_OWNER_EMAIL:actorEmail});
  const p={...propertyDraft,verified:true,approved:true,distinctProperty:true,status:"active"};
  const id=(await (await send("/api/office/properties",{method:"POST",data:p})).json()).id;
  const path=`/api/office/properties/${id}/comparables`;
  const record={dealDate:new Date().toISOString().slice(0,10),price:2050000,area:100,rooms:4,areaLabel:"שכונת בדיקה",
    sourceUrl:"https://example.invalid/transaction",sourceRef:"REF-TEST-01",verified:true,requestId:crypto.randomUUID()};
  for (const invalid of [{verified:false},{dealDate:"2010-01-01"},{dealDate:"2099-01-01"},{sourceUrl:"javascript:alert(1)"},{sourceRef:""}]) {
    assert.equal((await send(path,{method:"POST",data:{...record,...invalid}})).status,400);
  }
  assert.equal((await send(path,{method:"POST",data:record,identity:staff})).status,403);
  assert.equal((await send(path,{method:"POST",data:record})).status,201);
  assert.equal((await send(path,{method:"POST",data:record})).status,201);
  assert.equal((await send(path,{method:"POST",data:{...record,requestId:crypto.randomUUID()}})).status,409);
  const detail=await (await send(`/listing/${id}`)).text();
  assert.match(detail,/REF-TEST-01/);
  assert.match(detail,/20,500 ₪ למ״ר/);
  assert.match(detail,/https:\/\/example\.invalid\/transaction/);
  const exportData=await (await send("/api/office/export")).json();
  assert.equal(exportData.comparables.length,1);
  assert.equal((await send(path,{method:"PUT",data:{id:record.requestId}})).status,200);
  assert.doesNotMatch(await (await send(`/listing/${id}`)).text(),/REF-TEST-01/);
  const officeProperty=await (await send(`/api/office/properties/${id}`)).json();
  assert.ok(officeProperty.comparables[0].archived_at);
});

test("multi-property visit forms, encrypted records, signed copies and fee revisions",async t=>{
  const DB=localDatabase();t.after(()=>DB.close());
  const env={DB,BUCKET:localBucket(),OFFICE_OWNER_EMAIL:actorEmail,VISIT_ENCRYPTION_KEY:"42".repeat(32),BROKERAGE_SIGNING_APPROVED:"1"};
  const send=client(env);
  const customerIdentity={"oai-authenticated-user-id":"customer-local","oai-authenticated-user-email":"customer@example.invalid"};
  const stranger={"oai-authenticated-user-id":"stranger-local","oai-authenticated-user-email":"stranger@example.invalid"};
  const config={name:"מתווך בדיקה",identity:"000000026",license:"LOCAL-TEST",phone:"0500000000",address:"כתובת מתווך לבדיקה",fees:{
    sale:{mode:"percent",amount:2,vat:"plus"},rent:{mode:"fixed",amount:4000,vat:"included"},
  }};
  const makeProperty=async extra=>{
    const result=await send("/api/office/properties",{method:"POST",data:{...propertyDraft,verified:true,approved:true,distinctProperty:true,status:"active",...extra}});
    assert.equal(result.status,201);
    return (await result.json()).id;
  };
  const visit="/api/visits/";
  const office="/api/office/";
  const quote=async (properties,identity=customerIdentity)=>send(visit+"quote",{method:"POST",data:{properties,day:"2099-01-01",window:"morning"},identity});
  const draft=(await (await quote(["gedera-01","gedera-02"])).json());
  assert.equal(draft.terms.example,true);
  assert.equal(draft.terms.properties.length,2);
  assert.equal(draft.ticket,undefined);
  assert.equal((await quote(["gedera-01","gedera-01"])).status,400);
  assert.equal((await quote(["gedera-01"],{})).status,403);
  assert.equal((await send(office+"visit-settings",{method:"PUT",data:config,identity:customerIdentity})).status,403);
  assert.deepEqual(await (await send(visit+"options",{identity:customerIdentity})).json(),{configured:false,deals:[],signingApproved:true});
  const sale=await makeProperty({title:"נכס מכירה לחתימה",agreementAddress:"כתובת המיועדת לטופס בלבד"});
  const rental=await makeProperty({title:"נכס השכרה לחתימה",deal:"rent",price:5100,agreementAddress:"מזהה הנכס להשכרה"});
  const missing=await makeProperty({title:"נכס ללא מזהה טופס"});
  assert.equal((await quote([sale])).status,409);
  assert.equal((await quote([sale,"gedera-01"])).status,400);
  assert.equal((await send(office+"visit-settings",{method:"PUT",data:config})).status,200);
  assert.equal((await quote([sale,missing])).status,409);
  assert.doesNotMatch(await (await send("/api/catalog")).text(),/כתובת המיועדת לטופס בלבד/);
  const initialQuote=await (await quote([sale,rental])).json();
  assert.deepEqual(initialQuote.terms.properties.map(p=>[p.deal,p.price,p.fee.amount]),[["sale",2000000,2],["rent",5100,4000]]);
  const changed={...config,fees:{...config.fees,sale:{...config.fees.sale,amount:2.5}}};
  assert.equal((await send(office+"visit-settings",{method:"PUT",data:changed})).status,200);
  const details={ticket:initialQuote.ticket,firstName:"לקוח",lastName:"בדיקה",identity:"000000018",address:"כתובת לקוח סודית <נסתר>",phone:"0500000001",
    signature:"לקוח בדיקה",accepted:true,privacy:true};
  const sign=async (extra={},identity=customerIdentity,from=origin)=>send(visit+"sign",{method:"POST",data:{...details,...extra},identity,from});
  assert.equal((await sign()).status,409);
  details.ticket=(await (await quote([sale,rental])).json()).ticket;
  assert.equal((await sign({},stranger)).status,403);
  assert.equal((await sign({},customerIdentity,"https://outside.example")).status,403);
  assert.equal((await sign({ticket:"altered"})).status,400);
  assert.equal((await sign({identity:"000000001"})).status,400);
  assert.equal((await sign({accepted:false})).status,400);
  assert.equal((await sign({signature:"שם אחר"})).status,400);
  const signed=await sign();
  assert.equal(signed.status,201);
  const {id}=await signed.json();
  assert.deepEqual(await (await sign()).json(),{id});
  const copy="/visit/copy/";
  assert.equal((await send(copy+id,{identity:{}})).status,403);
  assert.equal((await send(copy+id,{identity:stranger})).status,404);
  const pdfPath=copy+id+"?format=pdf";
  assert.equal((await send(pdfPath,{identity:stranger})).status,404);
  const signedPdf=await send(pdfPath,{identity:customerIdentity});
  assert.equal(signedPdf.status,200);
  assert.equal(signedPdf.headers.get("content-type"),"application/pdf");
  assert.match(signedPdf.headers.get("cache-control"),/no-store/);
  assert.equal(new TextDecoder().decode((await signedPdf.arrayBuffer()).slice(0,5)),"%PDF-");
  const initialCopy=await send(copy+id,{identity:customerIdentity});
  assert.match(initialCopy.headers.get("cache-control"),/no-store/);
  const initialHtml=await initialCopy.text();
  assert.match(initialHtml,/000000018/);
  assert.match(initialHtml,/כתובת לקוח סודית &lt;נסתר&gt;/);
  assert.match(initialHtml,/נכס השכרה לחתימה/);
  assert.match(initialHtml,/2.5%/);
  assert.match(initialHtml,/כולל מע״מ/);
  assert.doesNotMatch(DB.prepare("SELECT body FROM office_visit_forms WHERE id=?").bind(id).first().body,/000000018|לקוח סודית/);
  const summary=await (await send(office+"state")).json();
  assert.equal(summary.leads.length,1);
  assert.equal(summary.leads[0].has_visit_form,1);
  assert.doesNotMatch(await (await send(office+"export")).text(),/000000018|כתובת לקוח סודית/);
  const officeForm=office+"visit-forms/"+id;
  assert.equal((await send(officeForm,{identity:customerIdentity})).status,403);
  const visitForm=await (await send(officeForm)).json();
  assert.equal(visitForm.properties.length,2);
  assert.deepEqual(visitForm.preferred,{day:"2099-01-01",window:"morning"});
  const proposedFees={[sale]:{mode:"percent",amount:1.25,vat:"included"},[rental]:config.fees.rent};
  assert.equal((await send(officeForm,{method:"POST",data:{base:id,fees:proposedFees}})).status,400);
  const brokerApproval={brokerSignature:config.name,brokerAccepted:true};
  const proposed=await send(officeForm,{method:"POST",data:{base:id,fees:proposedFees,...brokerApproval}});
  assert.equal(proposed.status,201,await proposed.clone().text());
  const proposal=(await proposed.json()).id;
  assert.equal((await send(copy+proposal,{identity:customerIdentity})).status,404);
  assert.equal((await send(visit+"amend/"+proposal,{identity:stranger})).status,404);
  const revised=await (await send(visit+"amend/"+proposal,{identity:customerIdentity})).json();
  assert.equal(revised.oldFees[sale].amount,2.5);
  assert.equal(revised.brokerAcceptance.name,config.name);
  assert.equal(revised.terms.properties[0].fee.amount,1.25);
  assert.equal((await send(visit+"amend/"+proposal,{method:"POST",identity:customerIdentity,data:details})).status,200);
  assert.match(await (await send(copy+proposal,{identity:customerIdentity})).text(),/1.25%/);
  assert.equal(await (await send(copy+id)).text(),initialHtml);
  const latest=(await (await send(officeForm)).json());
  assert.equal(latest.history[0].status,"signed");
  assert.equal(latest.history[1].status,"signed");
  assert.equal((await send(officeForm,{method:"POST",data:{base:id,fees:proposedFees}})).status,409);
  const withdrawn=(await (await send(officeForm,{method:"POST",data:{base:proposal,fees:{...proposedFees,[sale]:config.fees.sale},...brokerApproval}})).json()).id;
  assert.ok(withdrawn);
  assert.equal((await send(officeForm,{method:"POST",data:{base:proposal,action:"withdraw",id:withdrawn}})).status,200);
  assert.equal((await send(visit+"amend/"+withdrawn,{method:"POST",identity:customerIdentity,data:details})).status,409);
});

test("authorized prospect intake, owner verification, deduplication, opt-out and reporting",async t=>{
  const DB=localDatabase();t.after(()=>DB.close());
  const send=client({DB,BUCKET:localBucket(),OFFICE_OWNER_EMAIL:actorEmail});
  const path="/api/office/prospects";
  const payload={town:"גדרה",address:"כתובת בדיקה יחידה 5",deal:"sale",kind:"דירה",price:2250000,rooms:4,area:105,
    name:"בעלים לדוגמה",phone:"0500000000",classification:"verified",evidence:"נבדק מול בעל הנכס בבדיקת דמה",stage:"new",
    sourceName:"מקור בדיקה",sourceUrl:"https://example.invalid/listing?id=73&utm_medium=test",sourceAllowed:true};
  assert.equal((await send(path,{identity:staff})).status,403);
  assert.equal((await send(path,{method:"POST",data:{...payload,sourceAllowed:false}})).status,400);
  assert.equal((await send(path,{method:"POST",data:{...payload,evidence:""}})).status,400);
  const created=await send(path,{method:"POST",data:payload});
  assert.equal(created.status,201,await created.clone().text());
  const {id}=await created.json();
  for(const sourceUrl of ["https://example.invalid/listing?id=73","https://example.invalid/another-source"]){
    const duplicate=await send(path,{method:"POST",data:{...payload,sourceUrl}});
    assert.equal(duplicate.status,200);
    assert.equal((await duplicate.json()).id,id);
  }
  const {items}=await (await send(path)).json();
  assert.equal(items.length,1);
  assert.equal(items[0].sources.length,2);
  assert.equal((await (await send("/api/office/state")).json()).work[0].id,id);
  assert.equal((await send(path+"/"+id+"/draft")).status,409);
  const broker=await send(path,{method:"POST",data:{...payload,address:"כתובת אחרת",classification:"broker",sourceUrl:"https://example.invalid/broker"}});
  assert.equal(broker.status,201);
  const report=await (await send(path+"/report")).json();
  assert.equal(report.total,1);
  assert.equal(report.delivery,"not-connected");
  assert.doesNotMatch(report.message,/0500000000|example.invalid\/broker/);
  const permission="הסכמה מתועדת בבדיקת דמה";
  assert.equal((await send(path+"/"+id,{method:"PUT",data:{...payload,permission,version:1}})).status,200);
  const draft=await (await send(path+"/"+id+"/draft")).json();
  assert.match(draft.message,/052-7504037/);
  assert.equal(draft.status,"draft");
  assert.equal((await send(path+"/"+id,{method:"PUT",data:{...payload,permission,stage:"optout",version:2}})).status,200);
  assert.equal((await send(path+"/"+id+"/draft")).status,409);
});

test("office routing, property approval, deal accounting, draft PDFs and snapshot permissions",async t=>{
  const DB=localDatabase();t.after(()=>DB.close());
  const env={DB,BUCKET:localBucket(),OFFICE_OWNER_EMAIL:actorEmail,VISIT_ENCRYPTION_KEY:"42".repeat(32)};
  const send=client(env);
  const route="/api/office/properties";
  const draft={...propertyDraft,address:"כתובת מובחנת לבדיקה יחידה 1",agent:"שרל"};
  assert.equal((await send(route,{method:"POST",data:{...draft,status:"active",verified:true}})).status,400);
  const {id}=await (await send(route,{method:"POST",data:draft})).json();
  assert.ok(id);
  assert.equal((await send(route,{method:"POST",data:draft})).status,409);
  const version2={...draft,price:2100000,version:1,verified:true,status:"active",approved:true,changeReason:"אישור בעלים בבדיקה"};
  assert.equal((await send(route+"/"+id,{method:"PUT",data:{...version2,approved:false}})).status,400);
  assert.equal((await send(route+"/"+id,{method:"PUT",data:version2})).status,200);
  const history=await (await send(route+"/"+id+"/history")).json();
  assert.equal(history.events[0].reason,"אישור בעלים בבדיקה");
  assert.equal(history.events[0].old_price,draft.price);
  assert.equal(history.events[0].new_price,2100000);
  const initial=await (await send("/api/inquiries",{method:"POST",data:{...validLead,intent:"visit",propertyId:id,propertyIds:[id]}})).json();
  const repeat=await (await send("/api/inquiries",{method:"POST",data:{...validLead,phone:"+972500000000",intent:"general"}})).json();
  const office=await (await send("/api/office/state")).json();
  assert.deepEqual(office.leads.filter(l=>[initial.id,repeat.id].includes(l.id)).map(l=>l.assigned_to),["שרל","שרל"]);
  const activity="/api/office/leads/"+repeat.id+"/activity";
  assert.equal((await send(activity,{identity:staff})).status,403);
  assert.equal((await send(activity,{method:"POST",data:{note:"סיכום שיחה לדוגמה"}})).status,200);
  const timeline=await (await send("/api/office/leads/"+initial.id+"/activity")).json();
  assert.equal(timeline.leads.length,2);
  assert.ok(timeline.events.some(e=>e.summary==="סיכום שיחה לדוגמה"));
  const deals="/api/office/deals";
  const sale={propertyId:id,leadId:initial.id,stage:"closed",price:2080000,commission:25000,paid:10000.50,expenses:450.25,
    allocations:[{name:"רועי",amount:16000},{name:"שרל",amount:9000}]};
  assert.equal((await send(deals,{method:"POST",data:{...sale,paid:26000}})).status,400);
  assert.equal((await send(deals,{method:"POST",data:{...sale,allocations:[{name:"רועי",amount:5}]}})).status,400);
  const savedSale=await send(deals,{method:"POST",data:sale});
  assert.equal(savedSale.status,201);
  const saleId=(await savedSale.json()).id;
  const ledger=await (await send(deals)).json();
  assert.deepEqual(ledger.totals,{count:1,commission:2500000,paid:1000050,expenses:45025,outstanding:1499950});
  assert.equal((await send(deals+"/"+saleId,{method:"PUT",data:{...sale,version:1,commission:20000,allocations:[]}})).status,400);
  assert.equal((await send("/api/visits/sign",{method:"POST",data:{}})).status,409);
  const ownerDraftPath=route+"/"+id+"/owner-drafts";
  const draftData={address:"רחוב להמחשה 18",orderText:"נוסח לבדיקה בלבד",exclusiveText:"בלעדיות לעיון עורך דין",marketingText:"צילום ושיווק לאחר אישור",end:"2027-01-12"};
  const response=await send(ownerDraftPath,{method:"POST",data:draftData});
  assert.equal(response.status,200,await response.clone().text());
  const [doc]=(await response.json()).drafts;
  assert.equal(doc.exclusive,true);
  for(const kind of ["order","exclusive","marketing"]){
    const path="/api/office/owner-drafts/"+doc.serial+"/"+kind;
    assert.equal((await send(path,{identity:staff})).status,403);
    const pdf=await send(path);
    assert.equal(pdf.headers.get("content-type"),"application/pdf");
    const bytes=await pdf.arrayBuffer();
    assert.equal(new TextDecoder().decode(bytes.slice(0,5)),"%PDF-");
    const tagged=await PDFDocument.load(bytes);
    assert.equal(tagged.catalog.lookup(PDFName.of("Lang"),PDFHexString).decodeText(),"he-IL");
    assert.ok(tagged.catalog.has(PDFName.of("StructTreeRoot")));
    assert.ok(tagged.getPages().every(page=>page.node.has(PDFName.of("StructParents"))));
    const html=await send(path+"?format=html");
    assert.match(html.headers.get("content-type"),/text\/html/);
    assert.match(await html.text(),/<h1>טיוטת/);
    assert.equal((await send(path+"?format=html",{identity:staff})).status,403);
  }
  assert.equal((await send("/api/office/backup",{identity:staff})).status,403);
  const backup=await (await send("/api/office/backup")).json();
  assert.equal(backup.tables.office_deals.length,1);
  assert.equal(backup.tables.office_document_refs.length,1);
  assert.doesNotMatch(backup.tables.office_document_refs[0].draft_body,/בלעדיות|להמחשה/);
});
