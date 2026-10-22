'use client';
import React, { useId } from 'react';
import { Input } from './input.jsx';
export function FieldLabel({ htmlFor, children, ...props }) { return <label {...props} htmlFor={htmlFor}>{children}</label>; }
export function FieldDescription({ id, children, ...props }) { return <p {...props} className="ds-help" id={id}>{children}</p>; }
export function Field({ id: suppliedId, label, help, error, state, children, ...props }) {
  const generatedId = useId(); const id = suppliedId || generatedId;
  const description = error || help;
  const inputProps = { ...props, id, 'aria-invalid': error ? true : undefined, 'aria-describedby': [props['aria-describedby'], description ? `${id}-help` : ''].filter(Boolean).join(' ') || undefined };
  return <div className="ds-field" data-state={error ? 'error' : props.disabled ? 'disabled' : state}>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    {children ? children(inputProps) : <Input {...inputProps} />}
    {description && <FieldDescription id={`${id}-help`}>{description}</FieldDescription>}
  </div>;
}
