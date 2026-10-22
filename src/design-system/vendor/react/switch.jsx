import React from 'react';
export function Switch({ children, className = '', ...props }) { return <label className={`ds-choice ${className}`}><input {...props} type="checkbox" role="switch" className="ds-switch" />{children}</label>; }
