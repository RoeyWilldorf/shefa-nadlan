// Area pages: show the office's live properties and the sample properties for one town.
import {properties, dealNames} from "./listings.mjs";

const box=document.querySelector("#area-listings");
const town=box?.dataset.town;
const nis=new Intl.NumberFormat("he-IL");
const safe=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function card(p) {
  const live=Boolean(p.publishedAt);
  const href=live?`/listing/${p.id}`:`/properties/${p.id}.html`;
  const image=p.image||(p.photo?`/media/${p.photo}.webp`:"");
  const facts=[p.rooms&&`${p.rooms} חדרים`,p.area&&`${p.area} מ״ר`].filter(Boolean).join(" · ");
  return `<article class="card area-card">
    <a class="card-media" href="${safe(href)}" tabindex="-1" aria-hidden="true">${image?`<img src="${safe(image)}" alt="" loading="lazy" width="760" height="420">`:""}
      <div class="badges"><span class="tag tag-${p.deal}">${dealNames[p.deal]}</span>${live?"":'<span class="tag tag-example">נכס לדוגמה</span>'}</div></a>
    <div class="card-body"><p class="location">${safe([p.town,p.neighborhood].filter(Boolean).join(" · "))}</p>
      <h3><a href="${safe(href)}">${safe(p.title)}</a></h3>${facts?`<p class="section-caption">${safe(facts)}</p>`:""}
      <p class="property-price"><bdi>${nis.format(p.price)} ₪</bdi>${p.deal==="rent"?" לחודש":""}</p></div>
  </article>`;
}
async function render() {
  let live=[];
  try {
    const response=await fetch("/api/catalog");
    if (response.ok) live=(await response.json()).properties??[];
  } catch {}
  const list=[...live.filter(p=>p.town===town),...properties.filter(p=>p.town===town)];
  const status=document.querySelector("#area-status");
  if (!list.length) {
    status.textContent=`כרגע אין נכסים מפורסמים ב${town}. השאירו פרטים ונעדכן אתכם כשיעלה נכס מתאים.`;
    box.replaceChildren();
    return;
  }
  status.textContent=list.length===1?"נכס אחד באזור":`${list.length} נכסים באזור`;
  box.innerHTML=list.map(card).join("");
}
if (box) render();
