const officePeople=["רועי","שרל"];
const dealStages={offer:"הצעה",negotiation:"משא ומתן",closed:"נסגרה",cancelled:"בוטלה"};

export function leadRoutingBatch(db,statements,lead,actor,at){
  return [
    statements(db,`UPDATE office_leads AS l SET assigned_to=COALESCE(
      (SELECT other.assigned_to FROM office_leads other WHERE other.contact_id=l.contact_id
        AND other.id<>l.id AND other.assigned_to IN ('רועי','שרל') ORDER BY other.updated_at DESC,other.id LIMIT 1),
      (SELECT CASE WHEN json_extract(p.internal_json,'$.agent') IN ('רועי','שרל') THEN json_extract(p.internal_json,'$.agent') END
        FROM office_properties p WHERE p.id=l.property_id),
      (SELECT CASE WHEN count(*) FILTER(WHERE assigned_to='רועי')<=count(*) FILTER(WHERE assigned_to='שרל') THEN 'רועי' ELSE 'שרל' END
        FROM office_leads WHERE stage NOT IN ('closed','lost')))
      WHERE l.id=? AND l.assigned_to='' AND NOT EXISTS(SELECT 1 FROM office_lead_events e WHERE e.id=?)`,lead,"route:"+lead),
    statements(db,`INSERT OR IGNORE INTO office_lead_events (id,lead_id,kind,summary,actor,at)
      SELECT ?,id,'routing','אחראי בעת קליטה: '||assigned_to,?,? FROM office_leads WHERE id=? AND assigned_to<>''`,"route:"+lead,actor,at,lead),
  ];
}

export function makeOfficeOperations({first,rows,statements,fail,json,clean,numeric,now,uid,revision,optionalId,audit}){
  function amount(value,required=false){
    const n=numeric(value,1000000000,required)??0;
    const cents=Math.round(n*100);
    if(Math.abs(n*100-cents)>0.00005) fail(400,"יש להזין סכום עם עד שתי ספרות אחרי הנקודה.");
    return cents;
  }
  function allocationRows(data,expected){
    if(!Array.isArray(data)||data.length>20) fail(400,"חלוקת העמלות אינה תקינה.");
    const split=data.map(row=>{
      if(!row||typeof row!=="object") fail(400,"חלוקת העמלות אינה תקינה.");
      return {name:clean(row.name,100,true),cents:amount(row.amount,true)};
    });
    if(split.length&&split.reduce((sum,row)=>sum+row.cents,0)!==expected) fail(400,"סך החלוקה חייב להיות שווה לעמלה המוסכמת.");
    if(new Set(split.map(row=>row.name.normalize("NFKC").toLowerCase())).size!==split.length) fail(400,"כל משתתף יכול להופיע פעם אחת בחלוקה.");
    return split;
  }

  async function saveDeal(db,actor,data,id){
    const property=optionalId(data.propertyId);
    const lead=optionalId(data.leadId);
    if(!property) fail(400,"בחרו נכס לעסקה.");
    if(!Object.hasOwn(dealStages,data.stage)) fail(400,"בחרו מצב עסקה.");
    const price=amount(data.price,true);
    if(!price) fail(400,"מחיר העסקה חייב להיות גדול מאפס.");
    const commission=amount(data.commission,true);
    const paid=amount(data.paid);
    if(paid>commission) fail(400,"תקבול אינו יכול להיות גבוה מהעמלה המוסכמת.");
    const allocations=allocationRows(data.allocations,commission);
    const values=[property,lead,data.stage,price,commission,paid,amount(data.expenses),JSON.stringify(allocations),clean(data.notes,1500)];
    const at=now();
    if(!id){
      const key=optionalId(data.requestId)??uid();
      await db.batch([
        statements(db,`INSERT INTO office_deals (id,property_id,lead_id,stage,price_cents,commission_cents,paid_cents,expenses_cents,allocations,notes,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`,key,...values,at,at),
        audit(db,actor,"deal.created",key,at,"deal:create:"+key),
      ]);
      return json({id:key},201);
    }
    const current=await first(db,"SELECT * FROM office_deals WHERE id=?",id);
    if(!current) fail(404,"העסקה לא נמצאה.");
    const version=revision(data.version);
    if(version!==current.version) fail(409,"העסקה השתנתה. רעננו ונסו שוב.");
    if((commission!==current.commission_cents||JSON.stringify(allocations)!==current.allocations)&&data.approved!==true) fail(400,"יש לאשר במפורש את שינוי העמלה או החלוקה.");
    const [result]=await db.batch([
      statements(db,`UPDATE office_deals SET property_id=?,lead_id=?,stage=?,price_cents=?,commission_cents=?,paid_cents=?,expenses_cents=?,
        allocations=?,notes=?,updated_at=?,version=version+1 WHERE id=? AND version=?`,...values,at,id,version),
      statements(db,"INSERT INTO office_audit SELECT ?,?,?,id,? FROM office_deals WHERE id=? AND version=? AND updated_at=?",uid(),actor,"deal.updated",at,id,version+1,at),
    ]);
    if(!result.meta.changes) fail(409,"העסקה השתנתה. רעננו ונסו שוב.");
    return json({id});
  }
  async function deals(db,full=false){
    const records=await rows(db,`SELECT d.*,p.title AS property_title,c.name AS client_name FROM office_deals d
      JOIN office_properties p ON p.id=d.property_id LEFT JOIN office_leads l ON l.id=d.lead_id
      LEFT JOIN office_contacts c ON c.id=l.contact_id ORDER BY d.updated_at DESC,d.id${full?"":" LIMIT 250"}`);
    const totals=await first(db,`SELECT count(*) AS count,COALESCE(SUM(CASE WHEN stage<>'cancelled' THEN commission_cents ELSE 0 END),0) AS commission,
      COALESCE(SUM(paid_cents),0) AS paid,COALESCE(SUM(expenses_cents),0) AS expenses,
      COALESCE(SUM(CASE WHEN stage<>'cancelled' THEN commission_cents-paid_cents ELSE 0 END),0) AS outstanding FROM office_deals`);
    return {items:records.map(item=>({...item,allocations:JSON.parse(item.allocations)})),totals};
  }
  async function leadActivity(db,actor,id,data){
    const exists=await first(db,"SELECT contact_id FROM office_leads WHERE id=?",id);
    if(!exists) fail(404,"הליד לא נמצא.");
    if(data){
      const note=clean(data.note,1400,true);
      const key=optionalId(data.requestId)??uid();
      const at=now();
      await db.batch([
        statements(db,"INSERT OR IGNORE INTO office_lead_events VALUES (?,?,'note',?,?,?)",key,id,note,actor,at),
        audit(db,actor,"lead.note",id,at,"lead:note:"+key),
      ]);
    }
    const events=await rows(db,`SELECT e.kind,e.summary,e.at,e.lead_id FROM office_lead_events e
      JOIN office_leads l ON l.id=e.lead_id WHERE l.contact_id=? ORDER BY e.at DESC,e.id DESC LIMIT 100`,exists.contact_id);
    const leads=await rows(db,`SELECT id,intent,source,stage,assigned_to,created_at FROM office_leads
      WHERE contact_id=? ORDER BY created_at DESC,id LIMIT 40`,exists.contact_id);
    const work=await rows(db,`SELECT w.title,w.kind,w.starts_at,w.status FROM office_work w JOIN office_leads l ON l.id=w.lead_id
      WHERE l.contact_id=? ORDER BY w.updated_at DESC LIMIT 40`,exists.contact_id);
    return json({events,leads,work});
  }
  async function history(db,id){
    const events=await rows(db,`SELECT version,old_status,new_status,old_price,new_price,reason,at
      FROM office_property_changes WHERE property_id=? ORDER BY version DESC LIMIT 100`,id);
    return json({events});
  }
  return {saveDeal,deals,leadActivity,history};
}
