import {neighborhoodFor} from "../dist/seo-areas.mjs";
import {propertyStates, leadStates, intents, channels, featureNames, idPattern, supportedTypes, marketingCopy} from "./model.mjs";
import {makeVisits} from "./visits.mjs";
import {brandMediaResponse} from "./brand-media.mjs";
import {brandContacts,withBrandContacts} from "../dist/brand.mjs";
import {makeProspects} from "./prospects.mjs";
import {makeOfficeOperations,leadRoutingBatch} from "./office-operations.mjs";
import {ownerDrafts} from "./owner-drafts.mjs";
import {officeSnapshot} from "./office-backup.mjs";

const knownDemo = new Set(["gedera-01","gedera-02","yavne-01","bnei-ayish-01","mazkeret-01","kiryat-ekron-01"]);
const published = "('active','negotiation')";
const privateHeaders = {"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","X-Robots-Tag":"noindex, nofollow"};
const uploadMax = 6 * 1024 * 1024;
const currency = new Intl.NumberFormat("he-IL");
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const state = (set, value, name) => {
  if (typeof value!=="string" || !Object.hasOwn(set,value)) fail(400,`ערך לא תקין: ${name}.`);
  return value;
};
const statements = (db, sql, ...params) => db.prepare(sql).bind(...params);
const rows = async (db, sql, ...params) => (await statements(db,sql,...params).all()).results;
const first = (db, sql, ...params) => statements(db,sql,...params).first();
const json = (body, status=200) => new Response(JSON.stringify(body),{status,headers:{...privateHeaders,"Content-Type":"application/json; charset=utf-8"}});
class RequestError extends Error {
  constructor(status,message) { super(message); this.status=status; }
}
function fail(status,message) { throw new RequestError(status,message); }
function clean(value,max,required=false) {
  const text=typeof value==="string"?value.trim():"";
  if (text.length>max || required && !text) fail(400,"יש למלא את שדות החובה ולבדוק את אורך הערכים.");
  return text;
}
function numeric(value,max,required=false) {
  if (value==="" || value==null) {
    if (required) fail(400,"יש להזין מספר תקין.");
    return null;
  }
  if (typeof value!=="number" && typeof value!=="string") fail(400,"יש להזין מספר תקין.");
  const number=Number(value);
  if (!Number.isFinite(number) || number<0 || number>max) fail(400,"יש להזין מספר בטווח תקין.");
  return number;
}
function phoneNumber(value) {
  const raw=clean(value,30,true).replace(/[\s().-]/g,"").replace(/^\+972/,"0");
  if (!/^0[2-9]\d{7,8}$/.test(raw)) fail(400,"יש להזין מספר טלפון ישראלי תקין.");
  return raw;
}
function dateOrNull(value, type="day") {
  if (!value) return null;
  const date=String(value);
  const pattern=type==="day"?/^\d{4}-\d{2}-\d{2}$/:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
  const parsed=new Date(date);
  if (!pattern.test(date)||!Number.isFinite(+parsed)||(type==="day"&&parsed.toISOString().slice(0,10)!==date)) fail(400,"תאריך או שעה לא תקינים.");
  return type==="day"?date:parsed.toISOString();
}
function optionalId(value) {
  if (!value) return null;
  if (!idPattern.test(value)) fail(400,"מזהה לא תקין.");
  return value;
}
function revision(value) {
  if (!Number.isInteger(value) || value<1) fail(400,"גרסת הרשומה חסרה.");
  return value;
}
function officeActor(request,env) {
  if (!isOfficeActor(request,env)) fail(403,"אזור המשרד זמין לבעל האתר לאחר התחברות.");
  return request.headers.get("oai-authenticated-user-id");
}
function isOfficeActor(request,env) {
  const id=request.headers.get("oai-authenticated-user-id");
  const email=request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  return Boolean(id&&email&&email===env.OFFICE_OWNER_EMAIL?.trim().toLowerCase());
}
function trustedOrigin(request) {
  if (request.headers.get("origin")!==new URL(request.url).origin) fail(403,"מקור הבקשה לא אושר.");
}
async function readBytes(request,max) {
  const length=Number(request.headers.get("content-length"));
  if (length>max) fail(413,"הקובץ או הבקשה גדולים מהמותר.");
  if (!request.body) fail(400,"הבקשה ריקה.");
  const reader=request.body.getReader();
  let size=0;
  const chunks=[];
  for (;;) {
    const {done,value}=await reader.read();
    if (done) break;
    size+=value.byteLength;
    if (size>max) {
      await reader.cancel();
      fail(413,"הקובץ או הבקשה גדולים מהמותר.");
    }
    chunks.push(value);
  }
  const buffer=new Uint8Array(size);
  let offset=0;
  for (const part of chunks) {
    buffer.set(part,offset);
    offset+=part.byteLength;
  }
  return buffer;
}
async function payload(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type")??"")) fail(415,"פורמט בקשה לא נתמך.");
  const bytes=await readBytes(request,32000);
  let data;
  try { data=JSON.parse(new TextDecoder().decode(bytes)); } catch { fail(400,"נתוני הבקשה אינם תקינים."); }
  if (!data || typeof data!=="object" || Array.isArray(data)) fail(400,"נתוני הבקשה אינם תקינים.");
  return data;
}
const audit = (db,actor,action,id,at=now(),key=uid()) => statements(db,"INSERT OR IGNORE INTO office_audit (id,actor,action,entity_id,at) VALUES (?,?,?,?,?)",key,actor,action,id,at);
const privateProperty = p => ({...p,specs:JSON.parse(p.specs_json),internal:JSON.parse(p.internal_json),specs_json:undefined,internal_json:undefined});
const privateLead = l => ({...l,profile:JSON.parse(l.profile_json),profile_json:undefined});

const catalogSql = `SELECT p.id,p.title,p.town,p.neighborhood,p.deal,p.property_type,p.price,p.rooms,p.area,p.description,p.specs_json,p.status,p.published_at,
  (SELECT id FROM office_media m WHERE m.property_id=p.id AND m.public_photo=1 ORDER BY m.created_at,m.id LIMIT 1) AS cover,
  (SELECT label FROM office_media m WHERE m.property_id=p.id AND m.public_photo=1 ORDER BY m.created_at,m.id LIMIT 1) AS cover_label
  FROM office_properties p WHERE p.status IN ${published}`;
function publicProperty(row) {
  const specs=JSON.parse(row.specs_json);
  return {
    id:row.id, title:row.title, town:row.town, neighborhood:row.neighborhood, deal:row.deal, type:row.property_type,
    price:row.price, rooms:row.rooms, area:row.area, description:row.description, publishedAt:row.published_at,
    status:row.status, image:row.cover?`/listing-media/${row.cover}`:"", alt:row.cover?(row.cover_label||`תצלום: ${row.title}`):"",
    amenities:Object.entries(featureNames).filter(([key])=>specs[key]===true).map(([,label])=>label),
    floor:specs.floor??null, floorCount:specs.floorCount??null, additionalArea:specs.additionalArea??null, lotArea:specs.lotArea??null,
    availableOn:specs.availableOn??null, condition:specs.condition??"",
  };
}

function validateProperty(data) {
  const deal=state({sale:1,rent:1},data.deal,"סוג עסקה");
  const status=state(propertyStates,data.status??"draft","סטטוס");
  if ((status==="sold"&&deal!=="sale")||(status==="rented"&&deal!=="rent")) fail(400,"סטטוס הסגירה אינו תואם לסוג העסקה.");
  if (["active","negotiation"].includes(status) && data.verified!==true) fail(400,"יש לאמת את פרטי הנכס לפני הצגתו בקטלוג.");
  if (!supportedTypes.includes(data.type)) fail(400,"בחרו סוג נכס.");
  const price=numeric(data.price,1000000000,true);
  if (price<1 || !Number.isInteger(price)) fail(400,"יש להזין מחיר בשקלים שלמים.");
  const specs={
    floor:data.floor===""||data.floor==null?null:Number(data.floor),
    floorCount:numeric(data.floorCount,200),additionalArea:numeric(data.additionalArea,100000),lotArea:numeric(data.lotArea,10000000),
    condition:clean(data.condition,90),availableOn:dateOrNull(data.availableOn),
  };
  if (specs.floor!==null&&(!Number.isInteger(specs.floor)||specs.floor<-10||specs.floor>200)) fail(400,"הקומה אינה תקינה.");
  for (const key of Object.keys(featureNames)) specs[key]=data[key]===true?true:data[key]===false?false:null;
  const internal={
    address:clean(data.address,200),owner:clean(data.owner,100),
    agreementAddress:clean(data.agreementAddress,200),
    ownerPhone:data.ownerPhone?phoneNumber(data.ownerPhone):"",
    agent:clean(data.agent,100),notes:clean(data.notes,3500),
  };
  return {title:clean(data.title,130,true),town:clean(data.town,70,true),neighborhood:clean(data.neighborhood,95),deal,status,
    type:data.type,price,rooms:numeric(data.rooms,100),area:numeric(data.area,100000),
    description:clean(data.description,5000),specs,internal,verified:data.verified===true?1:0};
}

async function saveProperty(db,actor,data,id) {
  const p=validateProperty(data);
  const at=now();
  const attributes=[p.title,p.town,p.neighborhood,p.deal,p.type,p.price,p.rooms,p.area,p.description,JSON.stringify(p.specs),JSON.stringify(p.internal),p.status,p.verified];
  const show=["active","negotiation"].includes(p.status);
  if (!id) {
    if(show&&data.approved!==true) fail(400,"יש לאשר את הצגת הנכס בקטלוג.");
    const key=optionalId(data.requestId)??uid();
    const prior=await first(db,"SELECT id FROM office_properties WHERE id=?",key);
    if (prior) return json({id:key});
    if(p.internal.address&&data.distinctProperty!==true){
      const match=await first(db,`SELECT id FROM office_properties WHERE deal=? AND lower(trim(town))=lower(trim(?))
        AND lower(trim(json_extract(internal_json,'$.address')))=lower(trim(?)) LIMIT 1`,p.deal,p.town,p.internal.address);
      if(match) fail(409,"כבר יש נכס עם אותה כתובת וסוג עסקה. בדקו את הנכס הקיים או אשרו שמדובר בנכס נפרד.");
    }
    await db.batch([
      statements(db,"INSERT INTO office_properties (id,title,town,neighborhood,deal,property_type,price,rooms,area,description,specs_json,internal_json,status,verified,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",key,...attributes,show?at:null,at,at),
      statements(db,"INSERT OR IGNORE INTO property_prices (property_id,version,price,recorded_at) VALUES (?,1,?,?)",key,p.price,at),
      statements(db,"INSERT OR IGNORE INTO office_property_changes VALUES (?,1,NULL,?,NULL,?,?,?,?)",key,p.status,p.price,"קליטה במשרד",actor,at),
      audit(db,actor,"property.created",key,at,"property:created:"+key),
    ]);
    return json({id:key},201);
  }
  const old=await first(db,"SELECT price,status,version,published_at FROM office_properties WHERE id=?",id);
  if (!old) fail(404,"הנכס לא נמצא.");
  const version=revision(data.version);
  if (version!==old.version) fail(409,"הנכס עודכן במקום אחר. רעננו ונסו שוב.");
  const priceChanged=p.price!==old.price;
  const reason=priceChanged?clean(data.changeReason,400,true):clean(data.changeReason,400);
  if(priceChanged&&data.approved!==true) fail(400,"שינוי מחיר דורש אישור ותיעוד מקור.");
  if(show&&!["active","negotiation"].includes(old.status)&&data.approved!==true) fail(400,"יש לאשר את מעבר הנכס לקטלוג.");
  const batch=[statements(db,`UPDATE office_properties SET title=?,town=?,neighborhood=?,deal=?,property_type=?,price=?,rooms=?,area=?,description=?,specs_json=?,internal_json=?,status=?,verified=?,published_at=?,updated_at=?,version=version+1 WHERE id=? AND version=?`,...attributes,old.published_at??(show?at:null),at,id,version)];
  if (priceChanged) batch.push(statements(db,"INSERT INTO property_prices SELECT id,version,price,? FROM office_properties WHERE id=? AND version=? AND updated_at=?",at,id,version+1,at));
  if(priceChanged||p.status!==old.status) batch.push(statements(db,`INSERT INTO office_property_changes
    SELECT id,version,?,status,?,price,?,?,? FROM office_properties WHERE id=? AND version=? AND updated_at=?`,
    old.status,old.price,reason||"עדכון סטטוס במשרד",actor,at,id,version+1,at));
  batch.push(statements(db,"INSERT INTO office_audit SELECT ?,?,?,id,? FROM office_properties WHERE id=? AND version=? AND updated_at=?",uid(),actor,"property.updated",at,id,version+1,at));
  const [result]=await db.batch(batch);
  if (result.meta.changes!==1) fail(409,"הנכס עודכן במקום אחר. רעננו ונסו שוב.");
  return json({id});
}

function leadProfile(data) {
  const features=Array.isArray(data.features)?data.features.filter(key=>Object.hasOwn(featureNames,key)):[];
  return {town:clean(data.town,70),budget:numeric(data.budget,1000000000),rooms:numeric(data.rooms,100),area:numeric(data.area,100000),
    moveIn:dateOrNull(data.moveIn),propertyType:clean(data.type,60),features:[...new Set(features)],message:clean(data.message,1700)};
}
function leadInsert(db,actor,{key,name,phone,email,property,intent,source,profile,assigned,consent,at}) {
  return [
    statements(db,"INSERT INTO office_contacts (id,name,phone,email,created_at) SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM office_leads WHERE id=?) ON CONFLICT(phone) DO NOTHING",uid(),name,phone,email,at,key),
    statements(db,"INSERT INTO office_leads (id,contact_id,property_id,intent,source,profile_json,assigned_to,consent_at,created_at,updated_at) SELECT ?,id,?,?,?,?,?,?,?,? FROM office_contacts WHERE phone=? ON CONFLICT(id) DO NOTHING",key,property,intent,source,profile,assigned,consent,at,at,phone),
    audit(db,actor,"lead.created",key,at,`lead:${key}`),
    ...leadRoutingBatch(db,statements,key,actor,at),
  ];
}
async function createLead(db,actor,data,fromSite) {
  if (fromSite&&data.consent!==true) fail(400,"יש לאשר שימוש בפרטים לצורך חזרה לפנייה.");
  const phone=phoneNumber(data.phone);
  const name=clean(data.name,80,true);
  if (name.length<2) fail(400,"יש להזין שם מלא.");
  const email=clean(data.email,180);
  if (email&&!/^\S+@\S+\.\S+$/.test(email)) fail(400,"כתובת הדוא״ל אינה תקינה.");
  const intent=state(intents,data.intent??"general","סוג פנייה");
  const property=data.propertyId||null;
  if (property&&!knownDemo.has(property)) {
    optionalId(property);
    const p=await first(db,`SELECT id FROM office_properties WHERE id=? ${fromSite?`AND status IN ${published}`:""}`,property);
    if (!p) fail(404,"הנכס לא זמין לפנייה.");
  }
  const profile=leadProfile(data);
  if(data.propertyIds!==undefined){
    if(intent!=="visit"||!Array.isArray(data.propertyIds)||data.propertyIds.length<1||data.propertyIds.length>10||
      new Set(data.propertyIds).size!==data.propertyIds.length||data.propertyIds[0]!==property) fail(400,"רשימת הנכסים אינה תקינה.");
    for(const id of data.propertyIds){
      if(!optionalId(id)||!await first(db,`SELECT id FROM office_properties WHERE id=? AND status IN ${published}`,id)) fail(404,"אחד הנכסים אינו זמין לסיור.");
    }
    profile.selectedProperties=data.propertyIds;
    profile.visitDay=dateOrNull(data.visitDay);
    profile.visitWindow=state({"":1,morning:1,afternoon:1,evening:1},data.visitWindow??"","חלון שעות לסיור");
  }
  if (intent==="access") {
    if(!profile.message) fail(400,"יש לתאר את בעיית הנגישות.");
    profile.accessPage=clean(data.accessPage,250);
  }
  const key=optionalId(data.requestId)??uid();
  const source=fromSite?(Object.hasOwn(channels,data.source)&&data.source!=="site"?`אתר · ${channels[data.source]}`:"אתר"):clean(data.source,55)||"הזנה משרדית";
  const at=now();
  const batch=leadInsert(db,actor,{key,name,phone,email,property,intent,source,profile:JSON.stringify(profile),
    assigned:fromSite?"":clean(data.assignedTo,100),consent:fromSite?at:null,at});
  if(intent==="access") batch.push(
    statements(db,`INSERT OR IGNORE INTO office_work (id,title,kind,status,lead_id,assigned_to,notes,created_at,updated_at)
      SELECT id,?,'task','open',id,assigned_to,?,?,? FROM office_leads WHERE id=? AND intent='access'`,
      "בדיקת דיווח נגישות",[profile.accessPage&&`עמוד: ${profile.accessPage}`,profile.message].filter(Boolean).join("\n"),at,at,key),
    statements(db,`INSERT OR IGNORE INTO office_audit (id,actor,action,entity_id,at)
      SELECT ?,?,'access.reported',id,? FROM office_work WHERE id=? AND lead_id=?`,`access:${key}`,actor,at,key,key),
  );
  await db.batch(batch);
  return json({id:key},201);
}
async function updateLead(db,actor,data,id) {
  const old=await first(db,"SELECT version,stage,assigned_to,profile_json FROM office_leads WHERE id=?",id);
  if (!old) fail(404,"הפנייה לא נמצאה.");
  const version=revision(data.version);
  const at=now();
  const stage=state(leadStates,data.stage,"סטטוס ליד");
  const assignee=clean(data.assignedTo,100);
  const profile={...JSON.parse(old.profile_json),...leadProfile(data)};
  const [result]=await db.batch([
    statements(db,"UPDATE office_leads SET stage=?,profile_json=?,assigned_to=?,updated_at=?,version=version+1 WHERE id=? AND version=?",stage,JSON.stringify(profile),assignee,at,id,version),
    statements(db,"INSERT INTO office_audit SELECT ?,?,?,id,? FROM office_leads WHERE id=? AND version=? AND updated_at=?",uid(),actor,"lead.updated",at,id,version+1,at),
    ...((stage!==old.stage||assignee!==old.assigned_to)?[statements(db,`INSERT INTO office_lead_events
      SELECT ?,id,'update',?,?,? FROM office_leads WHERE id=? AND version=? AND updated_at=?`,
      uid(),`שלב: ${leadStates[old.stage]} ← ${leadStates[stage]} · אחראי: ${old.assigned_to||"לא משויך"} ← ${assignee||"לא משויך"}`,actor,at,id,version+1,at)]:[]),
  ]);
  if (result.meta.changes!==1) fail(409,"הפנייה עודכנה במקום אחר. רעננו ונסו שוב.");
  return json({id});
}

async function saveWork(db,actor,data,id) {
  const title=clean(data.title,150,true);
  const kind=state({task:1,tour:1},data.kind,"סוג משימה");
  const status=state({open:1,done:1,cancelled:1},data.status??"open","מצב משימה");
  const property=optionalId(data.propertyId);
  const lead=optionalId(data.leadId);
  const assigned=clean(data.assignedTo,100);
  const start=dateOrNull(data.startsAt,"time");
  const end=dateOrNull(data.endsAt,"time");
  if (kind==="tour"&&(!start||!end||end<=start||!assigned||!property)) fail(400,"סיור דורש נכס, אחראי ושעות התחלה וסיום תקינות.");
  const at=now();
  const notes=clean(data.notes,1700);
  if (!id) {
    const key=optionalId(data.requestId)??uid();
    const batch=[
      statements(db,"INSERT INTO office_work (id,title,kind,status,property_id,lead_id,assigned_to,starts_at,ends_at,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",key,title,kind,status,property,lead,assigned,start,end,notes,at,at),
      audit(db,actor,"work.created",key,at),
    ];
    await db.batch(batch);
    return json({id:key},201);
  }
  const version=revision(data.version);
  const [result]=await db.batch([
    statements(db,"UPDATE office_work SET title=?,kind=?,status=?,property_id=?,lead_id=?,assigned_to=?,starts_at=?,ends_at=?,notes=?,updated_at=?,version=version+1 WHERE id=? AND version=?",title,kind,status,property,lead,assigned,start,end,notes,at,id,version),
    statements(db,"INSERT INTO office_audit SELECT ?,?,?,id,? FROM office_work WHERE id=? AND version=? AND updated_at=?",uid(),actor,"work.updated",at,id,version+1,at),
  ]);
  if (result.meta.changes!==1) fail(409,"המשימה עודכנה או אינה זמינה. רעננו ונסו שוב.");
  return json({id});
}

function kindOfFile(bytes) {
  const str=(from,to)=>String.fromCharCode(...bytes.slice(from,to));
  if (bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff) return "image/jpeg";
  if (bytes[0]===0x89&&str(1,8)==="PNG\r\n\x1a\n") return "image/png";
  if (str(0,4)==="RIFF"&&str(8,12)==="WEBP") return "image/webp";
  if (str(0,5)==="%PDF-") return "application/pdf";
  return null;
}
async function uploadFile(request,env,actor,propertyId,url) {
  const p=await first(env.DB,"SELECT id FROM office_properties WHERE id=?",propertyId);
  if (!p) fail(404,"הנכס לא נמצא.");
  const label=clean(url.searchParams.get("label"),120,true);
  const image=url.searchParams.get("public")==="1";
  const alreadyBranded=url.searchParams.get("branded")==="1";
  const bytes=await readBytes(request,uploadMax);
  const mime=kindOfFile(bytes);
  if (!mime || (image||alreadyBranded)&&!mime.startsWith("image/")) fail(415,"יש להעלות JPG, PNG, WebP או PDF. רק תמונות יכולות להופיע בקטלוג.");
  const id=uid();
  const key=`office/${propertyId}/${id}`;
  await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:mime}});
  const at=now();
  try {
    await env.DB.batch([
      statements(env.DB,"INSERT INTO office_media (id,property_id,object_key,label,mime,public_photo,created_at,already_branded) VALUES (?,?,?,?,?,?,?,?)",id,propertyId,key,label,mime,image?1:0,at,alreadyBranded?1:0),
      audit(env.DB,actor,"media.uploaded",id,at),
    ]);
  } catch(error) {
    await env.BUCKET.delete(key);
    throw error;
  }
  return json({id},201);
}
async function fileResponse(env,id,open,assets) {
  const clause=open?`AND m.public_photo=1 AND p.status IN ${published}`:"";
  const file=await first(env.DB,`SELECT m.* FROM office_media m JOIN office_properties p ON p.id=m.property_id WHERE m.id=? ${clause}`,id);
  if (!file) fail(404,"הקובץ לא נמצא.");
  const object=await env.BUCKET.get(file.object_key);
  if (!object) fail(404,"הקובץ לא נמצא.");
  if (open) return await brandMediaResponse(object,file,assets,privateHeaders);
  const extension={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","application/pdf":"pdf"}[file.mime];
  return new Response(object.body,{headers:{...privateHeaders,"Content-Type":file.mime,"Content-Disposition":open?"inline":`attachment; filename="shefa-${id}.${extension}"`}});
}
async function updatePhotoFlags(env,actor,id,data) {
  const file=await first(env.DB,"SELECT mime FROM office_media WHERE id=?",id);
  if(!file) fail(404,"הקובץ לא נמצא.");
  if(!file.mime.startsWith("image/")||typeof data.publicPhoto!=="boolean"||typeof data.alreadyBranded!=="boolean") fail(400,"יש לבחור הגדרות שימוש עבור תמונה.");
  const label=data.label===undefined?null:clean(data.label,120,true);
  await env.DB.batch([
    statements(env.DB,"UPDATE office_media SET public_photo=?,already_branded=?,label=COALESCE(?,label) WHERE id=?",data.publicPhoto?1:0,data.alreadyBranded?1:0,label,id),
    audit(env.DB,actor,"media.flags",id),
  ]);
  return json({id});
}

const leadSelect="SELECT l.*,c.name,c.phone,c.email,EXISTS(SELECT 1 FROM office_visit_forms v WHERE v.id=l.id) AS has_visit_form FROM office_leads l JOIN office_contacts c ON c.id=l.contact_id";
async function officeData(db,full=false) {
  const limit=full?"":" LIMIT 250";
  const [properties,leads,work,stats]=await Promise.all([
    rows(db,`SELECT * FROM office_properties ORDER BY updated_at DESC${limit}`),
    rows(db,`${leadSelect} ORDER BY l.updated_at DESC${limit}`),
    rows(db,`SELECT * FROM office_work ORDER BY updated_at DESC${limit}`),
    first(db,`SELECT
      (SELECT count(*) FROM office_properties WHERE status='active') active,
      (SELECT count(*) FROM office_properties WHERE status='active' AND deal='sale') activeSales,
      (SELECT count(*) FROM office_properties WHERE status='active' AND deal='rent') activeRentals,
      (SELECT count(*) FROM office_properties WHERE status='negotiation') negotiation,
      (SELECT count(*) FROM office_properties WHERE status IN ('sold','rented')) closedProperties,
      (SELECT count(*) FROM office_properties WHERE status='sold') sold,
      (SELECT count(*) FROM office_properties WHERE status='rented') rented,
      (SELECT count(*) FROM office_leads WHERE stage='new') newLeads,
      (SELECT count(*) FROM office_leads WHERE stage NOT IN ('closed','lost')) openLeads,
      (SELECT count(*) FROM office_prospects WHERE classification='verified') verifiedProspects,
      (SELECT count(*) FROM office_work WHERE status='open' AND kind='tour' AND starts_at>=?) upcomingTours,
      (SELECT count(*) FROM office_work WHERE status='open' AND kind='task') openTasks,
      (SELECT count(*) FROM office_work WHERE status='open' AND kind='task' AND starts_at<?) lateTasks`,now(),now()),
  ]);
  return {properties:properties.map(privateProperty),leads:leads.map(privateLead),work,stats};
}
async function saveMarketing(db,actor,data,id,origin) {
  const row=await first(db,"SELECT * FROM office_properties WHERE id=?",id);
  if (!row) fail(404,"הנכס לא נמצא.");
  const channel=state(channels,data.channel,"ערוץ");
  const source=privateProperty(row);
  const link=["active","negotiation"].includes(source.status)?`${origin}/listing/${id}?utm_source=${channel}&utm_medium=organic`:"";
  const copy=marketingCopy(source,channel,link);
  if (data.preview===true) return json(copy);
  const status=state({draft:1,approved:1},data.status,"מצב נוסח");
  const at=now();
  await db.batch([
    statements(db,"INSERT INTO office_marketing VALUES (?,?,?,?,?,?) ON CONFLICT(property_id,channel) DO UPDATE SET title=excluded.title,body=excluded.body,status=excluded.status,updated_at=excluded.updated_at",id,channel,clean(data.title,220,true),withBrandContacts(clean(data.body,10000,true)),status,at),
    audit(db,actor,"marketing.saved",id,at),
  ]);
  return json({id,channel,status});
}

const comparisonWindow = "deal_date BETWEEN ? AND ?";
function comparisonDates(at=now()) {
  const [year,month,day]=at.slice(0,10).split("-").map(Number);
  const lastDay=new Date(Date.UTC(year-3,month,0)).getUTCDate();
  const oldest=new Date(Date.UTC(year-3,month-1,Math.min(day,lastDay))).toISOString().slice(0,10);
  return [oldest,at.slice(0,10)];
}
async function saveComparable(db,actor,propertyId,data,method) {
  const property=await first(db,"SELECT id,deal FROM office_properties WHERE id=?",propertyId);
  if (!property) fail(404,"הנכס לא נמצא.");
  const at=now();
  if (method==="PUT") {
    const id=optionalId(data.id);
    const record=await first(db,"SELECT id,archived_at FROM office_comparables WHERE property_id=? AND id=?",propertyId,id);
    if (!record) fail(404,"העסקה לא נמצאה.");
    if (!record.archived_at) await db.batch([
      statements(db,"UPDATE office_comparables SET archived_at=? WHERE property_id=? AND id=? AND archived_at IS NULL",at,propertyId,id),
      audit(db,actor,"comparable.archived",id,at,`comparable:archive:${id}`),
    ]);
    return json({id});
  }
  if (data.verified!==true) fail(400,"יש לאשר בדיקה מול המקור לפני שמירת העסקה.");
  const dealDate=dateOrNull(data.dealDate);
  const [oldest,today]=comparisonDates(at);
  if (!dealDate||dealDate<oldest||dealDate>today) fail(400,"יש לבחור תאריך עסקה ב־36 החודשים האחרונים.");
  const price=numeric(data.price,1000000000,true);
  if (price<1||!Number.isInteger(price)) fail(400,"יש להזין מחיר בשקלים שלמים.");
  let source;
  const sourceInput=clean(data.sourceUrl,850,true);
  try {source=new URL(sourceInput);} catch {fail(400,"יש להזין קישור תקין למקור.");}
  if (source.protocol!=="https:"||source.username||source.password||!source.hostname.includes(".")) fail(400,"יש להזין קישור HTTPS למקור שאפשר לבדוק.");
  const id=optionalId(data.requestId)??uid();
  const [result]=await db.batch([
    statements(db,`INSERT OR IGNORE INTO office_comparables (id,property_id,deal,deal_date,price,area,rooms,area_label,source_url,source_ref,verified_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,id,propertyId,property.deal,dealDate,price,numeric(data.area,100000)||null,numeric(data.rooms,100)||null,
    clean(data.areaLabel,95),source.href,clean(data.sourceRef,160,true),at),
    statements(db,"INSERT OR IGNORE INTO office_audit SELECT ?,?,?,id,? FROM office_comparables WHERE id=? AND property_id=?",`comparable:create:${id}`,actor,"comparable.saved",at,id,propertyId),
  ]);
  if (!result.meta.changes&&!(await first(db,"SELECT id FROM office_comparables WHERE id=? AND property_id=?",id,propertyId))) {
    fail(409,"העסקה כבר משויכת לנכס. אפשר לארכב את הרשומה הקיימת לפני תיקון.");
  }
  return json({id},201);
}

function escaped(value) {
  return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
// Social preview (WhatsApp/Facebook) + Google structured data for a live listing.
function listingMeta(property,photoIds,url,canonical,title,price) {
  const description=escaped((property.description||property.title).replace(/\s+/g," ").slice(0,190));
  const image=photoIds[0]?`${url.origin}/listing-media/${photoIds[0].id}`:`${url.origin}/media/hero.webp`;
  const dealWord=property.deal==="rent"?"להשכרה":"למכירה";
  const data={"@context":"https://schema.org","@type":"RealEstateListing",name:property.title,url:`${url.origin}${url.pathname}`,
    description:property.description||property.title,datePosted:property.publishedAt||undefined,image:photoIds.slice(0,6).map(p=>`${url.origin}/listing-media/${p.id}`),
    offers:{"@type":"Offer",price:property.price,priceCurrency:"ILS",availability:property.status==="negotiation"?"https://schema.org/LimitedAvailability":"https://schema.org/InStock",
      businessFunction:property.deal==="rent"?"http://purl.org/goodrelations/v1#LeaseOut":"http://purl.org/goodrelations/v1#Sell"},
    about:{"@type":"Accommodation",numberOfRooms:property.rooms||undefined,floorSize:property.area?{"@type":"QuantitativeValue",value:property.area,unitCode:"MTK"}:undefined,
      address:{"@type":"PostalAddress",addressLocality:property.town,addressCountry:"IL"}},
    provider:{"@type":"RealEstateAgent",name:"שפע נדל״ן",url:url.origin}};
  return `<meta property="og:type" content="website">
  <meta property="og:site_name" content="שפע נדל״ן">
  <meta property="og:locale" content="he_IL">
  <meta property="og:title" content="${title} · ${escaped(dealWord)} ב${escaped(property.town)} · ${escaped(price)}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${escaped(image)}">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${JSON.stringify(data).replace(/</g,"\\u003c")}</script>
`;
}
async function listingPage(env,id,url,assets) {
  const row=await first(env.DB,`${catalogSql} AND p.id=?`,id);
  if (!row) return new Response("הנכס אינו זמין.",{status:404,headers:{...privateHeaders,"Content-Type":"text/plain; charset=utf-8"}});
  const property=publicProperty(row);
  const [photoIds,comparables,similarRows]=await Promise.all([
    rows(env.DB,"SELECT id,label FROM office_media WHERE property_id=? AND public_photo=1 ORDER BY created_at,id LIMIT 24",id),
    rows(env.DB,`SELECT deal_date,price,area,rooms,area_label,source_url,source_ref,verified_at FROM office_comparables
      WHERE property_id=? AND deal=? AND archived_at IS NULL AND ${comparisonWindow} ORDER BY deal_date DESC LIMIT 30`,id,property.deal,...comparisonDates()),
    rows(env.DB,`${catalogSql} AND p.id<>? ORDER BY (p.deal=?) DESC,(p.town=?) DESC,abs(p.price-?) LIMIT 3`,id,property.deal,property.town,property.price),
  ]);
  const icon=name=>`<svg class="icon" aria-hidden="true"><use href="#${name}"/></svg>`;
  const nis=value=>`${currency.format(value)} ₪`;
  const price=`${nis(property.price)}${property.deal==="rent"?" לחודש":""}`;
  const title=escaped(property.title);
  const place=escaped([property.town,property.neighborhood].filter(Boolean).join(" · "));
  const dealWord=property.deal==="rent"?"להשכרה":"למכירה";
  const alt=i=>escaped(`${property.title} - תמונה ${i+1} מתוך ${photoIds.length}`);
  const slides=photoIds.map(({id:photo},i)=>`<a class="gallery-slide" id="photo-${i+1}" href="/listing-media/${photo}" target="_blank" rel="noopener"><img src="/listing-media/${photo}" alt="${alt(i)}" ${i?'loading="lazy"':'fetchpriority="high"'} width="1200" height="800"></a>`).join("");
  const thumbs=photoIds.length>1?`<div class="gallery-thumbs" role="group" aria-label="בחירת תמונה">${photoIds.map(({id:photo},i)=>`<button type="button" data-slide="${i}" aria-label="תמונה ${i+1}"${i?"":' aria-current="true"'}><img src="/listing-media/${photo}" alt="" loading="lazy" width="120" height="80"></button>`).join("")}</div>`:"";
  const gallery=photoIds.length?`<section class="listing-gallery" aria-label="תמונות הנכס" data-gallery>
      <div class="gallery-main"><div class="gallery-track" tabindex="0">${slides}</div>
        ${photoIds.length>1?`<button type="button" class="gallery-nav prev" data-step="-1" aria-label="התמונה הקודמת">${icon("chevron")}</button><button type="button" class="gallery-nav next" data-step="1" aria-label="התמונה הבאה">${icon("chevron")}</button>`:""}
        <span class="gallery-count" aria-live="polite"><span data-current>1</span> / ${photoIds.length}</span></div>
      ${thumbs}</section>`
    :`<div class="listing-gallery empty">${icon("home")}<p>תמונות יעלו בקרוב · אפשר לבקש תמונות נוספות ב־WhatsApp</p></div>`;
  const floorText=property.floor===null?"":property.floor===0?"קרקע":`${property.floor}${property.floorCount?` מתוך ${property.floorCount}`:""}`;
  const keyFacts=[
    ["סוג נכס",property.type],["חדרים",property.rooms||""],[property.lotArea?"שטח בנוי":"שטח",property.area?`${currency.format(property.area)} מ״ר`:""],["שטח מגרש",property.lotArea&&property.type!=="מגרש"?`${currency.format(property.lotArea)} מ״ר`:""],
    ["קומה",floorText],["מצב",property.condition],
    ["מחיר למ״ר",property.deal==="sale"&&property.area&&!property.lotArea&&property.type!=="מגרש"?nis(Math.round(property.price/property.area)):""],
    ["כניסה",property.availableOn?property.availableOn.split("-").reverse().join("."):""],
  ].filter(([,v])=>v!==""&&v!=null);
  const factsHtml=`<dl class="key-facts">${keyFacts.map(([k,v])=>`<div><dt>${k}</dt><dd>${escaped(v)}</dd></div>`).join("")}</dl>`;
  const amenities=property.amenities.length?`<section class="listing-section" aria-labelledby="amenities-title"><h2 id="amenities-title">מה יש בנכס</h2>
      <ul class="feature-list">${property.amenities.map(f=>`<li>${icon("check")}${escaped(f)}</li>`).join("")}</ul></section>`:"";
  const calls=brandContacts.map(c=>`<a class="call-link" href="tel:${c.tel}">${icon("phone")}<span>${c.name}</span> <bdi>${c.display}</bdi></a>`).join("");
  const formatDay=iso=>iso.slice(0,10).split("-").reverse().join(".");
  const evidence=comparables.map(c=>`<article class="listing-comparison"><h3>${escaped(c.area_label||property.town)}</h3>
    <p><time datetime="${c.deal_date}">${formatDay(c.deal_date)}</time> · <bdi>${nis(c.price)}</bdi>${property.deal==="rent"?" לחודש":""}</p>
    <p>${[c.rooms&&`${c.rooms} חדרים`,c.area&&`${c.area} מ״ר`,c.area&&`${currency.format(Math.round(c.price/c.area))} ₪ למ״ר`].filter(Boolean).join(" · ")}</p>
    <p><a href="${escaped(c.source_url)}" referrerpolicy="no-referrer">מקור העסקה</a> · אסמכתה ${escaped(c.source_ref)} · נבדקה ב־${formatDay(c.verified_at)}</p></article>`).join("");
  const comparablesHtml=evidence?`<section class="listing-section" id="comparables" aria-labelledby="comparables-title">
      <h2 id="comparables-title">עסקאות ${property.deal==="rent"?"שכירות":"מכר"} דומות באזור</h2>
      <p>עסקאות מ־36 החודשים האחרונים, שנבדקו במשרד מול המקור.</p><div class="listing-comparables">${evidence}</div></section>`:"";
  const similar=similarRows.map(publicProperty);
  const similarHtml=similar.length?`<section class="listing-section similar" aria-labelledby="similar-title"><h2 id="similar-title">נכסים נוספים שיכולים לעניין אותך</h2>
      <div class="cards">${similar.map(p=>{
        const href=`/listing/${p.id}`;
        const facts=[p.rooms&&`${p.rooms} חד׳`,p.area&&`${currency.format(p.area)} מ״ר`,p.lotArea&&p.type!=="מגרש"&&`מגרש ${currency.format(p.lotArea)} מ״ר`].filter(Boolean);
        return `<article class="card listing-card"><div class="card-media">${p.image?`<img src="${p.image}" alt="${escaped(p.alt)}" loading="lazy" width="760" height="570">`:`<div class="card-no-photo">${icon("home")}<span>תמונות בקרוב</span></div>`}
          <div class="badges"><span class="tag tag-${p.deal}">${p.deal==="rent"?"להשכרה":"למכירה"}</span></div></div>
          <div class="card-body"><p class="price"><bdi>${nis(p.price)}</bdi>${p.deal==="rent"?" <small>לחודש</small>":""}</p>
          <h3><a href="${href}">${escaped(p.title)}</a></h3><p class="location">${icon("pin")}${escaped([p.town,p.neighborhood].filter(Boolean).join(" · "))}</p>
          ${facts.length?`<p class="card-facts">${facts.map(f=>`<span>${f}</span>`).join("")}</p>`:""}</div></article>`;}).join("")}</div>
      <p class="similar-more"><a class="button outline" href="/#listings">לכל הנכסים ${icon("left")}</a></p></section>`:"";
  const hood=neighborhoodFor(property);
  const townSlug={"גדרה":"gedera"}[property.town];
  const trail=[["דף הבית","/"],townSlug?[property.town,`/areas/${townSlug}.html`]:["נכסים","/#listings"],...(hood?[[hood.short||hood.name,`/areas/${hood.slug}.html`]]:[])];
  const crumbsLd=JSON.stringify({"@context":"https://schema.org","@type":"BreadcrumbList",itemListElement:[...trail,[property.title,url.pathname]].map(([name,path],i)=>({"@type":"ListItem",position:i+1,name,item:`${url.origin}${path}`}))}).replace(/</g,"\\u003c");
  const detail=`<nav class="breadcrumbs" aria-label="מיקום באתר">${trail.map(([name,path])=>`<a href="${path}">${escaped(name)}</a>`).join("")}<span aria-current="page">${title}</span></nav>
    <script type="application/ld+json">${crumbsLd}</script>
    <article class="live-listing">
      <header class="listing-head">
        <div><p class="listing-tags"><span class="tag tag-${property.deal}">${dealWord}</span>${property.status==="negotiation"?'<span class="tag tag-hot">במשא ומתן</span>':""}</p>
          <h1>${title}</h1><p class="location">${icon("pin")}${place}</p></div>
        <div class="head-tools"><button class="icon-button" type="button" data-save="${id}" aria-label="שמירת הנכס" aria-pressed="false">${icon("heart")}<span>שמירה</span></button>
          <button class="icon-button" type="button" data-share-listing>${icon("external")}<span>שיתוף</span></button></div>
      </header>
      <div class="listing-layout">
        <div class="listing-main">
          ${gallery}
          <section class="listing-section" aria-labelledby="about-title"><h2 id="about-title">על הנכס</h2>
            <p class="listing-description">${escaped(property.description)}</p></section>
          ${amenities}
          ${property.type==="מגרש"?"":`<div id="market-box" data-town="${escaped(property.town)}" data-neighborhood="${escaped(property.neighborhood||"")}" data-type="${escaped(property.type)}" data-rooms="${property.rooms||""}" data-deal="${property.deal}"></div><script type="module" src="/market.mjs?v=3"></script>`}
          ${comparablesHtml}
        </div>
        <aside class="listing-aside" aria-label="מחיר ויצירת קשר">
          <div class="price-card">
            <p class="property-price"><bdi>${nis(property.price)}</bdi>${property.deal==="rent"?" <small>לחודש</small>":""}</p>
            ${factsHtml}
            <button class="button whatsapp-cta" type="button" data-whatsapp-property="${id}">${icon("chat")}<span>שלחו הודעה ב־WhatsApp</span></button>
            <a class="button primary" href="/visit?property=${id}">${icon("home")}<span>תיאום סיור בנכס</span></a>
            <div class="call-links">${calls}</div>
            <div class="agent-strip"><img src="/media/team.webp" alt="" width="56" height="56" loading="lazy"><div><strong>שרל ורועי וילדורף</strong><small>${icon("check")}מתווכים מורשים</small><small>רישיונות <bdi>30826114</bdi> · <bdi>3211578</bdi></small></div></div>
          </div>
        </aside>
      </div>
      ${similarHtml}
    </article>
    <div class="mobile-cta" role="region" aria-label="יצירת קשר מהירה"><div><strong><bdi>${nis(property.price)}</bdi></strong>${property.deal==="rent"?" לחודש":""}</div>
      <a class="button outline" href="tel:${brandContacts[0].tel}" aria-label="התקשרו ל${brandContacts[0].name}">${icon("phone")}<span>חיוג</span></a>
      <button class="button whatsapp-cta" type="button" data-whatsapp-property="${id}">${icon("chat")}<span>WhatsApp</span></button></div>
    <script type="application/json" id="live-property">${JSON.stringify(property).replace(/</g,"\\u003c")}</script>`;
  const template=assets["/properties/gedera-01.html"].text;
  const canonical=escaped(`${url.origin}${url.pathname}`);
  const page=template.replace(/<title>.*?<\/title>/,()=>`<title>${title} | שפע נדל״ן</title>`)
    .replace(/<meta name="description" content="[^"]*">/,()=>`<meta name="description" content="${escaped(property.description.slice(0,180)||property.title)}">`)
    .replace(/<link rel="canonical" href="[^"]*">/,()=>`<link rel="canonical" href="${canonical}">`)
    .replace(/<meta property="og:[^"]+" content="[^"]*">\s*/g,"")
    .replace("</head>",()=>`${listingMeta(property,photoIds,url,canonical,title,price)}</head>`)
    .replace(/<main[^>]*>[\s\S]*?<\/main>/,()=>`<main class="wrap secondary-page" id="content" tabindex="-1">${detail}</main>`);
  return new Response(page,{headers:{...privateHeaders,"Content-Type":"text/html; charset=utf-8"}});
}

function serveAsset(asset,method="GET") {
  const body=asset.text??Uint8Array.from(atob(asset.base64),c=>c.charCodeAt(0));
  return new Response(method==="HEAD"?null:body,{headers:{...privateHeaders,"Content-Type":asset.mime,
    "Cache-Control":asset.mime.startsWith("text/html")?"private, no-cache":"private, max-age=600",
    "Referrer-Policy":"strict-origin-when-cross-origin"}});
}

export function makeWorker(assets) {
  const visits=makeVisits({assets,first,rows,statements,clean,numeric,fail,json,now,uid,idPattern,published,escaped,phoneNumber,dateOrNull,leadInsert,audit,privateHeaders});
  const prospects=makeProspects({first,rows,statements,clean,numeric,fail,json,now,uid,phoneNumber,dateOrNull,audit});
  const operations=makeOfficeOperations({first,rows,statements,fail,json,clean,numeric,now,uid,revision,optionalId,audit});
  const drafts=ownerDrafts({assets,first,rows,statements,fail,json,clean,now,dateOrNull,visits,privateHeaders,escaped});
  return {async fetch(request,env) {
    const url=new URL(request.url);
    const path=url.pathname;
    const method=request.method;
    try {
      if (path==="/api/health"&&method==="GET") {
        const info=await first(env.DB,"SELECT count(*) AS count FROM sqlite_schema WHERE type='table' AND name IN ('office_properties','office_leads','office_work','office_media','office_comparables')");
        return json({database:info?.count===5,storage:Boolean(env.BUCKET),officeConfigured:Boolean(env.OFFICE_OWNER_EMAIL)});
      }
      if (path==="/api/sold"&&method==="GET") {
        // Recently closed deals that were shown on the site: proof of results for sellers. No prices.
        const sold=await rows(env.DB,`SELECT p.id,p.title,p.town,p.neighborhood,p.deal,p.property_type,p.rooms,p.area,p.status,p.updated_at,
          (SELECT id FROM office_media m WHERE m.property_id=p.id AND m.public_photo=1 ORDER BY m.created_at,m.id LIMIT 1) AS cover
          FROM office_properties p WHERE p.status IN ('sold','rented') AND p.published_at IS NOT NULL ORDER BY p.updated_at DESC LIMIT 12`);
        return json({properties:sold.map(r=>({id:r.id,title:r.title,town:r.town,neighborhood:r.neighborhood,deal:r.deal,type:r.property_type,rooms:r.rooms,area:r.area,status:r.status,closedAt:r.updated_at,image:r.cover?`/listing-media/${r.cover}`:""}))});
      }
      if (path==="/api/catalog"&&method==="GET") return json({properties:(await rows(env.DB,`${catalogSql} ORDER BY p.published_at DESC LIMIT 250`)).map(publicProperty)});
      if (path==="/visit"&&["GET","HEAD"].includes(method)) return serveAsset(assets["/visit.html"],method);
      if (path.startsWith("/api/visits/")||path.startsWith("/visit/copy/")) {
        const visitor=request.headers.get("oai-authenticated-user-id");
        if (!visitor) fail(403,"יש להתחבר כדי להשתמש בטופס התיווך.");
        if (method==="POST") trustedOrigin(request);
        if(method==="POST"&&(path==="/api/visits/sign"||path.startsWith("/api/visits/amend/"))&&env.BROKERAGE_SIGNING_APPROVED!=="1")
          fail(409,"חתימה מחייבת ממתינה לאישור משפטי.");
        if (path==="/api/visits/options"&&method==="GET") return await visits.options(env);
        if (path==="/api/visits/quote"&&method==="POST") return await visits.quote(env,visitor,await payload(request));
        if (path==="/api/visits/sign"&&method==="POST") return await visits.sign(env,visitor,await payload(request));
        const id=path.split("/").at(-1);
        if (idPattern.test(id)&&path===`/api/visits/amend/${id}`&&["GET","POST"].includes(method)) {
          return await visits.amendment(env,visitor,id,method,method==="POST"?await payload(request):null);
        }
        if (idPattern.test(id)&&path===`/visit/copy/${id}`&&method==="GET") return await visits.copy(env,visitor,isOfficeActor(request,env),id,url.searchParams.get("format"));
        fail(404,"הפעולה לא נמצאה.");
      }
      if (path==="/api/inquiries"&&method==="POST") {
        trustedOrigin(request);
        if (!request.headers.get("oai-authenticated-user-id")) fail(403,"יש להתחבר לפני שליחת פנייה בגרסה הפרטית.");
        return await createLead(env.DB,"site",await payload(request),true);
      }
      if (path.startsWith("/listing-media/")&&method==="GET") {
        const id=path.split("/").at(-1);
        if (idPattern.test(id)) return await fileResponse(env,id,true,assets);
      }
      if (path.startsWith("/listing/")&&method==="GET") {
        const id=path.split("/").at(-1);
        if (idPattern.test(id)) return await listingPage(env,id,url,assets);
      }
      if (path==="/office"||path==="/office/"||path==="/office.html"||path.startsWith("/api/office/")) {
        const actor=officeActor(request,env);
        if (path==="/office"||path==="/office/"||path==="/office.html") {
          if (method!=="GET"&&method!=="HEAD") fail(405,"פעולה לא נתמכת.");
          return serveAsset(assets["/office.html"],method);
        }
        if (method!=="GET") trustedOrigin(request);
        if (path==="/api/office/prospects/report"&&method==="GET") return await prospects.report(env.DB);
        const draftPdf=path.match(/^\/api\/office\/owner-drafts\/([1-9]\d{0,14})\/(order|exclusive|marketing)$/);
        if(draftPdf&&method==="GET") return await drafts.document(env,Number(draftPdf[1]),draftPdf[2],url.searchParams.get("format"));
        const [, , , resource, id, sub]=path.split("/");
        if (id&&!idPattern.test(id)) fail(400,"מזהה לא תקין.");
        if (resource==="state"&&method==="GET"&&!id) return json(await officeData(env.DB));
        if(resource==="backup"&&method==="GET"&&!id) return new Response(JSON.stringify(await officeSnapshot(env.DB,now())),
          {headers:{...privateHeaders,"Content-Type":"application/json; charset=utf-8","Content-Disposition":"attachment; filename=shefa-database-snapshot.json"}});
        if(resource==="deals"&&!sub){
          if(method==="GET"&&!id) return json(await operations.deals(env.DB));
          if(method==="POST"&&!id||method==="PUT"&&id) return await operations.saveDeal(env.DB,actor,await payload(request),id);
        }
        if(resource==="leads"&&id&&sub==="activity"&&["GET","POST"].includes(method))
          return await operations.leadActivity(env.DB,actor,id,method==="POST"?await payload(request):null);
        if(resource==="properties"&&id&&sub==="history"&&method==="GET") return await operations.history(env.DB,id);
        if(resource==="properties"&&id&&sub==="owner-drafts"&&["GET","POST"].includes(method))
          return method==="POST"?await drafts.create(env,id,await payload(request)):await drafts.list(env,id);
        if (resource==="prospects"&&method==="GET"&&!id) return json({items:await prospects.list(env.DB)});
        if (resource==="prospects"&&method==="GET"&&id&&sub==="draft") return await prospects.draft(env.DB,id);
        if (resource==="prospects"&&!sub&&(method==="POST"&&!id||method==="PUT"&&id)) return await prospects.save(env.DB,actor,await payload(request),id);
        if (resource==="visit-settings"&&!id) {
          if (method==="GET") return json({keyReady:visits.keyValid(env),configuration:visits.keyValid(env)?await visits.settings(env):null});
          if (method==="PUT") return await visits.saveSettings(env,actor,await payload(request));
        }
        if (resource==="visit-forms"&&id&&!sub) {
          if (method==="GET") return await visits.officeVisit(env,id);
          if (method==="POST") {
            if(env.BROKERAGE_SIGNING_APPROVED!=="1") fail(409,"הצעת עמלה לחתימה ממתינה לאישור משפטי.");
            return await visits.propose(env,actor,id,await payload(request));
          }
        }
        if (resource==="export"&&method==="GET"&&!id) {
          const base=await officeData(env.DB,true);
          const [prices,media,marketing,audits,comparables,ownerProspects]=await Promise.all([
            rows(env.DB,"SELECT * FROM property_prices"), rows(env.DB,"SELECT id,property_id,label,mime,public_photo,already_branded,created_at FROM office_media"),
            rows(env.DB,"SELECT * FROM office_marketing"),rows(env.DB,"SELECT * FROM office_audit"),rows(env.DB,"SELECT * FROM office_comparables"),prospects.list(env.DB,true),
          ]);
          const [deals,leadEvents,propertyChanges]=await Promise.all([operations.deals(env.DB,true),rows(env.DB,"SELECT * FROM office_lead_events"),rows(env.DB,"SELECT * FROM office_property_changes")]);
          return new Response(JSON.stringify({createdAt:now(),...base,prices,media,marketing,audits,comparables,ownerProspects,deals,leadEvents,propertyChanges},null,2),{headers:{...privateHeaders,"Content-Type":"application/json; charset=utf-8","Content-Disposition":"attachment; filename=shefa-office-export.json"}});
        }
        if (resource==="properties"&&!sub&&(method==="POST"&&!id||method==="PUT"&&id)) return await saveProperty(env.DB,actor,await payload(request),id);
        if (resource==="properties"&&method==="GET"&&id&&!sub) {
          const p=await first(env.DB,"SELECT * FROM office_properties WHERE id=?",id);
          if (!p) fail(404,"הנכס לא נמצא.");
          const [prices,files,drafts,comparables]=await Promise.all([
            rows(env.DB,"SELECT price,recorded_at FROM property_prices WHERE property_id=? ORDER BY version DESC",id),
            rows(env.DB,"SELECT id,label,mime,public_photo,already_branded,created_at FROM office_media WHERE property_id=? ORDER BY created_at",id),
            rows(env.DB,"SELECT * FROM office_marketing WHERE property_id=?",id),
            rows(env.DB,`SELECT *, ${comparisonWindow} AS in_window FROM office_comparables WHERE property_id=? ORDER BY deal_date DESC`,...comparisonDates(),id),
          ]);
          return json({property:privateProperty(p),prices,files,drafts,comparables});
        }
        if (resource==="properties"&&id&&sub==="files"&&method==="POST") return await uploadFile(request,env,actor,id,url);
        if (resource==="files"&&id&&!sub&&method==="GET") return await fileResponse(env,id,false);
        if (resource==="files"&&id&&!sub&&method==="PUT") return await updatePhotoFlags(env,actor,id,await payload(request));
        if (resource==="properties"&&id&&sub==="marketing"&&method==="POST") return await saveMarketing(env.DB,actor,await payload(request),id,url.origin);
        if (resource==="properties"&&id&&sub==="comparables"&&(method==="POST"||method==="PUT")) return await saveComparable(env.DB,actor,id,await payload(request),method);
        if (resource==="leads"&&method==="POST"&&!id) return await createLead(env.DB,actor,await payload(request),false);
        if (resource==="leads"&&method==="PUT"&&id&&!sub) return await updateLead(env.DB,actor,await payload(request),id);
        if (resource==="work"&&!sub&&(method==="POST"&&!id||method==="PUT"&&id)) return await saveWork(env.DB,actor,await payload(request),id);
        fail(404,"הפעולה לא נמצאה.");
      }
      const key=path==="/"?"/index.html":path;
      const asset=Object.hasOwn(assets,key)?assets[key]:null;
      if (asset&&(method==="GET"||method==="HEAD")) return serveAsset(asset,method);
      return new Response("העמוד לא נמצא.",{status:404,headers:{...privateHeaders,"Content-Type":"text/plain; charset=utf-8"}});
    } catch(error) {
      if (error instanceof RequestError) return json({error:error.message},error.status);
      if (String(error?.message).includes("schedule_conflict")) return json({error:"יש סיור חופף לאותו סוכן או נכס."},409);
      if (String(error?.message).includes("FOREIGN KEY")) return json({error:"אחד הקישורים לנכס או לפנייה אינו זמין."},400);
      console.error("shefa_request_failed",method,path,error?.name);
      return json({error:"אירעה שגיאה. הנתונים שלא אושרו נשמרו בטופס. אפשר לנסות שוב."},500);
    }
  }};
}
