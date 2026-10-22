CREATE TABLE IF NOT EXISTS revenue_months (
 account_id TEXT NOT NULL, year INTEGER NOT NULL CHECK(year BETWEEN 2000 AND 2100),
 month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
 amount_krw INTEGER CHECK(amount_krw IS NULL OR (amount_krw>=0 AND amount_krw<=1000000000000)),
 memo TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL CHECK(revision>=1), recorded_at TEXT NOT NULL,
 PRIMARY KEY(year,account_id,month)
);
CREATE TABLE IF NOT EXISTS revenue_requests (
 request_id TEXT PRIMARY KEY, payload TEXT NOT NULL, response TEXT NOT NULL,
 applied INTEGER NOT NULL DEFAULT 0 CHECK(applied IN (0,1))
);
