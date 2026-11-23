import {readFile,open,unlink} from "node:fs/promises";
import {DatabaseSync} from "node:sqlite";
import {localDatabase} from "./local-bindings.mjs";
import {officeBackupTables} from "../worker/office-backup.mjs";

const [source,dest]=process.argv.slice(2);
if(!source||!dest) throw Error("Usage: node scripts/restore-office.mjs snapshot.json new-backup.sqlite");
const snapshot=JSON.parse(await readFile(source,"utf8"));
if(snapshot.version!==1||!snapshot.tables||!officeBackupTables.every(table=>Array.isArray(snapshot.tables[table]))) throw Error("Unsupported snapshot");
await (await open(dest,"wx",0o600)).close();
let db;
let success=false;
try {
  localDatabase(dest).close();
  db=new DatabaseSync(dest);
  db.exec("PRAGMA foreign_keys=ON; BEGIN IMMEDIATE");
  for(const table of officeBackupTables){
    const columns=db.prepare("PRAGMA table_info("+table+")").all().map(row=>row.name);
    const statement=db.prepare(`INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(()=>"?").join(",")})`);
    for(const row of snapshot.tables[table]){
      if(!row||typeof row!=="object"||columns.some(name=>!Object.hasOwn(row,name))) throw Error("Schema mismatch in "+table);
      statement.run(...columns.map(name=>row[name]));
    }
  }
  if(db.prepare("PRAGMA foreign_key_check").all().length) throw Error("Foreign-key violation");
  if(db.prepare("PRAGMA integrity_check").get().integrity_check!=="ok") throw Error("Database integrity check failed");
  db.exec("COMMIT");
  success=true;
  console.log(JSON.stringify({restored:true,rows:Object.fromEntries(officeBackupTables.map(table=>[table,snapshot.tables[table].length]))}));
} finally {
  db?.close();
  if(!success) await unlink(dest);
}
