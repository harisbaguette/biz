import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Account } from '../types';
import type { RevenueLedger, RevenueRecord } from '../finance-types';
import { revenueTotal } from '../finance-types';
import { accountLabel, n, post, request } from '../data';
import { Button, Input, Select } from '../design-system/components';
import './Finance.css';

type Draft = { month: number; amount: string; memo: string; revision: number; unrecorded: boolean };
export function Finance({ accounts, initialAccountId, initialYear, toast, onChanged, onAccountChange }: {
  accounts: Account[]; initialAccountId?: string | null; initialYear?: number; toast: (text: string) => void;
  onChanged?: (ledger: RevenueLedger) => void; onAccountChange?: (accountId: string) => void;
}) {
  const thisYear = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date()));
  const [year, setYear] = useState(() => Number.isInteger(initialYear) && initialYear! >= 2000 && initialYear! <= thisYear ? initialYear! : thisYear);
  const [accountId, setAccountId] = useState(initialAccountId || accounts[0]?.id || '');
  const [ledger, setLedger] = useState<RevenueLedger | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null), [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(''), [conflict, setConflict] = useState(false), [refresh, setRefresh] = useState(0);
  const editor = useRef<HTMLFormElement>(null), origin = useRef<HTMLButtonElement | null>(null);
  const retry = useRef<{ signature: string; id: string } | null>(null);
  const changed = useRef(onChanged); changed.current = onChanged;
  const accountChanged = useRef(onAccountChange); accountChanged.current = onAccountChange;
  useEffect(() => { if (accountId) accountChanged.current?.(accountId); }, [accountId]);
  useEffect(() => {
    const abort = new AbortController(); setLoading(true); setError(''); setLedger(null);
    request<RevenueLedger>('/revenue?year=' + year, { signal: abort.signal })
      .then(value => { if (!abort.signal.aborted) { setLedger(value); changed.current?.(value); } })
      .catch(e => { if (!abort.signal.aborted) setError(e.message); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [year, refresh]);
  useEffect(() => { if (draft) { editor.current?.scrollIntoView({ block: 'nearest' }); editor.current?.querySelector<HTMLInputElement>('input[inputmode=numeric]')?.focus({ preventScroll: true }); } }, [draft?.month]);
  const months = ledger?.items.filter(item => item.accountId === accountId) || [];
  const recorded = months.filter(item => item.amountKrw !== null);
  const edit = (month: number, button: HTMLButtonElement) => {
    const item = months.find(row => row.month === month);
    origin.current = button; setSaveError(''); setConflict(false); retry.current = null;
    setDraft({ month, amount: item?.amountKrw == null ? '' : String(item.amountKrw), memo: item?.memo || '', revision: item?.revision || 0, unrecorded: false });
  };
  const close = () => { setDraft(null); setSaveError(''); setConflict(false); requestAnimationFrame(() => origin.current?.focus()); };
  async function latest() {
    if (!draft || saving) return;
    setSaving(true);
    try {
      const value = await request<RevenueLedger>('/revenue?year=' + year);
      const current = value.items.find(row => row.accountId === accountId && row.month === draft.month);
      setLedger(value); changed.current?.(value);
      setDraft(old => old && ({ ...old, revision: current?.revision || 0 }));
      setSaveError(`최신 기록: ${current?.amountKrw == null ? '미기록' : n(current.amountKrw) + '원'}. 입력한 내용은 유지했습니다. 확인 후 저장하세요.`);
      setConflict(false); retry.current = null;
    } catch (e) { setSaveError((e as Error).message); }
    finally { setSaving(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!draft || saving || !ledger) return;
    const amount = draft.unrecorded ? null : Number(draft.amount);
    if (!draft.unrecorded && (!/^\d+$/.test(draft.amount) || !Number.isSafeInteger(amount) || amount! > 1e12)) {
      setSaveError('0원부터 1조 원까지 원 단위 숫자로 입력하세요.'); return;
    }
    const data = { accountId, year, month: draft.month, amountKrw: amount, memo: draft.memo, revision: draft.revision };
    const signature = JSON.stringify(data);
    if (retry.current?.signature !== signature) retry.current = { signature, id: crypto.randomUUID() };
    setSaving(true); setSaveError('');
    try {
      const item = await post<RevenueRecord>('/revenue', { ...data, requestId: retry.current.id });
      const value = { ...ledger, items: [...ledger.items.filter(row => !(row.accountId === accountId && row.month === item.month)), item] };
      setLedger(value); changed.current?.(value); close(); toast(item.amountKrw === null ? '미기록으로 변경했습니다.' : '확정 수익을 기록했습니다.');
    } catch (e) {
      const message = (e as Error).message; setSaveError(message);
      setConflict(message.includes('최신 기록'));
    } finally { setSaving(false); }
  }
  if (!accounts.length) return <p className="muted">계정 정보가 연결되면 월별 수익을 기록할 수 있습니다.</p>;
  return <section className="finance-ledger" aria-label="월별 수익 금고">
    <div className="finance-controls">
      <Select label="계정" value={accountId} disabled={!!draft || loading} items={accounts.map(account => ({ value: account.id, label: accountLabel(account) }))} onChange={e => setAccountId(e.target.value)}/>
      <Select label="연도" value={String(year)} disabled={!!draft || loading} items={Array.from({ length: thisYear - 1999 }, (_, i) => ({ value: String(thisYear - i), label: (thisYear - i) + '년' }))} onChange={e => setYear(Number(e.target.value))}/>
    </div>
    <div className="finance-balance"><small>기록한 {recorded.length}/12개월 합계</small><strong>{ledger ? (recorded.length ? n(revenueTotal(recorded)) + '원' : '미기록') : '—'}</strong></div>
    <p className="finance-source">수동 확정 기록 · 자동 수익 수집 미연결</p>
    {loading && <p role="status">장부를 여는 중…</p>}
    {error && <div role="alert"><p className="form-error">{error}</p><Button variant="outline" onClick={() => setRefresh(v => v + 1)}>다시 불러오기</Button></div>}
    <div className="finance-vaults" aria-label="12개월 수익 기록">{Array.from({ length: 12 }, (_, index) => {
      const month = index + 1, item = months.find(row => row.month === month), known = item?.amountKrw != null;
      return <Button key={month} variant="outline" className={'finance-vault ' + (known ? 'recorded' : 'unrecorded')} disabled={!ledger || loading || !!draft} aria-label={`${month}월 ${known ? n(item!.amountKrw!) + '원' : '미기록'} 기록 편집`} onClick={e => edit(month, e.currentTarget)}>
        <span className="finance-vault-door" aria-hidden="true"><i/><b>{String(month).padStart(2, '0')}</b></span>
        <span className="finance-vault-month">{month}월</span><strong>{known ? n(item!.amountKrw!) + '원' : '미기록'}</strong>
      </Button>;
    })}</div>
    {!draft && <p className="finance-hint">월을 눌러 기록합니다. 미기록은 0원과 구분됩니다.</p>}
    {draft && <form ref={editor} className="finance-editor ui-form" aria-label={`${draft.month}월 수익 편집`} onSubmit={save}>
      <strong>{year}년 {draft.month}월 · {accountLabel(accounts.find(a => a.id === accountId) || accounts[0])}</strong>
      <label className="ui-field">확정 수익 · 원<Input inputMode="numeric" pattern="[0-9]+" maxLength={13} required={!draft.unrecorded} disabled={saving || draft.unrecorded} value={draft.amount} placeholder="0" onChange={e => setDraft({ ...draft, amount: e.target.value })}/></label>
      <label className="ui-field">메모 · 선택<Input maxLength={1000} disabled={saving} value={draft.memo} onChange={e => setDraft({ ...draft, memo: e.target.value })}/></label>
      <label className="finance-clear"><input type="checkbox" checked={draft.unrecorded} disabled={saving} onChange={e => setDraft({ ...draft, unrecorded: e.target.checked })}/>미기록으로 변경</label>
      {saveError && <p role="alert" className="form-error">{saveError}</p>}
      {conflict && <Button type="button" variant="outline" disabled={saving} onClick={latest}>최신 기록 확인 · 입력 유지</Button>}
      <div className="finance-actions"><Button type="button" variant="outline" disabled={saving} onClick={close}>취소</Button><Button type="submit" disabled={saving || conflict}>{saving ? '저장 중…' : '기록 저장'}</Button></div>
    </form>}
  </section>;
}
