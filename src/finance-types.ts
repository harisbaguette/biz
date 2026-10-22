export interface RevenueRecord {
  accountId: string;
  year: number;
  month: number;
  /** null: 미기록. 0: 확인한 0원. */
  amountKrw: number | null;
  memo: string;
  revision: number;
  recordedAt: string;
}
export interface RevenueLedger {
  year: number;
  currency: 'KRW';
  source: 'manual';
  items: RevenueRecord[];
}
export const revenueTotal = (items: RevenueRecord[]) => items.reduce((sum, item) => sum + (item.amountKrw ?? 0), 0);
