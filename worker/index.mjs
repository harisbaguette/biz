const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
const encoder = new TextEncoder();
const hex = (bytes) =>
  [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
export const digest = async (value) =>
  hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
export async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return hex(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: encoder.encode(salt),
        iterations: 100000,
        hash: "SHA-256",
      },
      key,
      256,
    ),
  );
}
const equal = async (a, b) =>
  !!a && !!b && (await digest(a)) === (await digest(b));
const now = () => new Date().toISOString();
const text = (value, max = 100) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= max &&
  !value.includes("\0");
const all = async (db, query, ...args) =>
  (
    await db
      .prepare(query)
      .bind(...args)
      .all()
  ).results;
const first = (db, query, ...args) =>
  db
    .prepare(query)
    .bind(...args)
    .first();
const run = (db, query, ...args) =>
  db
    .prepare(query)
    .bind(...args)
    .run();
function cookie(req) {
  return (
    /(?:^|; )biz_session=([^;]*)/.exec(req.headers.get("Cookie") || "")?.[1] ||
    ""
  );
}
async function body(req, max = 1500000) {
  if (Number(req.headers.get("Content-Length")) > max)
    throw Object.assign(new Error("요청이 너무 큽니다."), { status: 413 });
  const buffer = await req.arrayBuffer();
  if (buffer.byteLength > max)
    throw Object.assign(new Error("요청이 너무 큽니다."), { status: 413 });
  try {
    const value = JSON.parse(new TextDecoder().decode(buffer));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw 0;
    return value;
  } catch {
    throw Object.assign(new Error("요청 형식을 확인하세요."), { status: 400 });
  }
}
async function snapshot(db) {
  // A single SQLite statement observes metadata and every chunk at the same revision.
  // Each result row stays below D1's row limit; do not aggregate chunks into one row.
  const rows = await all(db, `SELECT -1 AS part,data,received_at FROM snapshots WHERE id='miricanvas'
    UNION ALL SELECT part,data,NULL AS received_at FROM snapshot_chunks WHERE snapshot_id='miricanvas' ORDER BY part`);
  const row = rows[0];
  if (!row || row.part !== -1) return null;
  const value = JSON.parse(row.data);
  if (Number.isInteger(value.assetChunkCount)) {
    const chunks = rows.slice(1);
    if (chunks.length !== value.assetChunkCount || chunks.some((c, i) => c.part !== i))
      throw Object.assign(new Error("재고를 동기화하지 못했습니다. 다시 수신할 때까지 기다려 주세요."), { status: 503 });
    value.assets = chunks.flatMap((c) => JSON.parse(c.data));
    delete value.assetChunkCount;
  }
  return { ...value, receivedAt: row.received_at };
}
const commandPayload = (action, payload) => action === "automation"
  ? { lane: payload?.lane, enabled: payload?.enabled }
  : { accountId: payload?.accountId };
function sameCommand(existing, action, payload) {
  return existing.action === action && JSON.stringify(commandPayload(action, JSON.parse(existing.payload))) === JSON.stringify(payload);
}
const commandView = (c) => ({ ...c, payload: typeof c.payload === "string" ? JSON.parse(c.payload) : c.payload });
function historyCursor(row) {
  return row ? btoa(encodeURIComponent(JSON.stringify([row.due_at, row.id]))) : null;
}
async function scheduleHistory(db, cursor) {
  let values = null;
  if (cursor) {
    try { values = JSON.parse(decodeURIComponent(atob(cursor))); } catch { /* validated below */ }
    if (!Array.isArray(values) || values.length !== 2 || !values.every((v) => text(v, 200)))
      throw Object.assign(new Error("이력 위치를 확인하세요."), { status: 400 });
  }
  const rows = await all(db, `SELECT s.*,c.message AS command_message,c.status AS command_status,c.updated_at AS command_updated_at
    FROM schedules s LEFT JOIN commands c ON c.id='schedule-'||s.id WHERE s.status IN ('done','cancelled')
    ${values ? "AND (s.due_at<? OR (s.due_at=? AND s.id<?))" : ""} ORDER BY s.due_at DESC,s.id DESC LIMIT 101`,
    ...(values ? [values[0], values[0], values[1]] : []));
  const items = rows.slice(0, 100);
  const total = (await first(db, "SELECT count(*) AS n FROM schedules WHERE status IN ('done','cancelled')")).n;
  return { items, total, hasMore: rows.length > 100, nextCursor: rows.length > 100 ? historyCursor(items.at(-1)) : null };
}
function validCommand(value, data) {
  if (value.action === "automation")
    return (
      ["upload", "production"].includes(value.payload?.lane) &&
      typeof value.payload?.enabled === "boolean"
    );
  if (value.action === "recheck")
    return data?.accounts.some((a) => a.id === value.payload?.accountId);
  return false;
}
async function commandRequest(db, id) {
  return first(db, `SELECT c.* FROM commands c WHERE c.id=?
    UNION ALL SELECT c.* FROM command_requests r JOIN commands c ON c.id=r.command_id WHERE r.request_id=? LIMIT 1`, id, id);
}
function checkedCommand(existing, action, payload) {
  if (!existing || !sameCommand(existing, action, payload))
    throw Object.assign(new Error("같은 요청 번호의 내용이 다릅니다."), { status: 409 });
  return commandView(existing);
}
async function aliasRequest(db, id, canonical, action, payload) {
  // Retain every accepted request ID, including a request collapsed into older work.
  await run(db, "INSERT OR IGNORE INTO command_requests(request_id,command_id) SELECT ?,id FROM commands WHERE id=?", id, canonical);
  return checkedCommand(await commandRequest(db, id), action, payload);
}
async function queue(db, id, action, payload) {
  const stamp = now(), serialized = JSON.stringify(payload);
  // Selecting work and registering its request alias share the same transaction.
  // A result cannot finish between collapse and alias registration.
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO commands(id,action,payload,created_at,updated_at)
      SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM commands WHERE action=? AND payload=? AND status='queued')
      AND NOT EXISTS (SELECT 1 FROM command_requests WHERE request_id=?)`)
      .bind(id, action, serialized, stamp, stamp, action, serialized, id),
    db.prepare(`INSERT OR IGNORE INTO command_requests(request_id,command_id)
      SELECT ?,id FROM commands WHERE id=? OR (action=? AND payload=? AND status='queued')
      ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END,created_at,id LIMIT 1`)
      .bind(id, id, action, serialized, id),
  ]);
  return checkedCommand(await commandRequest(db, id), action, payload);
}

export async function api(req, env) {
  const url = new URL(req.url),
    path = url.pathname,
    db = env.DB;
  try {
    if (path === "/api/health") return json({ ok: true, app: "bluekite-biz" });
    if (!db) return json({ error: "저장소 연결을 확인하세요." }, 503);
    const bridge = path.startsWith("/api/bridge/");
    if (bridge) {
      if (
        !(await equal(
          req.headers.get("Authorization"),
          "Bearer " + env.BRIDGE_TOKEN,
        )) ||
        !env.BRIDGE_TOKEN
      )
        return json({ error: "연결 인증이 필요합니다." }, 401);
      if (path === "/api/bridge/snapshot" && req.method === "POST") {
        const value = await body(req, 12000000);
        if (
          value.version !== 1 ||
          !Array.isArray(value.accounts) ||
          value.accounts.length !== 13 ||
          !Array.isArray(value.assets) ||
          !Number.isFinite(Date.parse(value.observedAt)) ||
          value.accounts.some(
            (a) =>
              !text(a.id) ||
              !text(a.name) ||
              !Number.isFinite(a.ready) ||
              a.ready < 0,
          ) ||
          new Set(value.accounts.map((a) => a.id)).size !== 13
        )
          return json({ error: "기여자 데이터 형식을 확인하세요." }, 400);
        // A valid replacement must repair missing/broken asset chunks. Read only the
        // previous metadata for the ordering guard instead of reconstructing its assets.
        const previousRow = await first(db, "SELECT data FROM snapshots WHERE id='miricanvas'");
        let previousObservedAt = null;
        try { previousObservedAt = JSON.parse(previousRow?.data || "null")?.observedAt; }
        catch { /* Corrupt old metadata is replaceable by this fully validated snapshot. */ }
        if (Number.isFinite(Date.parse(previousObservedAt)) && Date.parse(value.observedAt) < Date.parse(previousObservedAt))
          return json({ error: "이전 상태로 되돌릴 수 없습니다." }, 409);
        // Keep each D1 value small as the image library grows. Publish all parts atomically.
        const parts = [];
        let items = [],
          bytes = 2;
        for (const asset of value.assets) {
          const item = JSON.stringify(asset),
            size = encoder.encode(item).length + 1;
          if (size > 800000)
            return json({ error: "그림 한 건의 정보가 너무 큽니다." }, 400);
          if (items.length && bytes + size > 400000) {
            parts.push("[" + items.join(",") + "]");
            items = [];
            bytes = 2;
          }
          items.push(item);
          bytes += size;
        }
        if (items.length) parts.push("[" + items.join(",") + "]");
        await db.batch([
          ...parts.map((part, i) =>
            db
              .prepare(
                "INSERT INTO snapshot_chunks VALUES(?,?,?) ON CONFLICT(snapshot_id,part) DO UPDATE SET data=excluded.data",
              )
              .bind("miricanvas", i, part),
          ),
          db
            .prepare(
              "DELETE FROM snapshot_chunks WHERE snapshot_id=? AND part>=?",
            )
            .bind("miricanvas", parts.length),
          db
            .prepare(
              "INSERT INTO snapshots VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,received_at=excluded.received_at",
            )
            .bind(
              "miricanvas",
              JSON.stringify({
                ...value,
                assets: [],
                assetChunkCount: parts.length,
              }),
              now(),
            ),
        ]);
        return json({ ok: true });
      }
      if (path === "/api/bridge/thumbnails" && req.method === "POST") {
        const value = await body(req);
        if (
          !Array.isArray(value.items) ||
          value.items.length > 25 ||
          value.items.some(
            (i) =>
              !text(i.id, 200) ||
              typeof i.data !== "string" ||
              i.data.length > 80000 ||
              !/^[A-Za-z0-9+/=]+$/.test(i.data),
          )
        )
          return json({ error: "미리보기 형식을 확인하세요." }, 400);
        if (value.items.length) {
          const placeholders = value.items.map(() => "?").join(","), ids = value.items.map((i) => i.id);
          await db.batch([
            ...value.items.map((i) => db.prepare("INSERT INTO thumbnails VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").bind(i.id, i.data)),
            db.prepare(`DELETE FROM preview_requests WHERE id IN (${placeholders})`).bind(...ids),
            db.prepare(`DELETE FROM preview_failures WHERE id IN (${placeholders})`).bind(...ids),
          ]);
        }
        return json({ ok: true });
      }
      if (path === "/api/bridge/commands" && req.method === "GET") {
        const due = await all(
          db,
          "SELECT * FROM schedules WHERE kind='recheck' AND status='planned' AND due_at<=? LIMIT 20",
          now(),
        );
        for (const s of due) {
          await db.batch([
            db
              .prepare(
                "INSERT OR IGNORE INTO commands(id,action,payload,created_at,updated_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM schedules WHERE id=? AND status='planned')",
              )
              .bind(
                "schedule-" + s.id,
                "recheck",
                JSON.stringify({ accountId: s.account_id }),
                now(),
                now(),
                s.id,
              ),
            db
              .prepare(
                "UPDATE schedules SET status='requested' WHERE id=? AND status='planned'",
              )
              .bind(s.id),
          ]);
        }
        const commands = await all(
          db,
          "SELECT * FROM commands WHERE status='queued' ORDER BY created_at LIMIT 20",
        );
        return json({
          previews: (
            await all(
              db,
              "SELECT r.id FROM preview_requests r LEFT JOIN preview_failures f ON f.id=r.id WHERE f.id IS NULL OR (f.attempts<3 AND f.retry_at<=?) ORDER BY r.requested_at,r.id LIMIT 48",
              now(),
            )
          ).map((p) => p.id),
          commands: commands.map((c) => ({
            ...c,
            payload: JSON.parse(c.payload),
          })),
        });
      }
      if (path === "/api/bridge/preview-results" && req.method === "POST") {
        const v = await body(req, 15000);
        if (!Array.isArray(v.items) || v.items.length > 48 || v.items.some((i) => !text(i.id, 200) || !text(i.message, 160)))
          return json({ error: "미리보기 결과를 확인하세요." }, 400);
        // One statement per item, plus cleanup: at most 49 D1 queries per request.
        // The upsert increments attempts atomically; missing requests or completed previews are ignored.
        const stamp = now(), retrySoon = new Date(Date.now() + 60000).toISOString(), retryLater = new Date(Date.now() + 300000).toISOString();
        if (v.items.length) await db.batch(v.items.map((item) => db.prepare(`INSERT INTO preview_failures(id,attempts,retry_at,message,updated_at)
          SELECT ?,1,?,?,? WHERE EXISTS (SELECT 1 FROM preview_requests WHERE id=?)
          ON CONFLICT(id) DO UPDATE SET attempts=MIN(3,preview_failures.attempts+1),retry_at=?,message=excluded.message,updated_at=excluded.updated_at`)
          .bind(item.id, retrySoon, item.message, stamp, item.id, retryLater)));
        await run(db, "DELETE FROM preview_requests WHERE id IN (SELECT id FROM preview_failures WHERE attempts>=3)");
        return json({ ok: true });
      }
      if (path === "/api/bridge/result" && req.method === "POST") {
        const v = await body(req, 10000);
        if (
          !text(v.id, 100) ||
          !["applied", "failed"].includes(v.status) ||
          !text(v.message, 500)
        )
          return json({ error: "결과 형식을 확인하세요." }, 400);
        await db.batch([
          db.prepare("UPDATE commands SET status=?,message=?,updated_at=? WHERE id=? AND status='queued'")
            .bind(v.status, v.message, now(), v.id),
          ...(v.id.startsWith("schedule-") ? [db.prepare(`UPDATE schedules SET status=(
            SELECT CASE status WHEN 'applied' THEN 'done' ELSE 'failed' END FROM commands WHERE id=?
          ) WHERE id=? AND status='requested' AND EXISTS (
            SELECT 1 FROM commands WHERE id=? AND status IN ('applied','failed')
          )`).bind(v.id, v.id.slice(9), v.id)] : []),
        ]);
        return json({ ok: true });
      }
      return json({ error: "없는 연결 경로입니다." }, 404);
    }
    const local = env.LOCAL_MODE === true;
    if (
      req.method !== "GET" &&
      req.method !== "HEAD" &&
      req.headers.get("Origin") !== url.origin
    )
      return json({ error: "관제 화면에서 요청하세요." }, 403);
    if (path === "/api/login" && req.method === "POST") {
      const ip = req.headers.get("CF-Connecting-IP") || "local";
      const attempt = await first(db, "SELECT * FROM attempts WHERE ip=?", ip);
      if (attempt && attempt.reset_at > Date.now() && attempt.count >= 8)
        return json({ error: "잠시 후 다시 로그인하세요." }, 429);
      const v = await body(req, 2000);
      if (
        typeof v.password !== "string" ||
        v.password.length > 200 ||
        !env.PASSWORD_HASH ||
        !env.PASSWORD_SALT
      )
        return json({ error: "접속 암호를 확인하세요." }, 401);
      const hash = await passwordHash(v.password, env.PASSWORD_SALT);
      if (!(await equal(hash, env.PASSWORD_HASH))) {
        await run(
          db,
          "INSERT INTO attempts VALUES(?,?,?) ON CONFLICT(ip) DO UPDATE SET count=excluded.count,reset_at=excluded.reset_at",
          ip,
          attempt && attempt.reset_at > Date.now() ? attempt.count + 1 : 1,
          Date.now() + 15 * 60 * 1000,
        );
        return json({ error: "접속 암호를 확인하세요." }, 401);
      }
      const token = hex(crypto.getRandomValues(new Uint8Array(32)));
      await db.batch([
        db
          .prepare("INSERT INTO sessions VALUES(?,?)")
          .bind(
            await digest(token),
            new Date(Date.now() + 30 * 86400000).toISOString(),
          ),
        db.prepare("DELETE FROM attempts WHERE ip=?").bind(ip),
        db.prepare("DELETE FROM sessions WHERE expires_at<?").bind(now()),
      ]);
      return json({ ok: true }, 200, {
        "Set-Cookie": `biz_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${url.protocol === "https:" ? "; Secure" : ""}`,
      });
    }
    const session =
      local ||
      (cookie(req) &&
        (await first(
          db,
          "SELECT token FROM sessions WHERE token=? AND expires_at>?",
          await digest(cookie(req)),
          now(),
        )));
    if (path === "/api/session")
      return json({ authenticated: !!session, local });
    if (!session) return json({ error: "로그인이 필요합니다." }, 401);
    if (path === "/api/logout" && req.method === "POST") {
      await run(
        db,
        "DELETE FROM sessions WHERE token=?",
        await digest(cookie(req)),
      );
      return json({ ok: true }, 200, {
        "Set-Cookie":
          "biz_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure",
      });
    }
    if (path === "/api/world" && req.method === "GET") {
      const [data, active, history, commands, businesses, thumbnails, failures] = await Promise.all([
        snapshot(db),
        all(db, "SELECT s.*,c.message AS command_message,c.status AS command_status,c.updated_at AS command_updated_at FROM schedules s LEFT JOIN commands c ON c.id='schedule-'||s.id WHERE s.status IN ('planned','requested','failed') ORDER BY s.due_at,s.id"),
        scheduleHistory(db),
        all(db, `SELECT * FROM commands WHERE status='queued'
          UNION ALL SELECT * FROM (SELECT * FROM commands WHERE status<>'queued' ORDER BY created_at DESC,id DESC LIMIT 40)
          ORDER BY created_at DESC,id DESC`),
        all(db, "SELECT * FROM businesses ORDER BY name"),
        all(db, "SELECT id FROM thumbnails"),
        all(db, "SELECT id FROM preview_failures WHERE attempts>=3"),
      ]);
      const { items, ...scheduleHistoryInfo } = history;
      return json({
        snapshot: data,
        schedules: [...active, ...items],
        scheduleHistory: scheduleHistoryInfo,
        commands: commands.map(commandView),
        businesses,
        thumbnails: thumbnails.map((t) => t.id),
        previewFailures: failures.map((f) => f.id),
      });
    }
    if (path === "/api/schedules/history" && req.method === "GET")
      return json(await scheduleHistory(db, url.searchParams.get("cursor")));
    if (path.startsWith("/api/thumbnail/") && req.method === "GET") {
      const row = await first(
        db,
        "SELECT data FROM thumbnails WHERE id=?",
        decodeURIComponent(path.slice(15)),
      );
      if (!row) return new Response(null, { status: 404 });
      const bytes = Uint8Array.from(atob(row.data), (c) => c.charCodeAt(0));
      return new Response(bytes, {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "private, max-age=3600",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (path === "/api/previews" && req.method === "POST") {
      const v = await body(req, 15000),
        data = await snapshot(db);
      if (
        !Array.isArray(v.ids) ||
        v.ids.length > 24 ||
        v.ids.some(
          (id) => !text(id, 200) || !data?.assets.some((a) => a.id === id),
        )
      )
        return json({ error: "미리보기 대상을 확인하세요." }, 400);
      const ids = [...new Set(v.ids)];
      if (v.retry !== undefined && typeof v.retry !== "boolean")
        return json({ error: "미리보기 재시도를 확인하세요." }, 400);
      const pending = await first(db, "SELECT count(*) AS n FROM preview_requests");
      if (pending.n + ids.length > 264)
        return json({ error: "미리보기를 준비하는 중입니다." }, 429);
      if (ids.length) await db.batch([
        ...(v.retry ? [db.prepare(`DELETE FROM preview_failures WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids)] : []),
        ...ids.map((id) =>
        db.prepare(`INSERT OR IGNORE INTO preview_requests SELECT ?,?
          WHERE NOT EXISTS (SELECT 1 FROM thumbnails WHERE id=?)
          AND NOT EXISTS (SELECT 1 FROM preview_failures WHERE id=? AND attempts>=3)`)
          .bind(id, now(), id, id)),
      ]);
      return json({ ok: true }, 202);
    }
    if (path === "/api/commands" && req.method === "POST") {
      const v = await body(req, 5000);
      if (!text(v.id, 100) || !["automation", "recheck"].includes(v.action))
        return json({ error: "지시 내용을 확인하세요." }, 400);
      const payload = commandPayload(v.action, v.payload);
      const existing = await commandRequest(db, v.id);
      if (existing) return sameCommand(existing, v.action, payload)
        ? json(commandView(existing), 200)
        : json({ error: "같은 요청 번호의 내용이 다릅니다." }, 409);
      const data = await snapshot(db);
      if (!validCommand({ ...v, payload }, data))
        return json({ error: "지시 내용을 확인하세요." }, 400);
      const duplicate = await first(db, "SELECT * FROM commands WHERE action=? AND payload=? AND status='queued' LIMIT 1", v.action, JSON.stringify(payload));
      if (duplicate) return json(await aliasRequest(db, v.id, duplicate.id, v.action, payload), 200);
      if (!data || Date.now() - Date.parse(data.receivedAt) > 180000)
        return json({ error: "작업기 연결이 끊겨 지시를 보낼 수 없습니다." }, 409);
      const outstanding = await first(db, "SELECT count(*) AS n FROM commands WHERE status='queued'");
      if (outstanding.n >= 20)
        return json({ error: "대기 중인 지시가 많습니다. 처리 후 다시 시도하세요." }, 429);
      return json(await queue(db, v.id, v.action, payload), 201);
    }
    if (path === "/api/schedules" && req.method === "POST") {
      const v = await body(req, 5000), due = Date.parse(v.dueAt);
      if (
        !text(v.id, 100) ||
        !text(v.title, 100) ||
        !["memo", "recheck"].includes(v.kind) ||
        !text(v.accountId, 100) ||
        !Number.isFinite(due)
      )
        return json(
          { error: "계정, 할 일, 앞으로 1년 안의 일정을 입력하세요." },
          400,
        );
      const matches = existing => existing.title === v.title.trim() && existing.due_at === new Date(due).toISOString() && existing.account_id === v.accountId && existing.kind === v.kind;
      const conflict = () => json({ error: "같은 요청 번호의 내용이 다릅니다." }, 409);
      const existing = await first(db, "SELECT * FROM schedules WHERE id=?", v.id);
      if (existing)
        return matches(existing) ? json(existing) : conflict();
      const data = await snapshot(db);
      if (!data?.accounts.some(a => a.id === v.accountId) || due < Date.now() - 60000 || due > Date.now() + 366 * 86400000)
        return json({ error: "계정, 할 일, 앞으로 1년 안의 일정을 입력하세요." }, 400);
      const inserted = await run(
        db,
        "INSERT OR IGNORE INTO schedules(id,account_id,title,due_at,kind,created_at) VALUES(?,?,?,?,?,?)",
        v.id,
        v.accountId,
        v.title.trim(),
        new Date(due).toISOString(),
        v.kind,
        now(),
      );
      if (Number(inserted.meta?.changes ?? inserted.changes) === 0) {
        const saved = await first(db, "SELECT * FROM schedules WHERE id=?", v.id);
        return saved && matches(saved) ? json(saved) : conflict();
      }
      return json({ ok: true, id: v.id }, 201);
    }
    if (path.startsWith("/api/schedules/") && req.method === "PATCH") {
      const v = await body(req, 1000),
        id = decodeURIComponent(path.slice(15));
      if (!["cancelled", "done"].includes(v.status))
        return json({ error: "일정 상태를 확인하세요." }, 400);
      const s = await first(db, "SELECT * FROM schedules WHERE id=?", id);
      if (!s) return json({ error: "일정이 없습니다." }, 404);
      if (s.status !== "planned" && !(s.status === "failed" && v.status === "cancelled"))
        return json({ error: "이미 처리한 일정입니다. 새로고침하세요." }, 409);
      if (v.status === "done" && s.kind !== "memo")
        return json({ error: "작업기가 처리 결과를 기록합니다." }, 400);
      const result = await run(
        db,
        "UPDATE schedules SET status=? WHERE id=? AND status=?",
        v.status,
        id,
        s.status,
      );
      if ((result.meta?.changes ?? result.changes) === 0)
        return json({ error: "이미 처리한 일정입니다. 새로고침하세요." }, 409);
      return json({ ok: true });
    }
    if (path === "/api/businesses" && req.method === "POST") {
      const v = await body(req, 3000);
      if (
        !text(v.name, 40) ||
        !["game", "art", "video", "blog", "other"].includes(v.kind) ||
        typeof v.note !== "string" ||
        v.note.length > 300
      )
        return json({ error: "사업 이름과 종류를 확인하세요." }, 400);
      const id = crypto.randomUUID();
      await run(
        db,
        "INSERT INTO businesses(id,name,kind,note) VALUES(?,?,?,?)",
        id,
        v.name.trim(),
        v.kind,
        v.note.trim(),
      );
      return json({ id }, 201);
    }
    return json({ error: "없는 경로입니다." }, 404);
  } catch (error) {
    return json(
      {
        error: error.status
          ? error.message
          : "처리하지 못했습니다. 잠시 후 다시 시도하세요.",
      },
      error.status || 500,
    );
  }
}

export default {
  async fetch(req, env) {
    if (new URL(req.url).pathname.startsWith("/api/")) return api(req, env);
    const response = await env.ASSETS.fetch(req),
      headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "same-origin");
    headers.set("X-Frame-Options", "DENY");
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob:; font-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    return new Response(response.body, { status: response.status, headers });
  },
};
