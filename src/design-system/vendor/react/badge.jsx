import React from 'react';
// look: soft (연한 면) or icon (아이콘 붙음 — put the icon first in children).
export function Badge({ children, tone = 'neutral', look, ...props }) { return <span {...props} className="ds-badge" data-tone={tone} data-look={look}>{children}</span>; }
