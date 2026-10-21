import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
process.chdir(root);
const config = JSON.parse(readFileSync(".local/bridge.json", "utf8"));
if (config.url === "https://biz.bluekite.co.kr") {
  console.log("관제 주소: https://biz.bluekite.co.kr\n원본 연결은 이 맥의 상시 연결 서비스에서 실행합니다.");
  process.exit(0);
}
const running = await fetch("http://127.0.0.1:4317/api/health")
  .then((r) => r.json())
  .catch(() => null);
if (running?.app === "bluekite-biz") {
  console.log("이미 실행 중입니다. http://127.0.0.1:4317");
  process.exit(0);
}
if (!existsSync("dist/index.html"))
  throw new Error("npm run build가 필요합니다.");
config.url = "http://127.0.0.1:4317";
writeFileSync(".local/bridge-local.json", JSON.stringify(config), {
  mode: 0o600,
});
const server = spawn(process.execPath, ["server/serve.mjs"], {
  stdio: "inherit",
  env: { ...process.env, BIZ_LOCAL: "1" },
});
let bridge;
for (let attempt = 0; attempt < 20; attempt++) {
  const up = await fetch("http://127.0.0.1:4317/api/health")
    .then((r) => r.ok)
    .catch(() => false);
  if (up) {
    bridge = spawn(
      resolve(config.source, "공장/.venv/bin/python"),
      ["connector/bridge.py", "--config", ".local/bridge-local.json"],
      { stdio: "inherit" },
    );
    break;
  }
  await new Promise((r) => setTimeout(r, 300));
}
const stop = () => {
  bridge?.kill("SIGTERM");
  server.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
server.on("exit", () => {
  bridge?.kill("SIGTERM");
});
