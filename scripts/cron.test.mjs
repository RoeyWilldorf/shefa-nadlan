import assert from "node:assert/strict";
import test from "node:test";
import {remindLeads, weeklyReport, israelHour} from "../worker/site-cron.mjs";
import {soldCard, injectSold} from "../worker/site-pages.mjs";

function fakeDb(results) {
  const writes = [];
  const prepare = sql => ({sql, bind: (...args) => ({sql, args, all: async () => ({results: sql.includes("FROM office_leads l") ? results : []}), run: async () => {}})});
  return {writes, prepare, batch: async list => { writes.push(...list); return []; }};
}

test("Israel hour", () => {
  assert.equal(israelHour(new Date("2026-11-24T10:00:00Z")), 12); // winter, UTC+2
  assert.equal(israelHour(new Date("2026-07-01T10:00:00Z")), 13); // summer, UTC+3
});

test("lead reminders: sent once in working hours, skipped at night and without email setup", async () => {
  const lead = {id: "l1", intent: "buy", created_at: "2026-11-24T06:00:00Z", name: "דנה", phone: "050-1234567"};
  const sentMail = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sentMail.push(JSON.parse(init.body)); return new Response("{}", {status: 200}); };
  try {
    const env = {RESEND_API_KEY: "k", NOTIFY_EMAIL: "a@b.c", DB: fakeDb([lead])};
    assert.equal(await remindLeads(env, "https://x.test", new Date("2026-11-24T10:00:00Z")), 1);
    assert.match(sentMail[0].subject, /פנייה מחכה/);
    assert.match(sentMail[0].html, /wa\.me\/972501234567/);
    assert.equal(env.DB.writes.length, 1);
    assert.equal(await remindLeads(env, "https://x.test", new Date("2026-11-24T21:30:00Z")), 0); // 23:30 in Israel
    assert.equal(await remindLeads({DB: fakeDb([lead])}, "https://x.test", new Date("2026-11-24T10:00:00Z")), 0);
  } finally { globalThis.fetch = realFetch; }
});

test("weekly report needs email setup", async () => {
  assert.equal(await weeklyReport({DB: fakeDb([])}, "https://x.test", async () => new Response("{}"), {}), false);
});

test("sold gallery: shown only when there are closed deals, never with prices", async () => {
  const page = '<section class="sold-section" hidden aria-labelledby="t"><div id="sold-listings"><!--SOLD--></div></section>';
  assert.equal(await injectSold(page, async () => new Response(JSON.stringify({properties: []}))), page);
  const html = await injectSold(page, async () => new Response(JSON.stringify({properties: [{id: "a", title: "דירה", town: "גדרה", status: "sold", rooms: 4, closedAt: "2026-10-01T10:00:00Z"}]})));
  assert.match(html, /<section class="sold-section" aria/);
  assert.match(html, /נמכר/);
  assert.doesNotMatch(soldCard({title: "x", status: "rented"}), /₪/);
});
