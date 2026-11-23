import {draftOwnerSpec,renderBrokeragePdf} from "./print-documents.mjs";

const docYear=new Intl.DateTimeFormat("en",{year:"numeric",timeZone:"Asia/Jerusalem"});
const referenceOf=row=>"SN-"+docYear.format(new Date(row.at))+"-"+String(row.serial).padStart(6,"0");

export function ownerDrafts({assets,first,rows,statements,fail,json,clean,now,dateOrNull,visits,privateHeaders,escaped}){
  async function list(env,id){
    const property=await first(env.DB,"SELECT title,internal_json FROM office_properties WHERE id=?",id);
    if(!property) fail(404,"הנכס לא נמצא.");
    const internal=JSON.parse(property.internal_json);
    const drafts=await rows(env.DB,"SELECT serial,at,draft_body FROM office_document_refs WHERE property_id=? AND draft_body IS NOT NULL ORDER BY serial DESC LIMIT 40",id);
    const items=await Promise.all(drafts.map(async row=>{
      const draft=await visits.unseal(env,"owner-draft:"+id,row.draft_body);
      return {serial:row.serial,at:row.at,reference:referenceOf(row),exclusive:Boolean(draft.exclusiveText)};
    }));
    return json({title:property.title,address:internal.agreementAddress||internal.address||"",
      drafts:items});
  }
  async function create(env,id,data){
    const p=await first(env.DB,"SELECT * FROM office_properties WHERE id=?",id);
    if(!p) fail(404,"הנכס לא נמצא.");
    if(!visits.keyValid(env)) fail(409,"שמירת מסמכים מוצפנים עדיין לא הוגדרה.");
    const config=await visits.settings(env);
    const address=clean(data.address,200,true);
    const orderText=clean(data.orderText,3000);
    const exclusiveText=clean(data.exclusiveText,3000);
    const marketingText=clean(data.marketingText,3000);
    const end=dateOrNull(data.end);
    if((exclusiveText||marketingText||end)&&(!exclusiveText||!marketingText||!end)) fail(400,"לטיוטת בלעדיות יש למלא גם תקופה, נוסח ופעולות שיווק.");
    const fee=config?.fees?.[p.deal]??{mode:"percent",amount:p.deal==="sale"?2:100,vat:"plus"};
    const at=now();
    const body=await visits.seal(env,"owner-draft:"+id,{at,broker:config?.broker,property:{title:p.title,address,town:p.town,type:p.property_type,
      deal:p.deal,price:p.price,fee},orderText,exclusiveText,marketingText,end});
    await env.DB.batch([statements(env.DB,"INSERT INTO office_document_refs (property_id,draft_body,at) VALUES (?,?,?)",id,body,at)]);
    return list(env,id);
  }
  async function document(env,serial,kind,format){
    const row=await first(env.DB,"SELECT * FROM office_document_refs WHERE serial=? AND draft_body IS NOT NULL",serial);
    if(!row) fail(404,"הטיוטה לא נמצאה.");
    const draft=await visits.unseal(env,"owner-draft:"+row.property_id,row.draft_body);
    if(kind!=="order"&&!draft.exclusiveText) fail(404,"המסמך לא נכלל בטיוטה.");
    const spec=draftOwnerSpec({...draft,reference:referenceOf(row)},kind);
    if(format==="html"){
      const sections=spec.sections.map(section=>`<section><h2>${escaped(section.title)}</h2>${section.lines.filter(Boolean).map(line=>`<p>${escaped(line)}</p>`).join("")}</section>`).join("");
      const date=new Intl.DateTimeFormat("he-IL",{dateStyle:"long",timeStyle:"short",timeZone:"Asia/Jerusalem"}).format(new Date(spec.createdAt));
      const page=`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escaped(spec.title)} | שפע נדל״ן</title><link rel="stylesheet" href="/styles.css?v=10"></head><body><main class="wrap secondary-page"><article class="reading-page"><h1>${escaped(spec.title)}</h1><p>טיוטה לבדיקה. חתימה דיגיטלית אינה פעילה במסמך זה.</p><p>אסמכתה <bdi>${escaped(spec.reference)}</bdi></p><p>הופקה <time datetime="${escaped(spec.createdAt)}">${date}</time></p>${sections}<p><a class="inline-link" href="/api/office/owner-drafts/${serial}/${kind}">הורדת PDF</a></p></article></main></body></html>`;
      return new Response(page,{headers:{...privateHeaders,"Content-Type":"text/html; charset=utf-8","Referrer-Policy":"no-referrer"}});
    }
    const data=await renderBrokeragePdf(spec,assets);
    return new Response(data,{headers:{...privateHeaders,"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${spec.reference}.pdf"`}});
  }
  return {list,create,document};
}
export const visitReference=(row,id)=>row?referenceOf(row):id;
