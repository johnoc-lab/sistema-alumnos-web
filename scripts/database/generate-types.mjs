import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { format } from "prettier";
import {
  createEmbedded,
  migrate,
  projectRoot,
} from "../../tests/database/engine.mjs";
const db = await createEmbedded();
const jsType = (kind, udt) => {
  if (kind === "ARRAY") return jsType("", udt.slice(1)) + "[]";
  if (
    [
      "uuid",
      "text",
      "varchar",
      "bpchar",
      "timestamptz",
      "timestamp",
      "date",
      "time",
      "timetz",
    ].includes(udt)
  )
    return "string";
  if (
    ["int2", "int4", "int8", "numeric", "float4", "float8", "oid"].includes(udt)
  )
    return "number";
  if (udt === "bool") return "boolean";
  if (["json", "jsonb"].includes(udt)) return "Json";
  throw new Error(
    "Tipo SQL sin correspondencia explícita: " + kind + "/" + udt,
  );
};
try {
  await migrate(db);
  const { rows: columns } = await db.query(
    "SELECT table_name,column_name,is_nullable,column_default,is_generated,data_type,udt_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position",
  );
  const { rows: fks } =
    await db.query(`SELECT c.conname,n.relname AS source,ref.relname AS target,
 (SELECT json_agg(a.attname ORDER BY k.ord) FROM unnest(c.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num) AS columns,
 (SELECT json_agg(a.attname ORDER BY k.ord) FROM unnest(c.confkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num) AS targets,
 EXISTS(SELECT 1 FROM pg_constraint u WHERE u.conrelid=c.conrelid AND u.contype IN('p','u') AND u.conkey <@ c.conkey) AS one_to_one
 FROM pg_constraint c JOIN pg_class n ON n.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=n.relnamespace
 JOIN pg_class ref ON ref.oid=c.confrelid JOIN pg_namespace rn ON rn.oid=ref.relnamespace
 WHERE c.contype='f' AND ns.nspname='public' AND rn.nspname='public' ORDER BY n.relname,c.conname`);
  const { rows: functions } =
    await db.query(`SELECT p.proname,t.typname AS result,
 (SELECT json_agg(json_build_object('name',p.proargnames[k.ord],'type',at.typname) ORDER BY k.ord) FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY k(oid,ord) JOIN pg_type at ON at.oid=k.oid) AS args
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_type t ON t.oid=p.prorettype
 WHERE n.nspname='public' ORDER BY p.proname`);
  let source =
    "// Generado desde catálogos de PostgreSQL 18.6 / PGlite 0.5.14 y las migraciones locales.\n// No equivale a validar Supabase nativo PostgreSQL 17; regenerar con la CLI antes de integrar.\n";
  source +=
    "export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];\nexport type Database = { public: { Tables: {";
  for (const name of [...new Set(columns.map((c) => c.table_name))]) {
    source += JSON.stringify(name) + ": {";
    for (const shape of ["Row", "Insert", "Update"]) {
      source += shape + ": {";
      for (const col of columns.filter((c) => c.table_name === name)) {
        const generated = col.is_generated === "ALWAYS";
        const optional =
          shape === "Update" ||
          (shape === "Insert" &&
            (generated ||
              col.column_default !== null ||
              col.is_nullable === "YES"));
        const type =
          shape !== "Row" && generated
            ? "never"
            : jsType(col.data_type, col.udt_name) +
              (col.is_nullable === "YES" ? " | null" : "");
        source +=
          JSON.stringify(col.column_name) +
          (optional ? "?" : "") +
          ": " +
          type +
          ";";
      }
      source += "};";
    }
    source += "Relationships: [";
    for (const fk of fks.filter((f) => f.source === name)) {
      source +=
        "{foreignKeyName:" +
        JSON.stringify(fk.conname) +
        "; columns:" +
        JSON.stringify(fk.columns) +
        ";isOneToOne:" +
        fk.one_to_one +
        ";referencedRelation:" +
        JSON.stringify(fk.target) +
        ";referencedColumns:" +
        JSON.stringify(fk.targets) +
        ";},";
    }
    source += "];};";
  }
  source += "};Views: Record<never, never>;Functions:{";
  for (const fn of functions) {
    source += JSON.stringify(fn.proname) + ": {Args:{";
    for (const arg of fn.args ?? [])
      source +=
        JSON.stringify(arg.name) +
        ":" +
        jsType(arg.type.startsWith("_") ? "ARRAY" : "", arg.type) +
        ";";
    source += "};Returns:" + jsType("", fn.result) + ";};";
  }
  source +=
    "};Enums:Record<never,never>;CompositeTypes:Record<never,never>;};};";
  source = await format(source, { parser: "typescript" });
  const target = path.join(projectRoot, "src/types/database.generated.ts");
  if (process.argv.includes("--check")) {
    if ((await readFile(target, "utf8")) !== source)
      throw new Error("Tipos desactualizados: ejecute npm run db:types.");
    console.log(
      "Tipos PostgreSQL reproducibles: 14 tablas y " +
        functions.length +
        " RPC.",
    );
  } else {
    await writeFile(target, source);
    console.log("Tipos generados de una base reconstruida: " + target);
  }
} finally {
  await db.close();
}
