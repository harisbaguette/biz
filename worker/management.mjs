// Business records are independent of executable commands and source snapshots.
export async function management(req, url, db, { json, body, text, all, first, run, now }) {
  const path = url.pathname;
  const businessExists = async id => ["portfolio", "miricanvas"].includes(id) || !!await first(db, "SELECT id FROM businesses WHERE id=?", id);
  if (path.startsWith("/api/management/") && req.method === "GET") {
    const id = decodeURIComponent(path.slice("/api/management/".length));
    if (!text(id, 100)) return json({ error: "기록 번호를 확인하세요." }, 400);
    const record = await first(db, "SELECT * FROM management_records WHERE id=?", id);
    return record ? json(record) : json({ error: "기록을 찾을 수 없습니다." }, 404);
  }
  if (path === "/api/management" && req.method === "GET") {
    const business = url.searchParams.get("businessId") || "miricanvas";
    if (!text(business, 100) || !await businessExists(business)) return json({ error: "사업을 찾을 수 없습니다." }, 404);
    let cursor = null;
    if (url.searchParams.has("cursor")) {
      try {
        const raw = url.searchParams.get("cursor");
        if (raw.length > 1000) throw 0;
        cursor = JSON.parse(decodeURIComponent(atob(raw)));
        if (!Array.isArray(cursor) || cursor.length !== 2 || !Number.isFinite(Date.parse(cursor[0])) || !text(cursor[1], 100)) throw 0;
      } catch { return json({ error: "기록 페이지를 다시 열어 주세요." }, 400); }
    }
    const rows = await all(db, `SELECT * FROM management_records WHERE business_id=?
      ${cursor ? "AND (created_at<? OR (created_at=? AND id<?))" : ""}
      ORDER BY created_at DESC,id DESC LIMIT 41`, business, ...(cursor ? [cursor[0], cursor[0], cursor[1]] : []));
    const items = rows.slice(0, 40), last = items.at(-1);
    return json({ items, nextCursor: rows.length > 40 ? btoa(encodeURIComponent(JSON.stringify([last.created_at, last.id]))) : null });
  }
  const patch = path.startsWith("/api/management/") && req.method === "PATCH";
  if (!(path === "/api/management" && req.method === "POST") && !patch) return json({ error: "없는 기록 경로입니다." }, 404);
  const v = await body(req, 50000);
  const id = patch ? decodeURIComponent(path.slice("/api/management/".length)) : v.id;
  const statusAllowed = v.kind === "plan" ? ["planned", "active", "blocked", "done", "archived"] : ["recorded", "archived"];
  if (!text(id, 100) || !text(v.businessId, 100) || !["plan", "report", "decision"].includes(v.kind)
      || !text(v.title, 120) || !text(v.content, 10000) || !statusAllowed.includes(v.status)
      || (v.dueAt && (v.kind !== "plan" || !Number.isFinite(Date.parse(v.dueAt))))
      || (patch && (!Number.isInteger(v.revision) || v.revision < 1)))
    return json({ error: "사업, 기록 종류, 제목, 내용과 상태를 확인하세요." }, 400);
  if (!await businessExists(v.businessId)) return json({ error: "사업을 찾을 수 없습니다." }, 404);
  const fields = [v.businessId, v.kind, v.title.trim(), v.content.trim(), v.status, v.dueAt ? new Date(v.dueAt).toISOString() : null];
  const same = row => row && [row.business_id, row.kind, row.title, row.content, row.status, row.due_at].every((x, i) => x === fields[i]);
  const conflict = () => json({ error: "다른 곳에서 바뀐 기록입니다. 최신 기록을 확인한 뒤 다시 저장하세요." }, 409);
  const current = await first(db, "SELECT * FROM management_records WHERE id=?", id);
  if (patch) {
    if (!current) return json({ error: "기록을 찾을 수 없습니다." }, 404);
    if (same(current)) return json(current);
    if (current.revision !== v.revision || current.business_id !== v.businessId) return conflict();
    const result = await run(db, `UPDATE management_records SET business_id=?,kind=?,title=?,content=?,status=?,due_at=?,
      revision=revision+1,updated_at=? WHERE id=? AND revision=?`, ...fields, now(), id, v.revision);
    if (Number(result.meta?.changes ?? result.changes) === 0) return conflict();
    return json(await first(db, "SELECT * FROM management_records WHERE id=?", id));
  }
  if (current) return same(current) ? json(current) : conflict();
  const stamp = now();
  const result = await run(db, `INSERT OR IGNORE INTO management_records
    (id,business_id,kind,title,content,status,due_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`, id, ...fields, stamp, stamp);
  const saved = await first(db, "SELECT * FROM management_records WHERE id=?", id);
  return same(saved) ? json(saved, Number(result.meta?.changes ?? result.changes) ? 201 : 200) : conflict();
}
