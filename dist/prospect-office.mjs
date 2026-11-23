import {brandLogo} from "./brand.mjs";

export function mountProspects(root,{api,showEdit,dialog,submitting,select,input,area,safe,actionRow}) {
  const classes={unknown:"זהות לא ידועה",likely:"כנראה בעלים פרטיים",verified:"בעלים פרטיים מאומתים",broker:"מתווך או משרד תיווך"};
  const stages={new:"חדש",followup:"ממתין לטיפול",contacted:"נוצר קשר",responded:"התקבלה תגובה",closed:"סגור",optout:"ביקש הסרה"};
  const deals={sale:"מכירה",rent:"השכרה"};
  const fieldAlert='<p class="office-error" role="alert" hidden></p>';
  const sourceFields=()=>`<div class="office-fields">${input("sourceName","שם מקור המודעה","","required maxlength=100")}${input("sourceUrl","קישור למודעה המקורית","","required type=url maxlength=950 dir=ltr")}${input("postedOn","תאריך פרסום, אם ידוע","","type=date")}
  <label class="office-check wide"><input name="sourceAllowed" type="checkbox" required> בדקתי שמותר למשרד להשתמש בפרטי המקור</label></div>`;
  const finish=(message)=>{dialog.close();load(message);};
  let items=[];
  const showMessage=(node,message)=>{node.hidden=false;node.textContent=message;};
  async function load(message="") {
    if(!root.isConnected) return;
    root.innerHTML='<p role="status">טוען לידים של בעלי נכסים…</p>';
    try{
      const result=await api("prospects");
      if(!root.isConnected) return;
      items=result.items;
      root.innerHTML=`<div class="office-view-head"><p>קליטת מודעות ממקורות מורשים ובדיקת זהות המפרסם.</p>
        ${actionRow('<button type="button" class="button primary" data-prospect-new>קליטת מודעה</button><button type="button" class="button outline" data-prospect-report>דוח 24 שעות</button>')}</div>
        <p role="status">${safe(message)}</p><div class="office-filters">${select("classification","סיווג",{"":"כל הסיווגים",...classes},"")}${input("search","חיפוש לפי יישוב, נכס או מפרסם","","type=search")}</div><div class="office-list" data-prospect-list></div><p class="office-error" role="alert" hidden></p>`;
      root.querySelector("[data-prospect-new]").onclick=event=>editor(null,event.currentTarget);
      root.querySelector("[data-prospect-report]").onclick=event=>report(event.currentTarget);
      root.querySelector(".office-filters").addEventListener("input",renderList);
      renderList();
    }catch(error){
      root.innerHTML='<p class="office-error" role="alert"></p>';
      showMessage(root.firstElementChild,error.message);
    }
  }
  function renderList() {
    const query=root.querySelector("[name=search]").value.trim().toLowerCase();
    const classification=root.querySelector("[name=classification]").value;
    const shown=items.filter(p=>(!classification||p.classification===classification)&&[p.town,p.address,p.name].join(" ").toLowerCase().includes(query));
    root.querySelector("[data-prospect-list]").innerHTML=shown.map(p=>`<article class="office-item"><div><h3>${safe([p.town,p.address].filter(Boolean).join(" · "))}</h3><p class="office-small">${deals[p.deal]} · ${safe(classes[p.classification])} · ${safe(stages[p.stage])} · ${p.sources.length} מקורות</p></div>
      ${actionRow(`<button type="button" class="button outline" data-prospect-id="${p.id}">פרטי ליד</button>`)}</article>`).join("")||'<p class="office-panel">אין לידים מתאימים.</p>';
    for(const button of root.querySelectorAll("[data-prospect-id]")) button.onclick=()=>editor(items.find(p=>p.id===button.dataset.prospectId),button);
  }
  function editor(p,trigger) {
    const sources=p?.sources??[];
    showEdit(p?"פרטי ליד של בעל נכס":"קליטת מודעה ממקור מורשה",`<form id="prospect-edit">
    <div class="office-fields">${input("town","יישוב",p?.town,"required maxlength=75")}${input("address","כתובת הנכס, כולל יחידה אם ידועה",p?.address,"maxlength=200")}
    ${select("deal","סוג עסקה",deals,p?.deal??"sale")}${input("kind","סוג נכס",p?.kind,"maxlength=50")}
    ${input("price","מחיר מבוקש בש״ח",p?.price,"type=number min=1 step=1")}${input("rooms","חדרים",p?.rooms,"type=number min=0 step=0.5")}
    ${input("area","שטח במ״ר",p?.area,"type=number min=0 step=any")}${input("name","שם המפרסם",p?.name,"maxlength=120")}
    ${input("phone","טלפון, אם מותר לשמור",p?.phone,"type=tel dir=ltr maxlength=30")}${select("classification","סיווג המפרסם",classes,p?.classification??"unknown")}
    ${select("stage","סטטוס טיפול",stages,p?.stage??"new")}${input("assigned_to","נציג אחראי",p?.assigned_to,"maxlength=80")}
    ${area("evidence","כיצד אומתה הבעלות",p?.evidence,700)}${area("permission","תיעוד הסכמה לפנייה שיווקית, אם קיימת",p?.permission,700)}
    ${area("followup","המשך טיפול",p?.followup,700)}</div>
    <p class="office-small">ניסוח כמו ״ללא תיווך״ משמש רמז לבדיקה. אימות בעלות והסכמה לפנייה מתועדים בנפרד.</p>
    ${p?"":sourceFields()}${fieldAlert}${actionRow('<button type="submit" class="button primary">שמירה</button>')}</form>
    ${p?`<h3>מקורות</h3><ul class="office-files">${sources.map(s=>`<li><a href="${safe(s.url)}" target="_blank" rel="noopener noreferrer">${safe(s.source_name)}</a>${s.posted_on?" · "+safe(s.posted_on):""}</li>`).join("")}</ul>
      <details class="office-history"><summary>הוספת מקור לאותו ליד</summary><form id="prospect-source">${sourceFields()}${fieldAlert}<button type="submit" class="button outline">שיוך מקור</button></form></details>
      ${actionRow('<button type="button" class="button outline" id="prospect-draft">הכנת טיוטת פנייה</button>')}
      <div id="prospect-draft-result"></div>`:""}`,trigger);
    const form=document.querySelector("#prospect-edit");
    form.onsubmit=event=>{
      event.preventDefault();
      submitting(form,async()=>{
        const fields=new FormData(form);
        const values={...Object.fromEntries(fields),sourceAllowed:fields.has("sourceAllowed"),version:p?.version};
        const result=await api("prospects"+(p?"/"+p.id:""),{method:p?"PUT":"POST",data:values});
        const linked=result.localProperty?" נמצא גם נכס באותה כתובת במלאי.":"";
        if(form.isConnected) finish((result.duplicate?"המקור כבר שויך לליד קיים.":"הליד נשמר.")+linked);
      });
    };
    const source=document.querySelector("#prospect-source");
    if(source) source.onsubmit=event=>{
      event.preventDefault();
      submitting(source,async()=>{
        const fields=new FormData(source);
        await api("prospects/"+p.id,{method:"PUT",data:{...Object.fromEntries(fields),sourceAllowed:fields.has("sourceAllowed"),addSource:true}});
        if(source.isConnected) finish("המקור שויך לליד.");
      });
    };
    const draft=document.querySelector("#prospect-draft");
    if(draft) draft.onclick=async()=>{
      const target=document.querySelector("#prospect-draft-result");
      try{
        const {message}=await api("prospects/"+p.id+"/draft");
        if(!target.isConnected) return;
        target.innerHTML=`<h3>טיוטה לעיון</h3><img src="${brandLogo}" alt="לוגו שפע נדל״ן" width="72" height="72">
          ${area("message","נוסח פנייה להעתקה",message,3000)}
          <button type="button" class="button outline">העתקת טיוטה</button><p role="status"></p>`;
        bindCopy(target);
      }catch(error){if(target.isConnected){target.innerHTML=fieldAlert;showMessage(target.firstElementChild,error.message);}}
    };
  }
  function bindCopy(target) {
    target.querySelector("button").onclick=async()=>{
      const field=target.querySelector("textarea");
      const status=target.querySelector("[role=status]");
      try{await navigator.clipboard.writeText(field.value);status.textContent="הטקסט הועתק.";}
      catch{field.focus();field.select();status.textContent="הטקסט סומן להעתקה.";}
    };
  }
  async function report(trigger) {
    try{
      const data=await api("prospects/report");
      const date=new Intl.DateTimeFormat("he-IL",{dateStyle:"short",timeStyle:"short",timeZone:"Asia/Jerusalem"});
      showEdit("דוח בעלי נכסים פרטיים מאומתים",`<p>${date.format(new Date(data.start))} עד ${date.format(new Date(data.end))}</p>
        <p>הדוח מוצג במשרד. שליחה מתוזמנת ל־WhatsApp ממתינה לחיבור.</p>
        <div id="prospect-report-copy">${area("message","תוכן הדוח",data.message,200000)}
        <button type="button" class="button outline">העתקת דוח</button><p role="status"></p></div>`,trigger);
      bindCopy(document.querySelector("#prospect-report-copy"));
    }catch(error){showMessage(root.querySelector("[role=alert]"),error.message);}
  }
  load();
}
