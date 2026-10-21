import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { passwordHash } from "../worker/index.mjs";
const folder = resolve(process.env.BIZ_DATA_DIR || ".local");
mkdirSync(folder, { recursive: true, mode: 0o700 });
const file = resolve(folder, "secrets.json"),
  existing = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
if (existing.PASSWORD_HASH) {
  console.log("기존 인증 설정을 유지합니다.");
  process.exit(0);
}
const password = randomBytes(18).toString("base64url"),
  salt = randomBytes(24).toString("hex");
const secrets = {
  ...existing,
  BRIDGE_TOKEN: existing.BRIDGE_TOKEN || randomBytes(32).toString("hex"),
  PASSWORD_SALT: salt,
  PASSWORD_HASH: await passwordHash(password, salt),
};
writeFileSync(file, JSON.stringify(secrets, null, 2), { mode: 0o600 });
writeFileSync(
  resolve(folder, "접속 안내.txt"),
  `BLUEKITE 사업 관제\n주소: https://biz.bluekite.co.kr\n접속 암호: ${password}\n\n이 파일은 개인 보관용입니다. 공개 배포에 포함하지 마세요.\n`,
  { mode: 0o600 },
);
console.log(
  "인증을 준비했습니다. 접속 암호는 개인 데이터 폴더의 접속 안내.txt에 있습니다.",
);
