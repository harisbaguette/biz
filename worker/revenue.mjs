// Confirmed manual monthly revenue. A missing value is never an inferred zero.
export async function revenue(req, url, db, { json, body, all, first, now }) {
  const fail = (code, message, status, details = null) => json({ error: message, code, message, details }, status);
  if (req.method === 'GET') {
    const raw = url.searchParams.get('year');
    if (!/^\d{4}$/.test(raw || '') || +raw < 2000 || +raw > 2100)
      return fail('INVALID_YEAR', '연도를 확인하세요.', 400);
    const rows = await all(db, `SELECT account_id AS accountId,year,month,amount_krw AS amountKrw,memo,revision,recorded_at AS recordedAt
      FROM revenue_months WHERE year=? ORDER BY account_id,month`, +raw);
    return json({ year: +raw, currency: 'KRW', source: 'manual', items: rows });
  }
  if (req.method !== 'POST') return fail('METHOD_NOT_ALLOWED', '수익 조회 또는 저장 요청을 사용하세요.', 405);
  let v;
  try { v = await body(req, 8000); }
  catch (error) { return fail('INVALID_BODY', error.message, error.status || 400); }
  const keys = ['requestId','accountId','year','month','amountKrw','memo','revision'];
  if (Object.keys(v).some(k => !keys.includes(k)) || keys.some(k => !(k in v)) ||
      typeof v.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(v.requestId) ||
      typeof v.accountId !== 'string' || !v.accountId || v.accountId.length > 100 ||
      !Number.isInteger(v.year) || v.year < 2000 || v.year > 2100 ||
      !Number.isInteger(v.month) || v.month < 1 || v.month > 12 ||
      !(v.amountKrw === null || (Number.isSafeInteger(v.amountKrw) && v.amountKrw >= 0 && v.amountKrw <= 1e12)) ||
      typeof v.memo !== 'string' || v.memo.length > 1000 || v.memo.includes('\0') ||
      !Number.isSafeInteger(v.revision) || v.revision < 0 || v.revision > 1e9)
    return fail('INVALID_REVENUE', '계정, 연월, 원 단위 금액과 기록 내용을 확인하세요.', 400);
  const source = await first(db, "SELECT data FROM snapshots WHERE id='miricanvas'");
  let accounts;
  try { accounts = source && JSON.parse(source.data).accounts; }
  catch { return fail('SOURCE_UNAVAILABLE', '계정 정보를 읽지 못했습니다. 연결 상태를 확인하세요.', 503); }
  if (!Array.isArray(accounts)) return fail('SOURCE_UNAVAILABLE', '계정 정보를 받은 뒤 기록할 수 있습니다.', 503);
  if (!accounts.some(a => a.id === v.accountId)) return fail('ACCOUNT_NOT_FOUND', '현재 연결된 계정을 선택하세요.', 404);
  const payload = JSON.stringify(keys.filter(k => k !== 'requestId').map(k => v[k]));
  const record = { accountId:v.accountId, year:v.year, month:v.month, amountKrw:v.amountKrw,
    memo:v.memo, revision:v.revision+1, recordedAt:now() };
  // Register the request and compare the revision in the same D1 transaction as the write.
  // Replays use the immutable original response and cannot overwrite a later revision.
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO revenue_requests(request_id,payload,response)
      SELECT ?,?,? WHERE (EXISTS(SELECT 1 FROM revenue_months WHERE account_id=? AND year=? AND month=? AND revision=?)
      OR (?=0 AND NOT EXISTS(SELECT 1 FROM revenue_months WHERE account_id=? AND year=? AND month=?)))`)
      .bind(v.requestId,payload,JSON.stringify(record),v.accountId,v.year,v.month,v.revision,v.revision,v.accountId,v.year,v.month),
    db.prepare(`INSERT INTO revenue_months(account_id,year,month,amount_krw,memo,revision,recorded_at)
      SELECT ?,?,?,?,?,?,? FROM revenue_requests WHERE request_id=? AND payload=? AND applied=0
      ON CONFLICT(year,account_id,month) DO UPDATE SET amount_krw=excluded.amount_krw,memo=excluded.memo,
      revision=excluded.revision,recorded_at=excluded.recorded_at WHERE revenue_months.revision=?`)
      .bind(v.accountId,v.year,v.month,v.amountKrw,v.memo,record.revision,record.recordedAt,v.requestId,payload,v.revision),
    db.prepare('UPDATE revenue_requests SET applied=1 WHERE request_id=? AND payload=?').bind(v.requestId,payload),
  ]);
  const saved = await first(db, 'SELECT payload,response FROM revenue_requests WHERE request_id=?',v.requestId);
  if (!saved) return fail('REVISION_CONFLICT', '다른 화면에서 수정된 기록입니다. 최신 기록을 불러온 뒤 다시 저장하세요.', 409);
  if (saved.payload !== payload) return fail('REQUEST_CONFLICT', '같은 저장 요청의 내용이 다릅니다. 다시 저장하세요.',409);
  return json(JSON.parse(saved.response));
}
