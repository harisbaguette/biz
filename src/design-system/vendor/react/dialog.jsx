'use client';
import React,{useEffect,useId,useRef,useState} from 'react';
import { Button } from './button.jsx';
export function Dialog({title='내용 확인',children='선택한 내용을 확인하세요.',trigger='열기',confirmLabel,open:controlled,defaultOpen=false,onOpenChange,onConfirm,drawer=false}) {
  const id=useId(),dialog=useRef(null),opener=useRef(null),[local,setLocal]=useState(defaultOpen),open=controlled??local;
  const change=value=>{setLocal(value);onOpenChange?.(value);};
  useEffect(()=>{const node=dialog.current;if(open&&!node.open){node.returnValue='';node.showModal();}else if(!open&&node.open)node.close();},[open]);
  return <div className="ds-dialog-demo"><Button aria-haspopup="dialog" aria-controls={id} onClick={e=>{opener.current=e.currentTarget;change(true);}}>{trigger}</Button><dialog ref={dialog} id={id} className={'ds-dialog'+(drawer?' ds-drawer':'')} aria-labelledby={id+'-title'} onClose={e=>{change(false);opener.current?.focus();if(e.currentTarget.returnValue==='confirm')onConfirm?.();}}>
    <h2 id={id+'-title'}>{title}</h2><div>{children}</div><form method="dialog" className="ds-confirm-row"><Button type="submit" variant="outline" value="cancel" autoFocus>{confirmLabel?'취소':'닫기'}</Button>{confirmLabel&&<Button type="submit" value="confirm">{confirmLabel}</Button>}</form>
  </dialog></div>;
}
