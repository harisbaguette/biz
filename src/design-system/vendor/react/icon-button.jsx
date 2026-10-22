import React from 'react';
import { Button } from './button.jsx';
// A picture-only button. label is the name read aloud; children is the icon.
export function IconButton({ label, children, variant = 'ghost', ...props }) { return <Button {...props} variant={variant} aria-label={label} data-icon-only="">{children}</Button>; }
