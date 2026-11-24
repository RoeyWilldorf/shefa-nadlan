// Instant price check on the valuation page: median deal prices from the government
// real-estate site (open data) for the owner's town, neighborhood and room count, followed by
// a request for an exact valuation from the office (a seller lead).
import {get, findTown, findNeighborhood, latest} from "./market.mjs?v=3";

const form = document.getElementById("quick-value");
const out = document.getElementById("quick-value-result");
const hoods = form?.elements.neighborhood;
const nis = value => `${new Intl.NumberFormat("he-IL").format(Math.round(value))} ₪`;
const short = value => value >= 1e6 ? `${(value / 1e6).toFixed(2).replace(/\.?0+$/, "")} מיליון ₪` : nis(value);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let index = null, townPage = null;

async function loadTown() {
  hoods.replaceChildren(new Option("כל העיר", ""));
  townPage = null;
  const name = form.elements.town.value.trim();
  if (!name) return;
  try {
    index ??= await get("index/setl_types.json");
    const id = findTown(index, name);
    if (!id) return;
    townPage = await get(`pages/settlement/buy/${id}.json`);
    for (const n of [...(townPage.otherNeighborhoods || [])].sort((a, b) => a.title.localeCompare(b.title, "he"))) hoods.add(new Option(n.title, n.id));
  } catch {}
}

function roomsEntry(page, rooms) {
  const list = page?.trends?.rooms || [];
  return list.find(r => String(r.numRooms) === rooms && r.hasDeals) || list.find(r => r.numRooms === "all");
}

async function show(event) {
  event?.preventDefault();
  const town = form.elements.town.value.trim();
  const rooms = form.elements.rooms.value;
  if (!town) { form.elements.town.focus(); return; }
  out.hidden = false;
  out.innerHTML = '<p class="quick-loading">בודקים עסקאות באזור…</p>';
  if (!townPage || !findTown({x: {SETL_NAME: townPage.settlementName}}, town)) await loadTown();
  if (!townPage) {
    out.innerHTML = `<p>לא מצאנו נתונים עבור "${esc(town)}". בדקו את שם היישוב, או השאירו פרטים ונבדוק בשבילכם.</p>${cta(town, rooms)}`;
    return;
  }
  let hood = null;
  if (hoods.value) hood = await get(`pages/neighborhood/buy/${hoods.value}.json`).catch(() => null);
  const cityEntry = roomsEntry(townPage, rooms);
  const city = cityEntry && latest(cityEntry.graphData, "settlementPrice");
  const hoodEntry = hood && roomsEntry(hood, rooms);
  const near = hoodEntry && latest(hoodEntry.graphData, "neighborhoodPrice");
  const label = cityEntry && Number(cityEntry.numRooms) > 0 ? `${cityEntry.numRooms} חדרים` : "כל הדירות";
  const tiles = [];
  if (near) tiles.push([`חציון בשכונת ${esc(hood.neighborhoodName)}`, short(near.price), `${label} · ${near.when}`]);
  if (city) tiles.push([`חציון ב${esc(townPage.settlementName)}`, short(city.price), `${label} · ${city.when}`]);
  if (city?.country) tiles.push(["חציון ארצי", short(city.country), `${label} · ${city.when}`]);
  const change = cityEntry?.summary?.priceDifferencePercentage;
  if (change != null) tiles.push(["שינוי בשנה האחרונה", `<span dir="ltr">${Number(change) > 0 ? "+" : ""}${Number(change).toFixed(1)}%</span>`, `מחירים ב${esc(townPage.settlementName)}`]);
  const byRooms = (townPage.trends?.rooms || []).filter(r => Number(r.numRooms) > 0).map(r => [r.numRooms, latest(r.graphData, "settlementPrice")]).filter(([, v]) => v);
  out.innerHTML = tiles.length ? `
    <h3>מחירי עסקאות ב${esc(townPage.settlementName)}${near ? ` · ${esc(hood.neighborhoodName)}` : ""}</h3>
    <dl class="market-grid">${tiles.map(([k, v, s]) => `<div><dt>${k}</dt><dd>${v}</dd><span>${s}</span></div>`).join("")}</dl>
    ${byRooms.length ? `<div class="table-wrap"><table class="data-table"><caption>חציון מחירים לפי מספר חדרים ב${esc(townPage.settlementName)}</caption><thead><tr><th scope="col">חדרים</th><th scope="col">מחיר חציוני</th><th scope="col">רבעון</th></tr></thead><tbody>${byRooms.map(([n, v]) => `<tr><td>${n}</td><td>${nis(v.price)}</td><td>${v.when}</td></tr>`).join("")}</tbody></table></div>` : ""}
    <p class="detail-note">לפי עסקאות שדווחו לרשות המסים (אתר הנדל״ן הממשלתי). חציון הוא נקודת פתיחה: המחיר של נכס מסוים תלוי בשטח, בקומה, במצב, בחניה, בממ״ד ובנוף.</p>
    ${cta(townPage.settlementName, rooms)}`
    : `<p>אין מספיק עסקאות מדווחות לבדיקה מיידית ב${esc(townPage.settlementName)}. השאירו פרטים ונכין לכם הערכה לפי עסקאות דומות.</p>${cta(townPage.settlementName, rooms)}`;
  out.querySelector("h3")?.setAttribute("tabindex", "-1");
  out.querySelector("h3")?.focus();
}

const cta = (town, rooms) => `<div class="quick-cta"><div><strong>רוצים מספר מדויק לנכס שלכם?</strong><p>נשווה את הנכס לעסקאות דומות ברחוב ובשכונה ונחזור אליכם עם טווח מחיר מומלץ - בלי עלות ובלי התחייבות.</p></div>
  <button class="button primary" type="button" data-contact="valuation" data-prefill-town="${esc(town)}" data-prefill-rooms="${esc(rooms === "all" ? "" : rooms)}">לקבלת הערכה מדויקת</button></div>`;

if (form) {
  form.elements.town.addEventListener("change", loadTown);
  form.addEventListener("submit", show);
  const preset = new URLSearchParams(location.search).get("town");
  if (preset) { form.elements.town.value = preset; loadTown(); }
}
