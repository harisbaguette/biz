import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { passwordHash } from "../worker/index.mjs";

test("운영 서버는 개인 파일을 숨기고 HTTPS 세션으로만 업무 데이터를 제공한다", async () => {
  const folder = await mkdtemp(join(tmpdir(), "bluekite-server-test-"));
  const password = crypto.randomUUID(),
    salt = crypto.randomUUID();
  await writeFile(
    join(folder, "secrets.json"),
    JSON.stringify({
      BRIDGE_TOKEN: crypto.randomUUID(),
      PASSWORD_SALT: salt,
      PASSWORD_HASH: await passwordHash(password, salt),
    }),
    { mode: 0o600 },
  );
  const env = {
    ...process.env,
    PORT: "4320",
    BIZ_DATA_DIR: folder,
    PUBLIC_ORIGIN: "https://biz.example",
  };
  delete env.BIZ_LOCAL;
  const child = spawn(process.execPath, ["server/serve.mjs"], {
    env,
    stdio: "ignore",
  });
  const closed = once(child, "exit");
  const endpoint = "http://127.0.0.1:4320";
  try {
    let healthy = false;
    for (let i = 0; i < 30; i++) {
      if (child.exitCode !== null)
        throw new Error("운영 서버를 시작하지 못했습니다.");
      healthy = await fetch(endpoint + "/api/health")
        .then((r) => r.ok)
        .catch(() => false);
      if (healthy) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(healthy);
    const shell = await fetch(endpoint);
    assert.equal(shell.status, 200);
    assert.match(
      shell.headers.get("Content-Security-Policy"),
      /connect-src 'self' blob:/,
    );
    for (const path of [
      "/.local/secrets.json",
      "/connector/snapshot.py",
      "/worker/index.mjs",
    ])
      assert.equal((await fetch(endpoint + path)).status, 404);
    assert.equal((await fetch(endpoint + "/api/world")).status, 401);
    const login = await fetch(endpoint + "/api/login", {
      method: "POST",
      headers: { Origin: "https://biz.example" },
      body: JSON.stringify({ password }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie");
    assert.match(cookie, /Secure/);
    assert.match(cookie, /HttpOnly/);
    assert.equal(
      (await fetch(endpoint + "/api/world", { headers: { Cookie: cookie } }))
        .status,
      200,
    );
    const forged = await fetch(endpoint + "/api/businesses", {
      method: "POST",
      headers: { Origin: "https://unrelated.example", Cookie: cookie },
      body: "{}",
    });
    assert.equal(forged.status, 403);
  } finally {
    child.kill("SIGTERM");
    await closed;
    await rm(folder, { recursive: true, force: true });
  }
});
