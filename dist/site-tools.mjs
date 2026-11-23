import {brandContacts} from "./brand.mjs";
import {properties} from "./listings.mjs";
import {propertyUrl} from "./engagement.mjs";

const key="shefa-display-settings";
const normal={large:false,links:false,motion:false,left:false,compact:false};
const generalMessage="שלום, הגעתי דרך האתר של שפע נדל״ן ואשמח לקבל פרטים.";
const chatIcon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 11.8a8.5 8.5 0 0 1-12.6 7.5L3.5 20.5l1.2-4.3a8.5 8.5 0 1 1 15.8-4.4Z"/><path d="M9 8c-.6-.7-1.4-.4-1.6.4-.4 2 1.4 4.5 3.2 5.8 1.5 1 3.5 1.8 4.7 1 .8-.5.7-1.1.3-1.4l-1.8-1c-.7-.4-.8.5-1.2.6-.5.1-2.2-1.4-2.5-1.9-.4-.6.8-.9.4-1.6L9 8Z"/></svg>';
const displayIcon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.5" r="1.7"/><path d="m4 8 8 2 8-2M12 10v4m0 0-4 6m4-6 4 6"/></svg>';

export function contactHref(contact,origin,property){
  const deal=property?.deal==="rent"?"להשכרה":"למכירה";
  const message=property
    ? `שלום, הגעתי דרך האתר של שפע נדל״ן ואשמח לקבל פרטים על ${property.title} ${deal} ב${property.town} (נכס ${property.id}${property.publishedAt?"":" · דוגמה"}).\n${new URL(propertyUrl(property.id),origin).href}`
    : generalMessage;
  return `https://wa.me/${contact.tel.slice(1)}?text=${encodeURIComponent(message)}`;
}

function read(){
  try{
    const saved=JSON.parse(localStorage.getItem(key));
    return Object.fromEntries(Object.keys(normal).map(name=>[name,saved?.[name]===true]));
  }catch{return {...normal};}
}

function init(publicSite){
  let settings=read();
  let opener;
  const body=document.body;
  const shortcuts=document.createElement("div");
  shortcuts.className="site-shortcuts";
  shortcuts.innerHTML=`${publicSite?`<button class="site-tool site-tool-whatsapp" type="button" data-open-whatsapp aria-haspopup="dialog">${chatIcon}<span><bdi lang="en">WhatsApp</bdi></span></button>`:""}
    <button class="site-tool site-tool-display" type="button" data-open-display aria-haspopup="dialog">${displayIcon}<span>נגישות</span></button>`;
  const dialogs=document.createElement("div");
  dialogs.innerHTML=`${publicSite?`<dialog class="site-tool-dialog" id="site-whatsapp" aria-labelledby="site-whatsapp-title"><div class="site-tool-panel">
    <h2 id="site-whatsapp-title" tabindex="-1">יצירת קשר עם שפע נדל״ן</h2>
    <p class="contact-context" hidden></p>
    <ul class="site-contacts">${[...brandContacts].reverse().map(contact=>`<li><h3>${contact.name} <bdi>${contact.display}</bdi></h3><div class="contact-actions">
      <a class="button site-whatsapp-link" data-chat href="${contactHref(contact,location.origin)}" rel="noreferrer" aria-label="שליחת הודעת WhatsApp ל${contact.name}">שליחת הודעת <bdi lang="en">WhatsApp</bdi></a>
      <a class="button site-phone-link" href="tel:${contact.tel}" aria-label="התקשרות טלפונית ל${contact.name} ${contact.display}">התקשרות טלפונית</a></div></li>`).join("")}</ul>
    <div class="site-panel-actions"><button type="button" class="button outline" data-compact>מזעור כפתור WhatsApp</button><button type="button" class="button outline" data-close>סגירה</button></div>
  </div></dialog>`:""}
  <dialog class="site-tool-dialog" id="site-display" aria-labelledby="site-display-title"><div class="site-tool-panel">
    <h2 id="site-display-title" tabindex="-1">התאמות נגישות</h2>
    <fieldset class="site-preferences"><legend>תצוגה בדפדפן זה</legend>
    <label><input type="checkbox" name="large"> הגדלת טקסט</label>
    <label><input type="checkbox" name="links"> הדגשת קישורים</label>
    <label><input type="checkbox" name="motion"> הפחתת תנועה</label>
    ${publicSite?'<label><input type="checkbox" name="left"> העברת כפתור WhatsApp לשמאל</label><label><input type="checkbox" name="compact"> הצגת WhatsApp כסמל בלבד</label>':""}</fieldset>
    <a class="inline-link site-statement-link" href="/accessibility.html">הצהרת נגישות ודיווח על תקלה</a>
    <div class="site-panel-actions"><button type="button" class="button outline" data-reset>איפוס תצוגה</button><button type="button" class="button outline" data-close>סגירה</button></div>
  </div></dialog>`;
  body.append(shortcuts,dialogs);
  const display=dialogs.querySelector("#site-display");
  const whatsapp=dialogs.querySelector("#site-whatsapp");
  const launch=shortcuts.querySelector("[data-open-whatsapp]");
  launch?.setAttribute("aria-label","WhatsApp – יצירת קשר עם רועי או שרל");
  const activeSelection=()=>properties.find(property=>propertyUrl(property.id)===location.pathname);

  function apply(persist=false){
    for(const name of ["large","links","motion"]) document.documentElement.classList.toggle(`display-${name}`,settings[name]);
    shortcuts.classList.toggle("tool-left",settings.left);
    shortcuts.classList.toggle("tool-compact",settings.compact);
    for(const input of display.querySelectorAll("input")) input.checked=settings[input.name];
    if(persist) try{localStorage.setItem(key,JSON.stringify(settings));}catch{}
  }
  apply();
  function open(dialog,trigger){
    opener=trigger;
    dialog.showModal();
    dialog.querySelector("h2").focus();
  }
  shortcuts.querySelector("[data-open-display]").onclick=event=>open(display,event.currentTarget);
  display.addEventListener("change",event=>{settings[event.target.name]=event.target.checked;apply(true);});
  display.querySelector("[data-reset]").onclick=()=>{settings={...normal};apply(true);};
  if(whatsapp){
    const openContacts=(trigger,property)=>{
      const context=whatsapp.querySelector(".contact-context");
      context.hidden=!property;
      context.textContent=property?property.title+" · "+property.town:"";
      [...whatsapp.querySelectorAll("[data-chat]")].forEach((link,index)=>{
        link.href=contactHref(brandContacts[brandContacts.length-1-index],location.origin,property);
      });
      open(whatsapp,trigger);
    };
    launch.onclick=()=>openContacts(launch,activeSelection());
    document.addEventListener("click",event=>{
      const trigger=event.target.closest("[data-whatsapp-property]");
      if(trigger) openContacts(trigger,properties.find(p=>p.id===trigger.dataset.whatsappProperty));
    });
    whatsapp.querySelector("[data-compact]").onclick=()=>{settings.compact=true;apply(true);whatsapp.close();};
  }
  function revealFocus(){
    const active=document.activeElement;
    if(active===body||active.closest("dialog")||shortcuts.contains(active)) return;
    const target=active.getBoundingClientRect();
    if([...shortcuts.children].some(element=>{
      const item=element.getBoundingClientRect();
      return target.bottom+4>item.top&&target.top-4<item.bottom&&target.right+4>item.left&&target.left-4<item.right;
    })) active.scrollIntoView({block:"center",inline:"nearest",behavior:"instant"});
  }
  document.addEventListener("focusin",()=>requestAnimationFrame(revealFocus));
  dialogs.querySelectorAll("dialog").forEach(dialog=>{
    dialog.querySelector("[data-close]").onclick=()=>dialog.close();
    dialog.addEventListener("keydown",event=>{
      if(event.key!=="Tab") return;
      const controls=[...dialog.querySelectorAll("a[href], button, input")];
      const first=controls[0],last=controls.at(-1),active=document.activeElement;
      if((!event.shiftKey&&active===last)||(event.shiftKey&&(active===first||active.matches("h2")))){
        event.preventDefault();
        (event.shiftKey?last:first).focus();
      }
    });
    dialog.addEventListener("close",()=>{
      if(opener?.isConnected) opener.focus();
      else if(dialog===whatsapp) launch.focus();
    });
  });
}

if(typeof document!=="undefined"&&document.body.dataset.siteTools) init(document.body.dataset.siteTools==="public");

// "שיתוף הנכס": native share sheet on phones, WhatsApp share as a fallback.
if(typeof document!=="undefined") document.addEventListener("click",async event=>{
  const button=event.target.closest("[data-share-listing]");
  if(!button) return;
  const title=document.querySelector("h1")?.textContent.trim()||document.title;
  const url=location.origin+location.pathname;
  if(navigator.share){
    try{await navigator.share({title,text:`${title} · שפע נדל״ן`,url});return;}
    catch(error){if(error?.name==="AbortError")return;}
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(`${title} · שפע נדל״ן\n${url}`)}`,"_blank","noopener");
});
