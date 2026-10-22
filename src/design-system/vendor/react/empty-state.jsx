import React from 'react';
import { Button } from './button.jsx';
// Why nothing shows, and the one way back.
export function EmptyState({ children = '일치하는 컬렉션이 없어요.', actionLabel = '전체 보기', onAction }) { return <div className="ds-empty"><p>{children}</p><Button variant="outline" onClick={onAction}>{actionLabel}</Button></div>; }
