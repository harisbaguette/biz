// Personal operator CLI: credentials stay in the existing private file and memory.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("..", import.meta.url));
const base = "https://biz.bluekite.co.kr";
const [command, ...args] = process.argv.slice(2);
const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
let cookie = "";
async function call(path, method = "GET", value) {
  const response = await fetch(base + "/api" + path, { method, redirect: "error", signal: AbortSignal.timeout(20000),
    headers: { Origin: base, "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
  return { response, value: await response.json() };
}
try {
  if (!["list", "read", "save"].includes(command) || (command === "save" && !option("--file")) || (command === "read" && (!args.includes("--id") || !option("--id"))))
    throw new Error("사용법: list [--business ID] [--cursor 값] / read --id 기록ID / save --file JSON파일");
  const guide = readFileSync(resolve(root, ".local/접속 안내.txt"), "utf8");
  const password = /^접속 암호:\s*(\S+)\s*$/m.exec(guide)?.[1];
  if (!password) throw new Error("개인 접속 안내 파일을 확인하세요.");
  const login = await call("/login", "POST", { password });
  if (!login.response.ok) throw new Error("관제 인증에 실패했습니다.");
  cookie = login.response.headers.getSetCookie().find(x => x.startsWith("biz_session="))?.split(";")[0] || "";
  if (!cookie) throw new Error("관제 세션을 받지 못했습니다.");
  if (command === "list") {
    const business = args.includes("--business") ? option("--business") : "miricanvas";
    const cursor = args.includes("--cursor") ? "&cursor=" + encodeURIComponent(option("--cursor")) : "";
    const result = await call("/management?businessId=" + encodeURIComponent(business) + cursor);
    if (!result.response.ok) throw new Error(result.value.error);
    console.log(JSON.stringify({ items: result.value.items.map(({ id, kind, title, status, updated_at }) => ({ id, kind, title, status, updated_at })), nextCursor: result.value.nextCursor }, null, 2));
  } else if (command === "read") {
    const result = await call("/management/" + encodeURIComponent(option("--id")));
    if (!result.response.ok) throw new Error(result.value.error);
    console.log(JSON.stringify(result.value, null, 2));
  } else {
    const value = JSON.parse(readFileSync(resolve(option("--file")), "utf8"));
    if (typeof value.id !== "string" || !value.id) throw new Error("같은 기록에 사용할 id가 필요합니다.");
    const existing = await call("/management/" + encodeURIComponent(value.id));
    if (!existing.response.ok && existing.response.status !== 404) throw new Error(existing.value.error);
    const result = await call("/management" + (existing.response.ok ? "/" + encodeURIComponent(value.id) : ""), existing.response.ok ? "PATCH" : "POST",
      { ...value, ...(existing.response.ok ? { revision: existing.value.revision } : {}) });
    if (!result.response.ok) throw new Error(result.value.error);
    console.log(JSON.stringify({ id: result.value.id, title: result.value.title, status: result.value.status, revision: result.value.revision }));
  }
} catch (error) {
  console.error(error instanceof SyntaxError ? "기록 JSON 형식을 확인하세요." : error.message?.slice(0, 300) || "관제 기록 처리 실패");
  process.exitCode = 1;
} finally {
  if (cookie) await call("/logout", "POST", {}).catch(() => {});
}
