import { Children, isValidElement, useEffect, useRef, useState, type FormEvent, type SelectHTMLAttributes } from "react";
import { Plus, RefreshCw } from "./Icons";
import type { Business } from "../types";
import { date, post, request } from "../data";
import { Empty, Modal } from "./Primitives";
import { Button, Input, Select } from "../design-system/components";
import "./Management.css";

interface RecordItem {
  id: string; business_id: string; kind: string; title: string; content: string;
  status: string; due_at: string | null; revision: number; created_at: string; updated_at: string;
}
interface Draft {
  id: string; businessId: string; kind: string; title: string; content: string;
  status: string; due: string; revision?: number;
}
const kinds: Record<string, string> = { plan: "계획", report: "보고", decision: "결정" };
const states: Record<string, string> = { planned: "예정", active: "진행 중", blocked: "해결 필요", done: "완료", recorded: "기록", archived: "보관" };
const statuses = (kind: string) => kind === "plan" ? ["planned", "active", "blocked", "done", "archived"] : ["recorded", "archived"];
const kstInput = (value: string | null) => value ? new Date(Date.parse(value) + 9 * 3600000).toISOString().slice(0, 16) : "";
function RecordSelect({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const items = Children.toArray(children).filter(isValidElement<{value:string;children:string;disabled?:boolean}>).map(option => ({value:String(option.props.value),label:String(option.props.children),disabled:option.props.disabled}));
  return <Select label={label} {...props} items={items} />;
}

export function Management({ businesses, toast }: { businesses: Business[]; toast: (text: string) => void }) {
  const [business, setBusiness] = useState("miricanvas");
  const [items, setItems] = useState<RecordItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [version, setVersion] = useState(0), [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null), [saveError, setSaveError] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    const controller = new AbortController(), current = ++generation.current;
    setLoading(true); setItems([]); setCursor(null); setError("");
    request<{ items: RecordItem[]; nextCursor: string | null }>("/management?businessId=" + encodeURIComponent(business), { signal: controller.signal })
      .then(v => { if (generation.current === current) { setItems(v.items); setCursor(v.nextCursor); } })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (generation.current === current) setLoading(false); });
    return () => controller.abort();
  }, [business, version]);
  async function more() {
    if (!cursor || loading) return;
    const current = generation.current;
    setLoading(true); setError("");
    try {
      const v = await request<{ items: RecordItem[]; nextCursor: string | null }>("/management?businessId=" + encodeURIComponent(business) + "&cursor=" + encodeURIComponent(cursor));
      if (current === generation.current) { setItems(old => [...new Map([...old, ...v.items].map(x => [x.id, x])).values()]); setCursor(v.nextCursor); }
    } catch (e) { if (current === generation.current) setError((e as Error).message); }
    finally { if (current === generation.current) setLoading(false); }
  }
  const edit = (item?: RecordItem) => {
    setSaveError("");
    setDraft(item ? { id: item.id, businessId: item.business_id, kind: item.kind, title: item.title, content: item.content,
      status: item.status, due: kstInput(item.due_at), revision: item.revision } :
      { id: crypto.randomUUID(), businessId: business, kind: "plan", title: "", content: "", status: "planned", due: "" });
  };
  async function save(event: FormEvent) {
    event.preventDefault(); if (!draft || busy) return;
    setBusy(true); setSaveError("");
    try {
      await post("/management" + (draft.revision ? "/" + encodeURIComponent(draft.id) : ""), {
        ...draft, dueAt: draft.kind === "plan" && draft.due ? new Date(draft.due + "+09:00").toISOString() : null,
      }, draft.revision ? "PATCH" : "POST");
      setDraft(null); setVersion(v => v + 1); toast("운영 기록을 저장했습니다.");
    } catch (e) { setSaveError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <>
    <div className="management-toolbar">
      <RecordSelect label="사업" value={business} onChange={e => setBusiness(e.target.value)}>
        <option value="portfolio">공통 운영</option>
        <option value="miricanvas">미리캔버스</option>
        {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
      </RecordSelect>
      <Button variant="outline" className="ui-button" onClick={() => edit()}><Plus size={17}/> 기록 추가</Button>
    </div>

    {error && <div role="alert"><p className="form-error">{error}</p><Button variant="ghost" className="ui-button text-button" onClick={() => setVersion(v => v + 1)}><RefreshCw size={16}/> 다시 불러오기</Button></div>}
    {!loading && !error && !items.length && <Empty>아직 운영 기록이 없습니다.</Empty>}
    <div className="management-records">{items.map(item => <details key={item.id} className={"management-record " + (item.status === "archived" ? "archived" : "")}>
      <summary><small>{kinds[item.kind]} · {states[item.status]} · {date(item.updated_at, true)}</small><strong>{item.title}</strong></summary>
      {item.due_at && <p className="muted">목표일 {date(item.due_at, true)}</p>}
      <p className="management-content">{item.content}</p>
      <Button variant="ghost" className="ui-button text-button" onClick={() => edit(item)}>기록 수정</Button>
    </details>)}</div>
    {loading && <p role="status" className="muted">기록을 불러오는 중…</p>}
    {cursor && <Button variant="outline" className="ui-button full" disabled={loading} onClick={more}>이전 기록 더 보기</Button>}
    {draft && <Modal title={draft.revision ? "운영 기록 수정" : "운영 기록 추가"} onClose={() => { if (!busy) setDraft(null); }}>
      <form className="ui-form" onSubmit={save}>
        <RecordSelect label="종류" value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value, status: e.target.value === "plan" ? "planned" : "recorded", due: e.target.value === "plan" ? draft.due : "" })}>
          {Object.entries(kinds).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
        </RecordSelect>
        <label className="ui-field">제목<Input className="ui-input" required maxLength={120} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label>
        <label className="ui-field">내용<textarea className="ui-textarea" required rows={8} maxLength={10000} value={draft.content} onChange={e => setDraft({ ...draft, content: e.target.value })}/></label>
        <RecordSelect label="상태" value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })}>
          {statuses(draft.kind).map(key => <option key={key} value={key}>{states[key]}</option>)}
        </RecordSelect>
        {draft.kind === "plan" && <label className="ui-field">목표일 · 한국 시간 (선택)<Input className="ui-input" type="datetime-local" value={draft.due} onChange={e => setDraft({ ...draft, due: e.target.value })}/></label>}
        {saveError && <p role="alert" className="form-error">{saveError}</p>}
        <Button variant="primary" type="submit" className="ui-button full" disabled={busy}>{busy ? "저장 중…" : "기록 저장"}</Button>
      </form>
    </Modal>}
  </>;
}
