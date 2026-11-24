import assert from "node:assert/strict";
import test from "node:test";
import {neighborhoodFor, listingFilter} from "../dist/seo-areas.mjs";
import {injectListings} from "../worker/site-pages.mjs";
import {isIndexable} from "../worker/site-growth.mjs";

const props = [
  {id: "a", title: "דירת 5 חדרים", town: "גדרה", neighborhood: "גדרה מזרח (גולדה)", deal: "sale", price: 2890000, rooms: 5, area: 150},
  {id: "b", title: "בית <פרטי>", town: "גדרה", neighborhood: "המושבה הגרמנית", deal: "sale", price: 5550000, rooms: 6, area: 400},
  {id: "c", title: "דו-משפחתי", town: "גדרה", neighborhood: "אמירי גן", deal: "rent", price: 12000, rooms: 6, area: 350},
  {id: "d", title: "מגרש", town: "גדרה", neighborhood: "המושבה", deal: "sale", price: 7000000, area: 1319},
];
const catalog = () => new Response(JSON.stringify({properties: props}));

test("neighborhoods match exactly, not by prefix", () => {
  assert.equal(neighborhoodFor(props[0]).slug, "gedera-golda");
  assert.equal(neighborhoodFor(props[1]).slug, "gedera-german-colony");
  assert.equal(neighborhoodFor(props[3]).slug, "gedera-moshava");
  assert.equal(neighborhoodFor({town: "יבנה", neighborhood: "המושבה"}), null);
  assert.deepEqual(props.filter(listingFilter({town: "גדרה", deal: "sale"})).map(p => p.id), ["a", "b", "d"]);
});

test("area pages get the listings, a status line and an ItemList in the HTML", async () => {
  const page = `<head></head><p id="area-status" class="x" role="status">טוען נכסים…</p><div id="area-listings" class="cards" data-town="גדרה" data-deal="sale" data-neighborhood="gedera-german-colony" data-label="המושבה הגרמנית"><!--SSR--></div>`;
  const html = await injectListings(page, catalog, "https://x.test");
  assert.match(html, /data-ssr="1"/);
  assert.match(html, /href="\/listing\/b"/);
  assert.doesNotMatch(html, /href="\/listing\/a"/);
  assert.match(html, /בית &lt;פרטי&gt;/);
  assert.match(html, /נכס אחד שמשווק כרגע/);
  assert.match(html, /"@type":"ItemList"/);
});

test("empty area pages invite visitors to leave details", async () => {
  const page = `<head></head><p id="area-status">טוען נכסים…</p><div id="area-listings" data-town="יבנה" data-label="יבנה"><!--SSR--></div>`;
  const html = await injectListings(page, catalog, "https://x.test");
  assert.match(html, /כרגע אין נכסים מפורסמים ביבנה/);
});

test("homepage listings are in the HTML and pages without markers are untouched", async () => {
  const html = await injectListings("<!-- BEGIN LISTING LINKS --><!-- END LISTING LINKS -->", catalog, "https://x.test");
  assert.equal((html.match(/listing-card/g) || []).length, 4);
  assert.equal(await injectListings("<p>hi</p>", () => { throw Error("not called"); }, ""), "<p>hi</p>");
});

test("landing pages are indexable", () => {
  for (const path of ["/calculators/purchase-tax.html", "/areas/gedera-for-sale.html", "/areas/gedera-golda.html"]) assert.ok(isIndexable(path), path);
  assert.ok(!isIndexable("/calculators/../office.html"));
});
