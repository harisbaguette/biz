'use client';
import React from 'react';
import { Field } from './field.jsx';
export function Select({label='공개 범위',items=[{value:'private',label:'나만 보기'},{value:'team',label:'팀과 공유'},{value:'public',label:'모두 공개'}],help,error,...props}) {
  return <Field label={label} help={help} error={error} {...props}>{input=><select {...input} className={'ds-input ds-select '+(props.className||'')}>{items.map(i=><option key={i.value} value={i.value} disabled={i.disabled}>{i.label}</option>)}</select>}</Field>;
}
