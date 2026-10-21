import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { brotliCompressSync, constants } from "node:zlib";
import worker from "../worker/index.mjs";
import { adapter } from "./db.mjs";

const port = Number(process.env.PORT || 4317);
const local = process.env.BIZ_LOCAL === "1";
const origin = local ? `http://127.0.0.1:${port}` : process.env.PUBLIC_ORIGIN;
if (!origin || (!local && !origin.startsWith("https://")))
  throw new Error("PUBLIC_ORIGIN에는 운영 HTTPS 주소가 필요합니다.");
const folder = resolve(process.env.BIZ_DATA_DIR || ".local");
mkdirSync(folder, { recursive: true, mode: 0o700 });
const secrets = JSON.parse(
  readFileSync(resolve(folder, "secrets.json"), "utf8"),
);
if (
  !secrets.BRIDGE_TOKEN ||
  (!local && (!secrets.PASSWORD_HASH || !secrets.PASSWORD_SALT))
)
  throw new Error(
    "운영 인증 설정이 필요합니다. scripts/provision.mjs를 실행하세요.",
  );
const sql = new DatabaseSync(resolve(folder, "biz.sqlite"));
sql.exec("PRAGMA journal_mode=WAL");
sql.exec(
  readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8"),
);
const dist = resolve("dist");
if (!existsSync(resolve(dist, "index.html")))
  throw new Error("먼저 npm run build를 실행하세요.");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".glb": "model/gltf-binary",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};
const cache = new Map();
const env = {
  ...secrets,
  LOCAL_MODE: local,
  DB: adapter(sql),
  ASSETS: {
    async fetch(request) {
      const url = new URL(request.url);
      let path;
      try {
        path = resolve(
          dist,
          "." +
            decodeURIComponent(
              url.pathname === "/" ? "/index.html" : url.pathname,
            ),
        );
      } catch {
        return new Response(null, { status: 400 });
      }
      if (
        !path.startsWith(dist + sep) ||
        !existsSync(path) ||
        !statSync(path).isFile()
      )
        return new Response("찾을 수 없습니다.", { status: 404 });
      const extension = extname(path);
      if (!mime[extension]) return new Response(null, { status: 404 });
      const compress =
        /\bbr\b/.test(request.headers.get("Accept-Encoding") || "") &&
        [".html", ".js", ".css", ".svg", ".json"].includes(extension);
      const key = path + (compress ? ":br" : "");
      if (!cache.has(key)) {
        const bytes = readFileSync(path);
        cache.set(key, compress ? brotliCompressSync(bytes) : bytes);
      }
      return new Response(cache.get(key), {
        headers: {
          "Content-Type": mime[extension],
          "Cache-Control":
            extension === ".html" ? "no-cache" : "public, max-age=3600",
          ...(compress
            ? { "Content-Encoding": "br", Vary: "Accept-Encoding" }
            : {}),
        },
      });
    },
  },
};
createServer(async (req, res) => {
  try {
    if (
      local &&
      !["127.0.0.1:" + port, "localhost:" + port].includes(req.headers.host)
    ) {
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
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("CF-Connecting-IP", req.socket.remoteAddress || "local");
    const request = new Request(origin + req.url, {
      method: req.method,
      headers: requestHeaders,
      body: ["GET", "HEAD"].includes(req.method)
        ? undefined
        : Buffer.concat(chunks),
    });
    const response = await worker.fetch(request, env);
    const headers = Object.fromEntries(response.headers);
    let output = Buffer.from(await response.arrayBuffer());
    if (
      output.length > 4096 &&
      headers["content-type"]?.startsWith("application/json") &&
      /\bbr\b/.test(req.headers["accept-encoding"] || "")
    ) {
      output = brotliCompressSync(output, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 4 },
      });
      headers["content-encoding"] = "br";
      headers.vary = "Accept-Encoding";
      delete headers["content-length"];
    }
    res.writeHead(response.status, headers);
    res.end(req.method === "HEAD" ? undefined : output);
  } catch {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "서버 요청을 처리하지 못했습니다." }));
  }
}).listen(port, "127.0.0.1", () => console.log(`BLUEKITE ${origin}`));
