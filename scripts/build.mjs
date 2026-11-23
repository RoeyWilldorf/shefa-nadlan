import {mkdir,readFile,readdir,writeFile} from "node:fs/promises";
import {extname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";

const root=new URL("../",import.meta.url);
const dist=new URL("dist/",root);
const mime={
  ".html":"text/html; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8",".txt":"text/plain; charset=utf-8",".svg":"image/svg+xml",
  ".webp":"image/webp",".jpg":"image/jpeg",".ttf":"font/ttf",".xml":"application/xml; charset=utf-8",
};
export async function collectAssets(dir=dist,prefix="") {
  const result={};
  for (const entry of await readdir(dir,{withFileTypes:true})) {
    if (entry.name.startsWith(".") || !prefix&&entry.name==="server") continue;
    const key=join(prefix,entry.name);
    const filename=new URL(entry.name+(entry.isDirectory()?"/":""),dir);
    if (entry.isDirectory()) Object.assign(result,await collectAssets(filename,key));
    else if (mime[extname(key)]) {
      const type=mime[extname(key)];
      const data=await readFile(filename);
      result["/"+key]=type.includes("charset")||type.endsWith("svg+xml")?{mime:type,text:data.toString("utf8")}:{mime:type,base64:data.toString("base64")};
    }
  }
  return result;
}
if (import.meta.url===new URL(process.argv[1],`file://${process.cwd()}/`).href) {
  const assets=await collectAssets();
  await mkdir(new URL("server/",dist),{recursive:true});
  await mkdir(new URL(".openai/",dist),{recursive:true});
  const bundle=await build({
    stdin:{contents:`import {makeWorker} from "./worker/index.mjs"; export default makeWorker(${JSON.stringify(assets)});`,
      resolveDir:fileURLToPath(root),sourcefile:"site-worker.mjs"},
    format:"esm",bundle:true,platform:"browser",target:"es2022",minify:true,write:false,
  });
  const output=bundle.outputFiles[0].contents;
  await writeFile(new URL("server/index.js",dist),output);
  // Standalone build (Cloudflare Workers): same app, plus our own login/visitor layer.
  const migrationDir=new URL("drizzle/",root);
  const migrations=[];
  for (const name of (await readdir(migrationDir)).filter(name=>name.endsWith(".sql")).sort()) {
    migrations.push({name,sql:await readFile(new URL(name,migrationDir),"utf8")});
  }
  const standalone=await build({
    stdin:{contents:`import {makeWorker} from "./worker/index.mjs"; import {withSiteAuth} from "./worker/site-auth.mjs"; export default withSiteAuth(makeWorker(${JSON.stringify(assets)}),{migrations:${JSON.stringify(migrations)},guides:${JSON.stringify(Object.keys(assets).filter(key=>/^\/(guides|areas)\//.test(key)||key==="/valuation.html"))}});`,
      resolveDir:fileURLToPath(root),sourcefile:"standalone-worker.mjs"},
    format:"esm",bundle:true,platform:"browser",target:"es2022",minify:true,write:false,
  });
  await writeFile(new URL("server/standalone.js",dist),standalone.outputFiles[0].contents);
  await writeFile(new URL(".openai/hosting.json",dist),await readFile(new URL(".openai/hosting.json",root)));
  console.log(`Built Worker with ${Object.keys(assets).length} assets (${Buffer.byteLength(output)} bytes)`);
}
