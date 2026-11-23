const selected=new Set();
const safe=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const prices=new Intl.NumberFormat("he-IL");
export const compareControl=p=>`<button class="button outline compare-toggle" type="button" data-compare="${p.id}"
  aria-pressed="${selected.has(p.id)}" aria-label="השוואת ${safe(p.title)}">להשוואה</button>`;

export function bindComparison(properties,cards){
  const open=document.querySelector("#compare-open");
  const notice=document.querySelector("#compare-status");
  const dialog=document.querySelector("#compare-dialog");
  const heading=dialog.querySelector("h2");
  const rows=dialog.querySelector("#compare-data");
  function sync(){
    open.textContent="השוואה ("+selected.size+")";
    open.disabled=selected.size<2;
    for(const item of cards.querySelectorAll("[data-compare]")) item.setAttribute("aria-pressed",String(selected.has(item.dataset.compare)));
  }
  cards.addEventListener("click",event=>{
    const item=event.target.closest("[data-compare]");
    if(!item) return;
    const id=item.dataset.compare;
    if(selected.has(id)) selected.delete(id);
    else if(selected.size<4) selected.add(id);
    else{notice.textContent="אפשר להשוות עד ארבעה נכסים. הסירו נכס כדי להוסיף אחר.";return;}
    sync();
    notice.textContent=selected.size===1?"נבחר נכס אחד. אפשר להוסיף נכס נוסף להשוואה.":"מספר נכסים להשוואה "+selected.size;
  });
  open.onclick=()=>{
    const picked=[...selected].map(id=>properties.find(p=>p.id===id)).filter(Boolean);
    if(picked.length<2) return;
    const facts=[
      ["עסקה",p=>p.deal==="sale"?"מכירה":"השכרה"],
      ["יישוב",p=>p.town],
      ["שכונה",p=>p.neighborhood],
      ["סוג נכס",p=>p.type],
      ["מחיר מבוקש",p=>prices.format(p.price)+" ₪"+(p.deal==="rent"?" לחודש":"")],
      ["חדרים",p=>p.rooms],
      ["שטח בנוי",p=>p.area?p.area+" מ״ר":null],
      ["קומה",p=>p.floor],
      ["מאפיינים",p=>p.amenities?.join(", ")],
    ];
    rows.innerHTML=`<div tabindex="0" class="comparison-overflow" role="region" aria-label="טבלת השוואה"><table><thead><tr><th scope="col">פרט</th>
      ${picked.map(p=>`<th scope="col">${safe(p.title)}${!p.publishedAt?" · דוגמה":""}</th>`).join("")}</tr></thead>
      <tbody>${facts.map(([label,value])=>`<tr><th scope="row">${label}</th>${picked.map(p=>`<td>${safe(value(p)??"לא נמסר")||"לא נמסר"}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    dialog.showModal();
    heading.focus();
  };
  dialog.querySelector("button").onclick=()=>dialog.close();
  dialog.onclose=()=>open.focus();
  sync();
}

export function bindSavedSearch(form,sort,rerender){
  const save=document.querySelector("#search-save");
  const load=document.querySelector("#search-load");
  const notice=document.querySelector("#search-save-status");
  const key="shefa.saved.search.v1";
  function read(){
    try{return JSON.parse(localStorage.getItem(key));}catch{return null;}
  }
  load.disabled=!read();
  save.onclick=()=>{
    try{
      localStorage.setItem(key,JSON.stringify({fields:Object.fromEntries(new FormData(form)),sort:sort.value}));
      load.disabled=false;
      notice.textContent="החיפוש נשמר בדפדפן הזה.";
    }catch{notice.textContent="הדפדפן אינו מאפשר שמירת חיפושים.";}
  };
  load.onclick=()=>{
    const entry=read();
    if(!entry) return;
    for(const [name,value] of Object.entries(entry.fields??{})){
      const field=form.elements.namedItem(name);
      if(field&&typeof value==="string") field.value=value;
    }
    if([...sort.options].some(option=>option.value===entry.sort)) sort.value=entry.sort;
    rerender();
    notice.textContent="החיפוש השמור נטען.";
  };
}
