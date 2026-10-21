import { copyFileSync, mkdirSync, readFileSync, realpathSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = fileURLToPath(new URL("..", import.meta.url));
const folder = realpathSync(resolve(root, ".local"));
const install = process.argv.includes("--install");
const label = "com.bluekite.biz.bridge";
const xml = (v) => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const node = existsSync("/opt/homebrew/bin/node") ? "/opt/homebrew/bin/node" : process.execPath;
mkdirSync(resolve(folder, "connector"), { recursive: true, mode: 0o700 });
for (const name of ["bridge.py", "snapshot.py"])
  copyFileSync(resolve(root, "connector", name), resolve(folder, "connector", name));
copyFileSync(resolve(root, "scripts/bridge-service.mjs"), resolve(folder, "bridge-service.mjs"));
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(node)}</string><string>${xml(resolve(folder, "bridge-service.mjs"))}</string></array>
<key>WorkingDirectory</key><string>${xml(folder)}</string>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>30</integer>
<key>ProcessType</key><string>Background</string>
</dict></plist>
`;
const prepared = resolve(folder, label + ".plist");
writeFileSync(prepared, plist, { mode: 0o600 });
if (!install) {
  console.log("상시 연결 설정을 준비했습니다. 아직 서비스에 등록하지 않았습니다.");
  process.exit(0);
}
const config = JSON.parse(readFileSync(resolve(folder, "bridge.json"), "utf8"));
if (config.url !== "https://biz.bluekite.co.kr")
  throw new Error("배포가 끝난 뒤 bridge.json의 주소를 설정하세요.");
const health = await fetch(config.url + "/api/health", { signal: AbortSignal.timeout(15000) }).then((r) => r.json());
if (health.app !== "bluekite-biz") throw new Error("배포된 관제에 연결할 수 없습니다.");
const directory = resolve(homedir(), "Library/LaunchAgents");
mkdirSync(directory, { recursive: true });
const target = resolve(directory, label + ".plist");
copyFileSync(prepared, target);
chmodSync(target, 0o600);
const domain = `gui/${process.getuid()}`;
spawnSync("launchctl", ["bootout", `${domain}/${label}`], { stdio: "ignore" });
const result = spawnSync("launchctl", ["bootstrap", domain, target], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status || 1);
console.log("맥 로그인 시 관제 연결이 자동으로 켜집니다. 로그는 개인 데이터 폴더에 저장합니다.");
