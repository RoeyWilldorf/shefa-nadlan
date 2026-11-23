import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
import {mkdir,readFile,writeFile,unlink} from "node:fs/promises";
import {join} from "node:path";

const migrations=new URL("../drizzle/",import.meta.url);
export function localDatabase(filename=":memory:") {
  const db=new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS _local_migrations(name TEXT PRIMARY KEY);");
  for (const name of readdirSync(migrations).filter(name=>name.endsWith(".sql")).sort()) {
    if (db.prepare("SELECT name FROM _local_migrations WHERE name=?").get(name)) continue;
    db.exec("BEGIN");
    try {
      db.exec(readFileSync(new URL(name,migrations),"utf8"));
      db.prepare("INSERT INTO _local_migrations VALUES (?)").run(name);
      db.exec("COMMIT");
    } catch(error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  function prepare(sql) {
    const statement=db.prepare(sql);
    function bind(...values){return {
      sql,
      reads:/^SELECT\b/i.test(sql.trim()),
      run(){const result=statement.run(...values);return {meta:{changes:result.changes}};},
      first(){return statement.get(...values)??null;},
      all(){return {results:statement.all(...values)};},
    };}
    return {bind,...bind()};
  }
  return {prepare,batch(entries){
    db.exec("BEGIN");
    try {
      const results=entries.map(statement=>statement.reads?statement.all():statement.run());
      db.exec("COMMIT");
      return results;
    } catch(error) {
      db.exec("ROLLBACK");
      throw error;
    }
  },close(){db.close();}};
}

export function localBucket(directory) {
  const memory=new Map();
  const file=key=>join(directory,key.replaceAll("/","_"));
  return {
    async put(key,bytes) {
      if (!directory) memory.set(key,bytes);
      else {
        await mkdir(directory,{recursive:true});
        await writeFile(file(key),bytes);
      }
    },
    async get(key) {
      if (!directory) return memory.has(key)?{body:memory.get(key)}:null;
      try {return {body:await readFile(file(key))};} catch(error) {
        if (error.code==="ENOENT") return null;
        throw error;
      }
    },
    async delete(key) {
      if (!directory) memory.delete(key);
      else await unlink(file(key)).catch(error=>{if(error.code!=="ENOENT") throw error;});
    },
  };
}
