import React from 'react';
// variant: primary (채움) · outline (윤곽) · ghost (글자). count joins the accessible name ("보내기 3개") and shows as a small number next to the label.
export function Button({ children, count, variant = 'primary', size = 'md', loading = false, disabled, className = '', type = 'button', ...props }) {
  const named = count != null && typeof children === 'string' ? `${children} ${count}개` : undefined;
  return <button {...props} type={type} className={`ds-button ${className}`} data-variant={variant} data-size={size} disabled={disabled || loading} aria-busy={loading || undefined} aria-label={props['aria-label'] ?? named}>
    {loading && <span className="ds-spinner" aria-hidden="true" />}{children}{count != null && <span className="ds-button-count" aria-hidden="true">{count}</span>}
  </button>;
}
