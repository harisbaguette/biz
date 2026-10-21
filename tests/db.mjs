import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { adapter } from "../server/db.mjs";
export function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8"));
  return adapter(sqlite);
}
