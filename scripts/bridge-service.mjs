// Installed beside bridge.json so restart does not depend on the NAS mount.
import { spawn } from "node:child_process";
import { readFileSync, existsSync, appendFileSync, statSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const folder = fileURLToPath(new URL(".", import.meta.url));
const configFile = resolve(folder, "bridge.json");
const logFile = resolve(folder, "bridge-service.log");
let child, stopping = false;
function log(message) {
  try {
    if (existsSync(logFile) && statSync(logFile).size > 5_000_000)
      renameSync(logFile, logFile + ".previous");
    appendFileSync(logFile, message, { mode: 0o600 });
  } catch { /* A disk problem must not stop the retry loop. */ }
}
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    stopping = true;
    if (child) child.kill(signal);
    else process.exit(0);
  });
while (!stopping) {
  try {
    const config = JSON.parse(readFileSync(configFile, "utf8"));
    if (config.url !== "https://biz.bluekite.co.kr")
      throw new Error("배포 주소 설정이 필요합니다.");
    const localPython = resolve(config.runtime, "venv/bin/python");
    const python = existsSync(localPython) ? localPython : resolve(config.source, "공장/.venv/bin/python");
    if (!existsSync(config.source) || !existsSync(python))
      throw new Error("NAS 연결을 기다립니다.");
    await new Promise((done) => {
      child = spawn(python, [resolve(folder, "connector/bridge.py"), "--config", configFile], {
        cwd: folder, stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      });
      child.stdout.on("data", (chunk) => log(chunk.toString()));
      // Do not persist dependency tracebacks containing private paths or URLs.
      child.stderr.on("data", () => log(`${new Date().toISOString()} 연결 프로그램 진단 오류\n`));
      child.once("error", () => done());
      child.once("exit", () => done());
    });
  } catch {
    log(`${new Date().toISOString()} 연결 환경을 기다립니다.\n`);
  }
  child = undefined;
  if (!stopping) await new Promise((done) => setTimeout(done, 30_000));
}
