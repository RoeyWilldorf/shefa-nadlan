import {createServer} from "node:http";
import {Readable} from "node:stream";
import {mkdir} from "node:fs/promises";
import {collectAssets} from "./build.mjs";
import {localDatabase,localBucket} from "./local-bindings.mjs";
import {makeWorker} from "../worker/index.mjs";

const state=".shefa-preview";
await mkdir(state,{recursive:true});
const email="office@example.invalid";
const env={DB:localDatabase(`${state}/office.sqlite`),BUCKET:localBucket(`${state}/objects`),OFFICE_OWNER_EMAIL:email,
  VISIT_ENCRYPTION_KEY:"42".repeat(32)};
const worker=makeWorker(await collectAssets());
const args=process.argv.slice(2);
const portOption=args.indexOf("--port");
const port=Number(process.env.PORT||(portOption>=0?args[portOption+1]:null)||4173);
createServer(async (incoming,outgoing)=>{
  const forwardedHost=incoming.headers["x-forwarded-host"];
  const protocol=incoming.headers["x-forwarded-proto"]||"http";
  const origin=`${protocol}://${forwardedHost||incoming.headers.host}`;
  const url=new URL(incoming.url,origin);
  const headers=new Headers(incoming.headers);
  headers.set("oai-authenticated-user-id","shefa-local-owner");
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
    outgoing.end("Local preview error");
  }
}).listen(port,"0.0.0.0",()=>console.log(`Shefa preview: http://127.0.0.1:${port}/`));
