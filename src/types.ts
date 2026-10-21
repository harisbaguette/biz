export type Counts = Record<string, number>;
export interface Account {
  id: string;
  number: number;
  name: string;
  style: string;
  account: string;
  email: string | null;
  browser: string | null;
  bound: boolean;
  ready: number;
  target: number;
  phases: Counts;
  counts: Counts;
  inProgress: number;
  reserved: number;
  previewId: string | null;
  reviewOn: string | null;
  reviewDays: number;
  reviewBasis: string;
  capacity: {
    limit_count: number;
    pending: number;
    observed_at: string;
  } | null;
  status: string;
  message: string;
  checkedAt: string | null;
  nextCheckAt: string | null;
  running: boolean;
}
export interface Asset {
  id: string;
  title: string;
  accountId: string;
  state: string;
  phase: string;
  owned: boolean;
  eligible: boolean;
  keywords: string[];
  updatedAt: string;
}
export interface Lane {
  status: string | null;
  phase: string | null;
  number: number | null;
  observedAt: string | null;
  started_at: string | null;
  checked_at: string | null;
}
export interface Snapshot {
  version: number;
  observedAt: string;
  receivedAt: string;
  accounts: Account[];
  assets: Asset[];
  calendar: {
    id: string;
    accountId: string;
    uploaded_on: string;
    check_on: string;
    checked_on: string | null;
    next_upload_on: string | null;
    review_business_days: number;
    review_day_basis: string;
    note: string;
  }[];
  recent: {
    id: number;
    accountId: string;
    state: string;
    recorded_at: string;
    title: string;
  }[];
  automation: {
    enabled: boolean;
    productionEnabled: boolean;
    runningAccount: number | null;
    lastRunAt: string | null;
    lastPollAt: string | null;
    nextAt: string | null;
    intervalSeconds: number;
    statusObservedAt?: string | null;
    runLockActive?: boolean | null;
    pollIntervalSeconds?: number;
    lanes: Record<string, Lane>;
  };
}
export interface Schedule {
  id: string;
  account_id: string;
  title: string;
  due_at: string;
  kind: "memo" | "recheck";
  status: string;
  created_at: string;
  command_message?: string | null;
  command_status?: string | null;
  command_updated_at?: string | null;
}
export interface Command {
  id: string;
  action: string;
  payload: Record<string, unknown>;
  status: string;
  message: string;
  created_at: string;
  updated_at?: string;
}
export interface Business {
  id: string;
  name: string;
  kind: string;
  status: string;
  note: string;
}
export interface WorldData {
  snapshot: Snapshot | null;
  schedules: Schedule[];
  commands: Command[];
  businesses: Business[];
  thumbnails: string[];
  previewFailures?: string[];
  scheduleHistory?: { total: number; hasMore: boolean; nextCursor: string | null };
}
export type Panel =
  | "account"
  | "accounts"
  | "inventory"
  | "schedule"
  | "alerts"
  | "automation"
  | "businesses"
  | "activity"
  | null;
export type Layer = "status" | "stock" | "review";
