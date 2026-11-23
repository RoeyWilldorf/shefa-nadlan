import {sourceAsOf, snapshots} from "./market-data.mjs";
import {externalLink, israelDate} from "./tool-views.mjs";

const govMarket = "https://www.gov.il/he/service/real_estate_information/";
const pageSize = 8;
const numeric = new Intl.NumberFormat("he-IL", {maximumFractionDigits: 0});
const number = value => numeric.format(value);
const currency = value => `<bdi>${number(value)} ₪</bdi>`;
const dateLabel = date => date.split("-").reverse().join(".");
const text = value => String(value).replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]);

export function monthCutoff(asOf, months) {
  const [year, month, day] = asOf.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month - months, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1 - months, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

export function selectDeals(listingId, mode, months, today) {
  const earliest = monthCutoff(today, months);
  return snapshots[listingId][mode].filter(([date]) => date >= earliest && date <= today);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function marketMarkup(property, backButton) {
  const {apartments, specific} = snapshots[property.id];
  const both = Boolean(apartments.length && specific.length);
  return `<div class="dialog-content market-dialog">
    ${backButton}
    <h2 id="dialog-title" tabindex="-1">עסקאות מכר באזור</h2>
    <p class="dialog-copy">${text(property.title)} · ${text(property.town)} · ${number(property.area)} מ״ר</p>
    ${property.deal === "rent" ? '<p class="market-rental-note">ההשוואה מציגה מחירי מכר באזור. דמי שכירות דורשים נתוני השכרה נפרדים.</p>' : ""}
    <div class="market-controls">
      <label class="field"><span>תקופה</span><select id="market-period"><option value="12">12 חודשים אחרונים</option><option value="24">24 חודשים אחרונים</option><option value="36" selected>36 חודשים אחרונים</option></select></label>
      ${both ? '<label class="field"><span>סוג השוואה</span><select id="market-mode"><option value="specific">סוג נכס דומה</option><option value="apartments">דירות בשטח דומה</option></select></label>' : ""}
    </div>
    <div class="market-source-bar">
      <p class="market-scope" id="market-scope"></p>
      ${externalLink(govMarket,"אימות במאגר רשות המסים")}
    </div>
    <div id="market-summary" class="market-summary" role="status" aria-atomic="true"></div>
    <div id="market-table" class="market-table" hidden>
      <table role="table" aria-label="עסקאות מכר להשוואה">
        <thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">מועד עסקה</th><th role="columnheader" scope="col">כתובת או גוש וחלקה</th><th role="columnheader" scope="col">סוג נכס</th><th role="columnheader" scope="col">שטח</th><th role="columnheader" scope="col">מחיר מכר</th><th role="columnheader" scope="col">₪ למ״ר</th></tr></thead>
        <tbody role="rowgroup" id="market-rows"></tbody>
      </table>
    </div>
    <p id="market-empty" class="market-empty" hidden>אין עסקאות מתאימות במדגם לתקופה שבחרתם. אפשר להרחיב את התקופה או לבדוק במאגר הרשמי.</p>
    <button type="button" class="button outline market-more" id="market-more" hidden>הצגת עסקאות נוספות</button>
    <div class="market-sources">
      <p class="detail-note">מדגם מנתוני עסקאות שדווחו לרשות המסים. באימות במאגר הרשמי חפשו לפי היישוב והכתובת או הגוש והחלקה, והשוו את התאריך והמחיר. עסקאות עשויות להתפרסם באיחור. הנתונים להתרשמות מהשוק ואינם שומת שווי.</p>
      <div class="external-links">${externalLink(snapshots[property.id].localitySource,"מקור נתוני היישוב · GoInfo")}</div>
    </div>
  </div>`;
}

function rowMarkup(row) {
  const [date, price, area, street, house, block, parcel, subparcel, type, rooms, source] = row;
  const address = street && house ? `${text(street)} ${text(house)}` : "";
  const registry = block && parcel ? `גוש ${text(block)} · חלקה ${text(parcel)}${subparcel ? ` · תת־חלקה ${text(subparcel)}` : ""}` : "";
  return `<tr role="row">
    <td role="cell" class="deal-date"><bdi>${dateLabel(date)}</bdi></td>
    <td role="cell" class="deal-address">${address ? `<strong>${address}</strong>` : ""}${registry ? `<small>${registry}</small>` : ""}
      ${source ? externalLink(source, "מקור העסקה") : ""}</td>
    <td role="cell" class="deal-type">${text(type ?? "דירה")}${rooms ? `<small>${text(rooms)} חדרים</small>` : ""}</td>
    <td role="cell" class="deal-area"><span class="mobile-deal-label">שטח </span>${number(area)} מ״ר</td>
    <td role="cell" class="deal-price"><span class="mobile-deal-label">מחיר </span>${currency(price)}</td>
    <td role="cell" class="deal-unit"><span class="mobile-deal-label">למ״ר </span>${currency(price / area)}</td>
  </tr>`;
}

export function bindMarket(container, property) {
  const data = snapshots[property.id];
  const period = container.querySelector("#market-period");
  const modeField = container.querySelector("#market-mode");
  const summary = container.querySelector("#market-summary");
  const scope = container.querySelector("#market-scope");
  const table = container.querySelector("#market-table");
  const rows = container.querySelector("#market-rows");
  const empty = container.querySelector("#market-empty");
  const more = container.querySelector("#market-more");
  let shown = pageSize;

  function render() {
    const mode = modeField?.value ?? (data.specific.length ? "specific" : "apartments");
    const results = selectDeals(property.id, mode, Number(period.value), israelDate());
    const areaText = `דירות בשטח ${number(data.range[0])}–${number(data.range[1])} מ״ר`;
    const location = data.neighborhood ? `${data.neighborhood}, ${property.town}` : property.town;
    scope.textContent = mode === "apartments"
      ? `מדגם ${areaText} · ${location} · קובץ המקור מעודכן ל־${dateLabel(sourceAsOf)}`
      : `מדגם לפי סוג נכס · ${location} · סוג הנכס ושטחו מוצגים בכל שורה.`;
    const count = results.length === 1 ? "עסקה אחת במדגם" : `${number(results.length)} עסקאות במדגם`;
    const latest = results.length ? `<span>עסקה אחרונה במדגם <bdi>${dateLabel(results[0][0])}</bdi></span>` : "";
    const metrics = results.length >= 5
      ? `<span>חציון מחיר מכר <strong>${currency(median(results.map(([, price]) => price)))}</strong></span>
         <span>חציון למ״ר <strong>${currency(median(results.map(([, price, area]) => price / area)))}</strong></span>`
      : "";
    summary.innerHTML = `<span>${count}</span>${latest}${metrics}`;
    table.hidden = !results.length;
    empty.hidden = Boolean(results.length);
    rows.innerHTML = results.slice(0, shown).map(rowMarkup).join("");
    more.hidden = results.length <= shown;
  }

  function resetPage() {
    shown = pageSize;
    render();
  }

  period.addEventListener("change", resetPage);
  modeField?.addEventListener("change", resetPage);
  more.addEventListener("click", () => {
    const previous = shown;
    shown += pageSize;
    render();
    const firstNewRow = rows.children[previous];
    if (firstNewRow) {
      firstNewRow.tabIndex = -1;
      firstNewRow.focus({preventScroll: true});
      firstNewRow.scrollIntoView({block: "nearest"});
    }
  });
  render();
}
