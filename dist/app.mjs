import {towns, townSlugs, types, properties, dealNames, parsePrice, filterProperties} from "./listings.mjs";
const showSamples = false; // sample listings stay hidden now that the office has real ones
if (!showSamples) properties.splice(0, properties.length);

import {initDialogs} from "./dialogs.mjs?v=11";
import {bindEngagement, isSaved, propertyUrl, syncSavedControls} from "./engagement.mjs";
import {brandContacts} from "./brand.mjs";
import {bindComparison,bindSavedSearch,compareControl} from "./compare-listings.mjs";

const filtersForm = document.querySelector("#filters");
const filterField = name => filtersForm.elements.namedItem(name);
const sort = document.querySelector("#sort");
const cards = document.querySelector("#cards");
const empty = document.querySelector("#empty");
const reset = document.querySelector("#reset");
const count = document.querySelector("#count");
const savedFilter = document.querySelector("#saved-filter");
const priceError = document.querySelector("#price-error");
const number = new Intl.NumberFormat("he-IL");
const safe = value => String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#${name}"/></svg>`;

for (const town of towns) filterField("town").add(new Option(town, town));
for (const type of types) filterField("type").add(new Option(type, type));

function priceLabel(property) {
  const period = property.deal === "rent" ? "<small>לחודש</small>" : "";
  return `<div class="price"><strong><bdi>₪ ${number.format(property.price)}</bdi></strong>${period}</div>`;
}

function badges(property) {
  return `<div class="badges"><span class="tag tag-${property.deal}">${dealNames[property.deal]}</span>${property.publishedAt?(property.status==="negotiation"?'<span class="tag tag-example">במשא ומתן</span>':""):'<span class="tag tag-example">נכס לדוגמה</span>'}</div>`;
}

function locationLabel(property) {
  const location = [property.town, property.neighborhood].filter(Boolean).join(" · ");
  return `<p class="location">${icon("pin")}${safe(location)}</p>`;
}

function facts(property) {
  return `<ul class="facts">
    ${property.rooms?`<li>${icon("rooms")} ${property.rooms} חדרים</li>`:""}
    ${property.area?`<li>${icon("area")} ${property.area} מ״ר</li>`:""}
    <li>${icon("home")} ${safe(property.type)}</li>
  </ul>`;
}

const PAGE_SIZE = 12;
let shown = PAGE_SIZE;
const isNew = property => property.publishedAt && Date.now() - Date.parse(property.publishedAt) < 14 * 86400000;

// Clean card: photo, price, title, location, three key facts, one clear action.
function propertyCard(property, index) {
  const url = propertyUrl(property.id);
  const facts = [
    property.rooms ? `${property.rooms} חד׳` : "",
    property.area ? `${number.format(property.area)} מ״ר` : "",
    property.lotArea && property.type !== "מגרש" ? `מגרש ${number.format(property.lotArea)} מ״ר` : "",
    property.floor === 0 ? "קומת קרקע" : property.floor ? `קומה ${property.floor}` : "",
  ].filter(Boolean);
  return `<article class="card listing-card" aria-labelledby="title-${property.id}">
    <div class="card-media">
      ${property.image||property.photo?`<img src="${safe(property.image??`/media/${property.photo}.webp`)}" alt="${safe(property.alt)}" ${index>2?'loading="lazy"':""} width="760" height="570">`:`<div class="card-no-photo">${icon("home")}<span>תמונות בקרוב</span></div>`}
      <div class="badges"><span class="tag tag-${property.deal}">${dealNames[property.deal]}</span>${property.status==="negotiation"?'<span class="tag tag-hot">במשא ומתן</span>':isNew(property)?'<span class="tag tag-new">חדש באתר</span>':""}</div>
      <button class="save-card" type="button" data-save="${property.id}" aria-label="שמירה: ${safe(property.title)}" aria-pressed="false">${icon("heart")}</button>
    </div>
    <div class="card-body">
      ${priceLabel(property)}
      <h3 id="title-${property.id}"><a href="${url}">${safe(property.title)}</a></h3>
      ${locationLabel(property)}
      ${facts.length?`<p class="card-facts">${facts.map(f=>`<span>${f}</span>`).join("")}</p>`:""}
    </div>
    <div class="card-actions">
      <a class="details" href="${url}" tabindex="-1" aria-hidden="true">לפרטים ולתמונות ${icon("left")}</a>
      <button type="button" class="card-whatsapp" data-whatsapp-property="${property.id}" aria-label="WhatsApp לגבי ${safe(property.title)}">${icon("chat")}<span>WhatsApp</span></button>
    </div>
  </article>`;
}

function renderResults() {
  const filters = Object.fromEntries(new FormData(filtersForm));
  const min = parsePrice(filters.min);
  const max = parsePrice(filters.max);
  const badMin = Number.isNaN(min);
  const badMax = Number.isNaN(max);
  const reversed = !badMin && !badMax && min !== null && max !== null && min > max;
  const error = badMin || badMax ? "יש להזין מחיר במספרים בלבד, עם או בלי פסיקים." :
    reversed ? "המחיר המקסימלי צריך להיות גבוה מהמחיר המינימלי או שווה לו." : "";

  filterField("min").setAttribute("aria-invalid", String(badMin || reversed));
  filterField("max").setAttribute("aria-invalid", String(badMax || reversed));
  priceError.hidden = !error;
  if (priceError.textContent !== error) priceError.textContent = error;
  document.querySelector("#price-label").textContent = filters.deal === "rent" ? "טווח מחיר לחודש (₪)" : "טווח מחיר (₪)";
  reset.hidden = !Object.values(filters).some(Boolean) && sort.value === "featured" && savedFilter.getAttribute("aria-pressed") !== "true";
  empty.hidden = true;

  if (error) {
    cards.replaceChildren();
    count.textContent = "יש לתקן את טווח המחיר כדי לראות תוצאות.";
    return false;
  }

  const selected = filterProperties({...filters, min, max}, sort.value);
  const results = savedFilter.getAttribute("aria-pressed") === "true" ? selected.filter(property => isSaved(property.id)) : selected;
  cards.innerHTML = results.slice(0, shown).map(propertyCard).join("");
  const more = document.querySelector("#show-more");
  more.hidden = results.length <= shown;
  more.textContent = `הצגת עוד נכסים (${results.length - shown})`;
  syncSavedControls();
  const sampleOnly=!properties.some(p=>p.publishedAt);
  count.textContent = results.length === 1 ? `נמצא נכס אחד${sampleOnly?" לדוגמה":""}` : `נמצאו ${results.length} נכסים${sampleOnly?" לדוגמה":""}`;
  empty.hidden = Boolean(results.length);
  document.querySelector("#no-results-inquiry").dataset.contact = "alert";
  // "Notify me" carries the current search into the request form.
  syncChips(filters);
  for (const button of document.querySelectorAll("#no-results-inquiry, #alert-me, #notify-similar")) {
    button.dataset.prefillDeal = filters.deal === "rent" ? "rent" : "buy";
    button.dataset.prefillTown = filters.town || "";
    button.dataset.prefillRooms = filters.rooms || "";
    button.dataset.prefillBudget = max ? String(max) : "";
  }
  document.querySelector("#empty-title").textContent = savedFilter.getAttribute("aria-pressed") === "true"
    ? "אין נכסים שמורים בתוצאות" : "אין נכסים שתואמים לחיפוש";
  return true;
}

// Quick filter buttons (town, rooms) drive the same form fields as the full filter panel.
const townChips = document.querySelector("#town-chips");
const moreFilters = document.querySelector(".more-filters");
const advanced = document.querySelector("#advanced-filters");
function buildTownChips() {
  const counts = new Map();
  for (const property of properties) counts.set(property.town, (counts.get(property.town) || 0) + 1);
  const top = [...counts].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 5);
  townChips.innerHTML = top.map(([town, n]) => `<button type="button" class="chip" data-chip="town" data-value="${safe(town)}">${safe(town)} <small>${n}</small></button>`).join("");
  townChips.hidden = !top.length;
}
function syncChips(filters) {
  for (const chip of filtersForm.querySelectorAll("[data-chip]")) chip.setAttribute("aria-pressed", String(filters[chip.dataset.chip] === chip.dataset.value));
  const chipValues = name => [...filtersForm.querySelectorAll(`[data-chip="${name}"]`)].map(chip => chip.dataset.value);
  const hidden = ["q", "type", "min", "max", "neighborhood", "minArea", "amenity"].filter(name => filters[name]).length
    + ["town", "rooms"].filter(name => filters[name] && !chipValues(name).includes(filters[name])).length;
  const badge = moreFilters.querySelector(".filter-count");
  badge.hidden = !hidden; badge.textContent = hidden;
  const savedCount = Number(document.querySelector("[data-saved-count]")?.textContent || 0);
  savedFilter.hidden = !savedCount && savedFilter.getAttribute("aria-pressed") !== "true";
}
filtersForm.addEventListener("click", event => {
  const chip = event.target.closest("[data-chip]");
  if (!chip) return;
  const field = filterField(chip.dataset.chip);
  field.value = field.value === chip.dataset.value ? "" : chip.dataset.value;
  filtersForm.dispatchEvent(new Event("input", {bubbles: true}));
});
moreFilters.addEventListener("click", () => {
  const open = moreFilters.getAttribute("aria-expanded") !== "true";
  moreFilters.setAttribute("aria-expanded", String(open));
  advanced.hidden = !open;
  if (open) filterField("q").focus();
});

function goToResults() {
  const heading = document.querySelector("#listings-title");
  heading.focus({preventScroll: true});
  document.querySelector("#listings").scrollIntoView({block: "start"});
}

function clearFilters() {
  filtersForm.reset();
  savedFilter.setAttribute("aria-pressed", "false");
  sort.value = "featured";
  renderResults();
}

filtersForm.addEventListener("input", () => { shown = PAGE_SIZE; renderResults(); });
document.querySelector("#show-more").addEventListener("click", () => {
  const first = shown;
  shown += PAGE_SIZE;
  renderResults();
  cards.children[first]?.querySelector("h3 a")?.focus();
});
filtersForm.addEventListener("submit", event => {
  event.preventDefault();
  if (renderResults()) {
    moreFilters.setAttribute("aria-expanded", "false");
    advanced.hidden = true;
    goToResults();
  } else {
    filtersForm.querySelector('[aria-invalid="true"]').focus();
  }
});
sort.addEventListener("change", renderResults);
reset.addEventListener("click", () => {
  clearFilters();
  document.querySelector("#listings-title").focus({preventScroll: true});
  document.querySelector("#listings").scrollIntoView({block: "start"});
});
document.querySelector("#empty-reset").addEventListener("click", () => {
  clearFilters();
  goToResults();
});

const townLinks = document.querySelector("#town-links");
for (const town of towns) {
  const link = document.createElement("a");
  link.href = `/areas/${townSlugs[town]}.html`;
  link.innerHTML = `${icon("pin")}<span></span>`;
  link.querySelector("span").textContent = town;
  townLinks.append(link);
}

savedFilter.addEventListener("click", () => {
  savedFilter.setAttribute("aria-pressed", String(savedFilter.getAttribute("aria-pressed") !== "true"));
  renderResults();
});
document.addEventListener("shefa:saved", () => {
  if (savedFilter.getAttribute("aria-pressed") !== "true") return;
  const previous = document.activeElement;
  renderResults();
  if (!previous.isConnected) savedFilter.focus();
});

const query = new URLSearchParams(location.search);
const deal = query.get("deal");
if (["sale", "rent"].includes(deal)) filterField("deal").value = deal;
const town = query.get("town");
if (towns.includes(town)) filterField("town").value = town;

bindEngagement();
initDialogs();
bindComparison(properties,cards);
bindSavedSearch(filtersForm,sort,renderResults);
renderResults();

try {
  const response=await fetch("/api/catalog");
  if(!response.ok) throw Error("catalog");
  const {properties:live}=await response.json();
  if(live.length){
    properties.unshift(...live);
    for(const [field,values] of [["town",live.map(p=>p.town)],["type",live.map(p=>p.type)]]) {
      const input=filterField(field);
      for(const value of new Set(values)) if(![...input.options].some(option=>option.value===value)) input.add(new Option(value,value));
    }
    if(query.get("town")&&[...filterField("town").options].some(option=>option.value===query.get("town"))) filterField("town").value=query.get("town");
    buildTownChips();
    document.querySelector("#listings-title").textContent="נכסים למכירה ולהשכרה";
    document.querySelector("#listings .section-caption").textContent="כל הנכסים שהמשרד משווק כרגע.";
    renderResults();
  }
} catch {
  document.querySelector("#catalog-error").hidden=false;
}
