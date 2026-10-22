CREATE TABLE IF NOT EXISTS snapshots (id TEXT PRIMARY KEY, data TEXT NOT NULL, received_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS snapshot_chunks (snapshot_id TEXT NOT NULL, part INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(snapshot_id, part));
CREATE TABLE IF NOT EXISTS thumbnails (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS preview_requests (id TEXT PRIMARY KEY, requested_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS schedules (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, title TEXT NOT NULL, due_at TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'planned', created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS schedules_due ON schedules(status,due_at);
CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, action TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', message TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS businesses (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'unconnected', note TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS attempts (ip TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS preview_failures (id TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, retry_at TEXT NOT NULL, message TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS commands_queued_payload ON commands(action,payload) WHERE status='queued';
CREATE TABLE IF NOT EXISTS command_requests (request_id TEXT PRIMARY KEY, command_id TEXT NOT NULL REFERENCES commands(id));
CREATE INDEX IF NOT EXISTS commands_history ON commands(created_at DESC,id DESC) WHERE status<>'queued';
CREATE TABLE IF NOT EXISTS management_records (
 id TEXT PRIMARY KEY, business_id TEXT NOT NULL, kind TEXT NOT NULL,
 title TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL,
 due_at TEXT, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS management_business_created ON management_records(business_id,created_at DESC,id DESC);
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
