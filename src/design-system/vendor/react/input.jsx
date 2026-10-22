import React from 'react';
// look: box (윤곽, the default box) or filled (채움).
export function Input({ look, className = '', ...props }) { return <input {...props} className={`ds-input ${className}`} data-look={look} />; }
// The inputs that keep a helper inside the same box (clear, unit, stepper, password, date range) are built from these two.
export function InputGroup({ className = '', children, ...props }) { return <span {...props} className={`ds-input-group ${className}`}>{children}</span>; }
export function InputTool({ children, ...props }) { return <button type="button" {...props} className="ds-input-tool">{children}</button>; }
