import {brandContactLine} from "../dist/brand.mjs";

const prospectClasses={unknown:"זהות לא ידועה",likely:"כנראה בעלים פרטיים",verified:"בעלים פרטיים מאומתים",broker:"מתווך או משרד תיווך"};
const prospectStages={new:"חדש",followup:"ממתין לטיפול",contacted:"נוצר קשר",responded:"התקבלה תגובה",closed:"סגור",optout:"ביקש הסרה"};
const prospectScale=new Intl.NumberFormat("he-IL");
const prospectNorm=value=>value.trim().normalize("NFKC").toLowerCase().replace(/\s+/g," ");

export function makeProspects({first,rows,statements,clean,numeric,fail,json,now,uid,phoneNumber,dateOrNull,audit}) {
  async function list(db,full=false) {
    const entries=await rows(db,"SELECT * FROM office_prospects ORDER BY created_at DESC"+(full?"":" LIMIT 250"));
    if(!entries.length) return [];
    const sources=full?await rows(db,"SELECT * FROM office_prospect_sources ORDER BY added_at"):
      await rows(db,"SELECT s.* FROM office_prospect_sources s WHERE s.prospect_id IN (SELECT id FROM office_prospects ORDER BY created_at DESC LIMIT 250) ORDER BY s.added_at");
    const links=new Map();
    for(const source of sources){
      if(!links.has(source.prospect_id)) links.set(source.prospect_id,[]);
      links.get(source.prospect_id).push(source);
    }
    return entries.map(entry=>({...entry,sources:links.get(entry.id)??[]}));
  }
  function fields(data) {
    const classification=clean(data.classification,16,true);
    const stage=clean(data.stage,16)||"new";
    if(!Object.hasOwn(prospectClasses,classification)||!Object.hasOwn(prospectStages,stage)) fail(400,"יש לבחור סיווג וסטטוס תקינים.");
    const evidence=clean(data.evidence,700);
    if(classification==="verified"&&!evidence) fail(400,"נדרש תיעוד בדיקת בעלות לפני סיווג כמאומת.");
    const permission=clean(data.permission,700);
    if(!["sale","rent"].includes(data.deal)) fail(400,"יש לבחור מכירה או השכרה.");
    const price=numeric(data.price,1000000000);
    if(price!==null&&(!Number.isInteger(price)||price<1)) fail(400,"יש להזין מחיר חיובי בשקלים שלמים.");
    return {town:clean(data.town,75,true),address:clean(data.address,200),deal:data.deal,kind:clean(data.kind,50),price,
      rooms:numeric(data.rooms,100),area:numeric(data.area,100000),name:clean(data.name,120),phone:data.phone?phoneNumber(data.phone):"",
      classification,evidence,permission,stage,assigned_to:clean(data.assigned_to,80),followup:clean(data.followup,700)};
  }
  function sourceInput(data) {
    const raw=clean(data.sourceUrl,950,true);
    let url;
    try{url=new URL(raw);}catch{fail(400,"כתובת מקור המודעה אינה תקינה.");}
    if(url.protocol!=="https:"||url.username||url.password||!url.hostname.includes(".")) fail(400,"יש להזין קישור HTTPS תקין למודעה.");
    if(data.sourceAllowed!==true) fail(400,"נדרש אישור שמותר למשרד להשתמש בפרטי המקור.");
    url.hash="";
    for(const key of [...url.searchParams.keys()]) if(/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return {url:url.href,name:clean(data.sourceName,100,true),posted:dateOrNull(data.postedOn)};
  }
  const matchKey=p=>p.address&&p.phone?[p.town,p.address,p.deal,p.phone].map(prospectNorm).join("|"):null;
  const followUpTask=(db,id,at)=>statements(db,`INSERT OR IGNORE INTO office_work (id,title,kind,status,assigned_to,notes,created_at,updated_at)
    SELECT id,'בדיקת הרשאת פנייה · '||town,'task','open',assigned_to,'בדקו את הליד במסך בעלי נכסים. לא נשלחה הודעה.',?,?
    FROM office_prospects WHERE id=? AND classification='verified' AND permission='' AND stage IN ('new','followup')`,at,at,id);
  async function save(db,actor,data,id) {
    const at=now();
    if(id&&data.addSource===true) {
      const p=await first(db,"SELECT id FROM office_prospects WHERE id=?",id);
      if(!p) fail(404,"הליד לא נמצא.");
      const source=sourceInput(data);
      const prior=await first(db,"SELECT prospect_id FROM office_prospect_sources WHERE url=?",source.url);
      if(prior&&prior.prospect_id!==id) fail(409,"המודעה כבר משויכת לליד אחר.");
      await db.batch([
        statements(db,"INSERT OR IGNORE INTO office_prospect_sources VALUES (?,?,?,?,?)",source.url,id,source.name,source.posted,at),
        audit(db,actor,"prospect.source",id,at),
      ]);
      return json({id});
    }
    const p=fields(data);
    const key=matchKey(p);
    const attrs=Object.values(p);
    if(id){
      const prior=await first(db,"SELECT version FROM office_prospects WHERE id=?",id);
      if(!prior) fail(404,"הליד לא נמצא.");
      if(data.version!==prior.version) fail(409,"הליד השתנה. רעננו לפני שמירה.");
      if(key&&await first(db,"SELECT id FROM office_prospects WHERE match_key=? AND id<>?",key,id)) fail(409,"כבר קיים ליד עם אותו נכס וטלפון.");
      const [result]=await db.batch([
        statements(db,`UPDATE office_prospects SET match_key=?,town=?,address=?,deal=?,kind=?,price=?,rooms=?,area=?,name=?,phone=?,classification=?,evidence=?,permission=?,stage=?,assigned_to=?,followup=?,updated_at=?,version=version+1 WHERE id=? AND version=?`,key,...attrs,at,id,data.version),
        statements(db,"INSERT INTO office_audit SELECT ?,?,?,id,? FROM office_prospects WHERE id=? AND updated_at=? AND version=?",uid(),actor,"prospect.updated",at,id,at,data.version+1),
        followUpTask(db,id,at),
      ]);
      if(result.meta.changes!==1) fail(409,"הליד השתנה. רעננו לפני שמירה.");
      return json({id});
    }
    const source=sourceInput(data);
    const newId=uid();
    await db.batch([
      statements(db,`INSERT OR IGNORE INTO office_prospects (id,match_key,town,address,deal,kind,price,rooms,area,name,phone,classification,evidence,permission,stage,assigned_to,followup,created_at,updated_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM office_prospect_sources WHERE url=?)`,
        newId,key,...attrs,at,at,source.url),
      statements(db,`INSERT OR IGNORE INTO office_prospect_sources (url,prospect_id,source_name,posted_on,added_at)
        SELECT ?,id,?,?,? FROM office_prospects WHERE id=? OR match_key=? LIMIT 1`,source.url,source.name,source.posted,at,newId,key),
      statements(db,"INSERT INTO office_audit SELECT ?,?,?,id,? FROM office_prospects WHERE id=?",uid(),actor,"prospect.created",at,newId),
      followUpTask(db,newId,at),
    ]);
    const stored=await first(db,"SELECT prospect_id FROM office_prospect_sources WHERE url=?",source.url);
    if(!stored) fail(409,"לא ניתן לשייך את המקור.");
    const localProperty=p.address?await first(db,"SELECT id,title FROM office_properties WHERE town=? AND deal=? AND trim(json_extract(internal_json,'$.address'))=? LIMIT 1",p.town,p.deal,p.address):null;
    return json({id:stored.prospect_id,duplicate:stored.prospect_id!==newId,localProperty},stored.prospect_id===newId?201:200);
  }
  async function report(db) {
    const end=now();
    const start=new Date(Date.parse(end)-86400000).toISOString();
    const entries=await rows(db,`SELECT p.*, (SELECT url FROM office_prospect_sources s WHERE s.prospect_id=p.id ORDER BY added_at,url LIMIT 1) AS url,
      (SELECT source_name FROM office_prospect_sources s WHERE s.prospect_id=p.id ORDER BY added_at,url LIMIT 1) AS source_name
      FROM office_prospects p WHERE classification='verified' AND created_at>=? AND created_at<=? ORDER BY created_at DESC`,start,end);
    const total=entries.length;
    const sales=entries.filter(p=>p.deal==="sale").length;
    const replies=entries.filter(p=>p.stage==="responded").length;
    const pending=entries.filter(p=>["new","followup"].includes(p.stage)).length;
    const blocks=entries.map(p=>[
      [p.town,p.address,p.kind,p.deal==="sale"?"מכירה":"השכרה",p.price?prospectScale.format(p.price)+" ₪":"",p.rooms?p.rooms+" חדרים":"",p.area?p.area+" מ״ר":""].filter(Boolean).join(" · "),
      [p.name,p.permission&&p.stage!=="optout"?p.phone:"",p.source_name,prospectStages[p.stage]].filter(Boolean).join(" · "),p.url,
    ].filter(Boolean).join("\n"));
    const message=["שפע נדל״ן · דוח לידים פרטיים מאומתים",...(total?blocks:["לא אותרו בעלי נכסים פרטיים מאומתים ב־24 השעות האחרונות."]),
      `${total} לידים · ${sales} למכירה · ${total-sales} להשכרה · ${replies} תגובות שתועדו · ${pending} ממתינים לטיפול`,
      "WhatsApp Business טרם חובר. אין נתוני משלוח מהמערכת."].join("\n\n");
    return json({start,end,total,sales,rent:total-sales,replies,pending,message,delivery:"not-connected"});
  }
  async function draft(db,id) {
    const p=await first(db,"SELECT * FROM office_prospects WHERE id=?",id);
    if(!p) fail(404,"הליד לא נמצא.");
    const blocked=p.phone&&await first(db,"SELECT id FROM office_prospects WHERE phone=? AND stage='optout' LIMIT 1",p.phone);
    if(p.classification!=="verified"||!p.permission||!p.phone||blocked||["optout","closed"].includes(p.stage)) fail(409,"טיוטת פנייה זמינה לבעלים פרטיים מאומתים עם טלפון והסכמה מתועדת, כל עוד אין בקשת הסרה.");
    return json({message:[
      "שלום "+(p.name||"")+"! 🏡",
      "כאן צוות שפע נדל״ן — גדרה והסביבה.",
      "נשמח להציע לך את שירותי המשרד למכירה או להשכרה של הנכס שלך.",
      "אנחנו מתמחים בשיווק נדל״ן באזור גדרה והסביבה, עם היכרות מעמיקה של השוק המקומי, ניסיון בשיווק נכסים וליווי אישי לאורך כל התהליך.",
      "נשמח להכיר ולבדוק כיצד נוכל לסייע לך לקדם את הנכס ולהגיע לעסקה המתאימה.",
      brandContactLine,
      "אם אינך מעוניין בפניות נוספות, ניתן להשיב ״הסר״.",
    ].join("\n\n"),status:"draft"});
  }
  return {list,save,report,draft};
}
