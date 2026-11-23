export function officeOperations({api,showEdit,submitting,select,input,area,safe,actionRow,dialog,edit,stamp,propertyOptions,leadOptions}){
  const stages={offer:"הצעה",negotiation:"משא ומתן",closed:"נסגרה",cancelled:"בוטלה"};
  const error='<p class="office-error" role="alert" hidden></p>';
  const amount=new Intl.NumberFormat("he-IL",{style:"currency",currency:"ILS"});
  const format=cents=>amount.format(cents/100);
  const money=(name,label,cents)=>input(name,label,cents==null?"":cents/100,'type="number" min="0" step="0.01"');
  const title=label=>`<h3>${label}</h3>`;
  async function mountLedger(root,message=""){
    root.innerHTML="<p role=status>טוען עסקאות…</p>";
    try {
      const {items,totals}=await api("deals");
      if(!root.isConnected) return;
      root.innerHTML=`<p role="status">${safe(message)}</p><div class="office-metrics" aria-label="סכומי העסקאות">
        ${[["עמלות צפויות ועסקאות סגורות",totals.commission],["נגבה בפועל",totals.paid],["יתרה לגבייה",totals.outstanding],["הוצאות ישירות",totals.expenses],["תקבולים פחות הוצאות",totals.paid-totals.expenses]].map(([label,value])=>`<div class="office-metric"><strong><bdi>${format(value)}</bdi></strong><span>${label}</span></div>`).join("")}
        </div>${actionRow('<button type="button" class="button primary" id="deal-new">עסקה חדשה</button>')}
        <div class="office-list">${items.map(item=>`<article class="office-item"><div>
          ${title(safe(item.property_title))}<p>${safe(item.client_name||"ללא ליד משויך")} · ${stages[item.stage]} · <bdi>${format(item.price_cents)}</bdi></p>
          <p>עמלה <bdi>${format(item.commission_cents)}</bdi> · נגבה <bdi>${format(item.paid_cents)}</bdi></p>
          </div><button type="button" class="button outline" data-edit-deal="${item.id}">עריכת עסקה</button></article>`).join("")||"<p>אין עסקאות מתועדות.</p>"}</div>`;
      root.querySelector("#deal-new").onclick=event=>editor(null,root,event.currentTarget);
      for(const control of root.querySelectorAll("[data-edit-deal]")) control.onclick=()=>editor(items.find(item=>item.id===control.dataset.editDeal),root,control);
    }catch(problem){if(root.isConnected) root.innerHTML=`<p class="office-error" role="alert">${safe(problem.message)}</p>`;}
  }
  function editor(item,root,trigger){
    const requestId=crypto.randomUUID();
    showEdit(item?"עריכת עסקה":"עסקה חדשה",`<form id="deal-entry"><div class="office-fields">
      ${select("propertyId","נכס",propertyOptions(),item?.property_id??"",true)}
      ${select("leadId","ליד",leadOptions(),item?.lead_id??"")}
      ${select("stage","מצב עסקה",stages,item?.stage??"offer",true)}
      ${money("price","מחיר עסקה בש״ח",item?.price_cents)}${money("commission","עמלה מוסכמת בש״ח",item?.commission_cents)}
      ${money("paid","תקבול שבוצע בש״ח",item?.paid_cents)}${money("expenses","הוצאה ישירה בש״ח",item?.expenses_cents)}
      ${area("notes","הערות לעסקה",item?.notes,1500)}</div>
      <h3>חלוקה בין משתתפים</h3><p>החלוקה אופציונלית. אם הוזנה, הסכומים חייבים להסתכם בעמלה המוסכמת.</p>
      <div id="allocations"></div><button type="button" id="add-share" class="button outline">הוספת משתתף</button>
      ${item?'<label class="office-check"><input name="approved" type="checkbox"> אני מאשר את שינוי העמלה או החלוקה</label>':""}
      ${error}${actionRow('<button type="submit" class="button primary">שמירת עסקה</button>')}</form>`,trigger);
    const form=edit.querySelector("form");
    const allocations=form.querySelector("#allocations");
    function share(name="",cents=null){
      if(allocations.childElementCount>=20) return;
      const row=document.createElement("div");
      row.className="office-fields";
      row.innerHTML=input("participant","שם המשתתף",name,"required maxlength=100")+money("share","סכום חלוקה בש״ח",cents)+
        '<button type="button" class="button outline">הסרת משתתף</button>';
      row.querySelector("button").onclick=()=>row.remove();
      allocations.append(row);
    }
    form.querySelector("#add-share").onclick=()=>{share();allocations.lastElementChild?.querySelector("input")?.focus();};
    for(const row of item?.allocations??[]) share(row.name,row.cents);
    form.onsubmit=event=>{event.preventDefault();submitting(form,async()=>{
      const fields=new FormData(form);
      const shares=fields.getAll("share");
      const data={...Object.fromEntries(fields),allocations:fields.getAll("participant").map((name,i)=>({name,amount:shares[i]})),
        requestId,version:item?.version,approved:fields.has("approved")};
      await api("deals"+(item?"/"+item.id:""),{method:item?"PUT":"POST",data});
      if(form.isConnected){dialog.close();await mountLedger(root,"העסקה נשמרה.");}
    });};
  }
  async function activity(id,trigger,message=""){
    const {events,leads,work}=await api(`leads/${id}/activity`);
    const list=(records,render,empty)=>records.length?`<ul class="office-files">${records.map(record=>"<li>"+render(record)+"</li>").join("")}</ul>`:`<p>${empty}</p>`;
    showEdit("היסטוריית לקוח",`<p role="status">${safe(message)}</p>
      ${title("פניות קודמות")}${list(leads,l=>`${stamp(l.created_at)} · ${safe(l.source)} · ${safe(l.assigned_to||"ללא שיוך")}`,"אין פניות.")}
      ${title("משימות ופגישות")}${list(work,w=>`${safe(w.title)}${w.starts_at?" · "+stamp(w.starts_at):""}`,"אין משימות או פגישות מתועדות.")}
      ${title("שיוכים, שינויים וסיכומי שיחות")}${list(events,entry=>`${safe(entry.summary)} · ${stamp(entry.at)}`,"אין אירועים מתועדים.")}
      <form>${area("note","סיכום שיחה או עדכון",null,1400)}${error}${actionRow('<button type="submit" class="button primary">הוספת סיכום</button>')}</form>`,trigger);
    const form=edit.querySelector("form");
    const requestId=crypto.randomUUID();
    form.onsubmit=event=>{event.preventDefault();submitting(form,async()=>{
      await api(`leads/${id}/activity`,{method:"POST",data:{note:form.elements.note.value,requestId}});
      if(form.isConnected) await activity(id,trigger,"הסיכום נשמר.");
    });};
  }
  async function propertyHistory(id,trigger,states){
    const {events}=await api(`properties/${id}/history`);
    showEdit("היסטוריית הנכס",events.length?`<ul class="office-files">${events.map(x=>`<li>
      ${stamp(x.at)} · ${safe(states[x.new_status])} · <bdi>${format(x.new_price*100)}</bdi> · ${safe(x.reason)}</li>`).join("")}</ul>`:
      "<p>אין אירועים מאז הוספת יומן המחירים והסטטוסים. מחיר קודם, אם נשמר, זמין בקבצים ומחירים.</p>",trigger);
  }
  async function ownerDocuments(id,trigger,result){
    const {title:name,address,drafts}=result??await api(`properties/${id}/owner-drafts`);
    const download=(serial,kind,label)=>`<a class="button outline" href="/api/office/owner-drafts/${serial}/${kind}?format=html">${label} (קריאה באתר)</a><a class="button outline" href="/api/office/owner-drafts/${serial}/${kind}">${label} (PDF)</a>`;
    const items=drafts.map(d=>`<li><bdi>${safe(d.reference)}</bdi> · ${stamp(d.at)} · טיוטה
      ${actionRow(download(d.serial,"order","הזמנה")+(d.exclusive?download(d.serial,"exclusive","בלעדיות")+download(d.serial,"marketing","פעולות שיווק"):""))}</li>`).join("");
    showEdit("מסמכים לבעל נכס",`<p>${safe(name)}</p><p>המסמכים מיועדים לבדיקה ולאישור נוסחים. חתימה ושליחת דוא״ל אינן מופעלות.</p>
      <ul class="office-files">${items||"<li>אין טיוטות שמורות.</li>"}</ul><form>
      ${input("address","כתובת או זיהוי הנכס בטופס",address,"required maxlength=200")}
      ${area("orderText","תנאי ההזמנה לבדיקה",null,3000)}
      <details class="office-history"><summary>טיוטות לבלעדיות ושיווק</summary>
      ${input("end","תאריך סיום מוצע","","type=date")}
      ${area("exclusiveText","נוסח בלעדיות לבדיקה",null,3000)}
      ${area("marketingText","פעולות שיווק לבדיקה",null,3000)}</details>
      ${error}${actionRow('<button type="submit" class="button primary">יצירת טיוטות PDF</button>')}</form>`,trigger);
    const form=edit.querySelector("form");
    form.onsubmit=event=>{event.preventDefault();submitting(form,async()=>{
      const result=await api(`properties/${id}/owner-drafts`,{method:"POST",data:Object.fromEntries(new FormData(form))});
      if(form.isConnected) await ownerDocuments(id,trigger,result);
    });};
  }
  return {mountLedger,activity,propertyHistory,ownerDocuments};
}
