// Server-side listings for public pages, so search engines (and visitors on slow phones)
// get the real properties in the HTML itself instead of waiting for JavaScript.
//   Area/neighborhood pages: <div id="area-listings" data-town data-deal data-neighborhood><!--SSR--></div>
//   Homepage: the block between <!-- BEGIN LISTING LINKS --> and <!-- END LISTING LINKS -->
import {listingFilter, inPlace} from "../dist/seo-areas.mjs";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const nis = value => `${new Intl.NumberFormat("he-IL").format(value)} ₪`;
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#${name}"/></svg>`;
const attr = (tag, name) => (tag.match(new RegExp(`data-${name}="([^"]*)"`)) || [])[1] || "";
const unesc = value => value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export function listingCard(p, index = 0) {
  const href = `/listing/${p.id}`;
  const facts = [p.rooms && `${p.rooms} חד׳`, p.area && `${new Intl.NumberFormat("he-IL").format(p.area)} מ״ר`].filter(Boolean);
  return `<article class="card listing-card"><div class="card-media">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.alt || p.title)}" ${index > 2 ? 'loading="lazy"' : ""} width="760" height="570">` : `<div class="card-no-photo">${icon("home")}<span>תמונות בקרוב</span></div>`}
    <div class="badges"><span class="tag tag-${p.deal}">${p.deal === "rent" ? "להשכרה" : "למכירה"}</span>${p.status === "negotiation" ? '<span class="tag tag-hot">במשא ומתן</span>' : ""}</div></div>
    <div class="card-body"><p class="price"><bdi>${nis(p.price)}</bdi>${p.deal === "rent" ? " <small>לחודש</small>" : ""}</p>
    <h3><a href="${href}">${esc(p.title)}</a></h3><p class="location">${icon("pin")}${esc([p.town, p.neighborhood].filter(Boolean).join(" · "))}</p>
    ${facts.length ? `<p class="card-facts">${facts.map(f => `<span>${f}</span>`).join("")}</p>` : ""}</div></article>`;
}

function itemList(list, origin) {
  const data = {"@context": "https://schema.org", "@type": "ItemList", itemListElement: list.slice(0, 30).map((p, i) => ({"@type": "ListItem", position: i + 1, url: `${origin}/listing/${p.id}`, name: p.title}))};
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

export async function injectListings(html, loadCatalog, origin) {
  const area = html.match(/<div id="area-listings"[^>]*><!--SSR--><\/div>/);
  const home = html.includes("<!-- BEGIN LISTING LINKS -->");
  if (!area && !home) return html;
  let properties = [];
  try {
    const response = await loadCatalog();
    if (!response.ok) return html;
    properties = (await response.json()).properties ?? [];
  } catch { return html; }
  if (area) {
    const tag = area[0];
    const filter = listingFilter({town: unesc(attr(tag, "town")), deal: attr(tag, "deal"), neighborhood: attr(tag, "neighborhood")});
    const list = properties.filter(filter);
    const place = unesc(attr(tag, "label") || attr(tag, "town"));
    const status = list.length ? (list.length === 1 ? "נכס אחד שמשווק כרגע" : `${list.length} נכסים שמשווקים כרגע`)
      : `כרגע אין נכסים מפורסמים ${inPlace(place)}. השאירו פרטים ונעדכן אתכם ראשונים כשיעלה נכס מתאים.`;
    html = html.replace(tag, tag.replace("<!--SSR-->", list.map(listingCard).join("")).replace('<div id="area-listings"', '<div id="area-listings" data-ssr="1"'))
      .replace(/(<p id="area-status"[^>]*>)טוען נכסים…(<\/p>)/, `$1${esc(status)}$2`);
    if (list.length) html = html.replace("</head>", `${itemList(list, origin)}\n</head>`);
  }
  if (home && properties.length) {
    html = html.replace(/<!-- BEGIN LISTING LINKS -->[\s\S]*?<!-- END LISTING LINKS -->/,
      `<!-- BEGIN LISTING LINKS -->${properties.slice(0, 12).map(listingCard).join("")}<!-- END LISTING LINKS -->`);
  }
  return html;
}
