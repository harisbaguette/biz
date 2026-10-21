import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { api } from "../worker/index.mjs";
import { adapter } from "./db.mjs";
export { adapter } from "./db.mjs";
const folder = resolve(process.env.BIZ_DATA_DIR || ".local");
mkdirSync(folder, { recursive: true });
const sqlite = new DatabaseSync(resolve(folder, "biz.sqlite"));
sqlite.exec(
  readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8"),
);
const secrets = existsSync(resolve(folder, "secrets.json"))
  ? JSON.parse(readFileSync(resolve(folder, "secrets.json"), "utf8"))
  : {};
const env = {
  DB: adapter(sqlite),
  ...secrets,
  LOCAL_MODE: process.env.BIZ_REQUIRE_AUTH !== "1",
};
const port = Number(process.env.BIZ_API_PORT || 4318);
createServer(async (req, res) => {
  if (!["127.0.0.1:" + port, "localhost:" + port].includes(req.headers.host)) {
    res.writeHead(403);
    res.end();
    return;
  }
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > (req.url === "/api/bridge/snapshot" ? 12000000 : 1600000)) {
      res.writeHead(413);
      res.end();
      return;
    }
    chunks.push(c);
  }
  const origin = req.headers["x-biz-origin"] || `http://${req.headers.host}`;
  // Only Vite on the same loopback endpoint uses this header; the server never binds externally.
  const request = new Request(origin + req.url, {
    method: req.method,
    headers: req.headers,
    body: ["GET", "HEAD"].includes(req.method)
      ? undefined
      : Buffer.concat(chunks),
  });
  const response = await api(request, env);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, "127.0.0.1", () =>
  console.log(`BLUEKITE API http://127.0.0.1:${port}`),
);
