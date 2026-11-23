// Production-ish entry point for a standalone free-tier host (e.g. Render).
//
// The real app expects an authenticated-identity header ("oai-authenticated-user-id")
// supplied by OpenAI's app hosting platform for every visitor. Outside that platform
// there is no such login system, so this file protects the WHOLE site behind a single
// shared HTTP Basic-Auth password (set via the SITE_PASSWORD env var) and then treats
// anyone who passed that gate as the authenticated office owner - exactly like
// scripts/preview.mjs does for local development. This keeps the app's own logic
// untouched and makes the behavior here identical to the local preview, just reachable
// over the internet instead of only on 127.0.0.1.
//
// This is meant as a private, password-protected preview while the business sets up
// its real hosting (OpenAI platform, or a proper multi-tenant deployment). Storage is
// local SQLite + local files on the host's disk: fine for trying the app, but NOT
// durable - a redeploy or the free instance spinning down can erase it.
import {createServer} from "node:http";
import {Readable} from "node:stream";
import {mkdir} from "node:fs/promises";
import {collectAssets} from "./build.mjs";
import {localDatabase,localBucket} from "./local-bindings.mjs";
import {makeWorker} from "../worker/index.mjs";

const state=process.env.DATA_DIR||".shefa-data";
await mkdir(state,{recursive:true});
const email=process.env.OFFICE_OWNER_EMAIL||"owner@shefa-nadlan.local";
const env={DB:localDatabase(`${state}/office.sqlite`),BUCKET:localBucket(`${state}/objects`),OFFICE_OWNER_EMAIL:email,
  VISIT_ENCRYPTION_KEY:process.env.VISIT_ENCRYPTION_KEY||"42".repeat(32)};
const worker=makeWorker(await collectAssets());

const siteUser=process.env.SITE_USER||"shefa";
const sitePassword=process.env.SITE_PASSWORD;
if (!sitePassword) {
  console.error("SITE_PASSWORD is not set - refusing to start without it (this would publish the site with no access control).");
  process.exit(1);
}
function unauthorized(outgoing) {
  outgoing.writeHead(401,{"WWW-Authenticate":'Basic realm="Shefa Nadlan - private preview"'});
  outgoing.end("Authentication required.");
}

const port=Number(process.env.PORT||4173);
createServer(async (incoming,outgoing) => {
  const auth=incoming.headers.authorization;
  if (!auth||!auth.startsWith("Basic ")) return unauthorized(outgoing);
  const [user,pass]=Buffer.from(auth.slice(6),"base64").toString("utf8").split(":");
  if (user!==siteUser||pass!==sitePassword) return unauthorized(outgoing);

  const forwardedHost=incoming.headers["x-forwarded-host"];
  const protocol=incoming.headers["x-forwarded-proto"]||"https";
  const origin=`${protocol}://${forwardedHost||incoming.headers.host}`;
  const url=new URL(incoming.url,origin);
  const headers=new Headers(incoming.headers);
  headers.delete("authorization");
  headers.set("oai-authenticated-user-id","shefa-owner");
  headers.set("oai-authenticated-user-email",email);
  try {
    const options={method:incoming.method,headers};
    if (!["GET","HEAD"].includes(incoming.method)) {
      options.body=Readable.toWeb(incoming);
      options.duplex="half";
    }
    const response=await worker.fetch(new Request(url,options),env);
    outgoing.writeHead(response.status,Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing);
    else outgoing.end();
  } catch(error) {
    console.error(error.message);
    outgoing.writeHead(500);
    outgoing.end("Server error");
  }
}).listen(port,"0.0.0.0",()=>console.log(`Shefa Nadlan (private preview) listening on port ${port}`));
