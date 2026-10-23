export type Shortcut = { action: "close" | "help" | "overview" | "schedule" | "activity" | "automation" | "revenue" | "refresh" }
  | { action: "account" | "cycle" | "zoom"; value: number }
  | { action: "pan"; x: number; y: number };

// Physical letter keys also work while the Korean keyboard layout is active.
export function shortcutFor(event: KeyboardEvent, enabled: boolean): Shortcut | null {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.key === "Escape") return event.repeat ? null : { action: "close" };
  if (!enabled) return null;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="slider"],[role="listbox"],[role="menu"],[role="tablist"]')) return null;
  if (event.key === "?") return event.repeat ? null : { action: "help" };
  if (event.key === "+" || event.code === "NumpadAdd" || event.key === "=") return { action: "zoom", value: 1 };
  if (event.key === "-" || event.code === "NumpadSubtract") return { action: "zoom", value: -1 };
  if (event.shiftKey) return null;
  const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  if (directions[event.key]) { const [x, y] = directions[event.key]; return { action: "pan", x, y }; }
  if (event.repeat) return null;
  if (event.key === "Home" || event.code === "Digit0" || event.code === "Numpad0") return { action: "overview" };
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
  if (digit) return { action: "account", value: Number(digit[1]) };
  if (event.code === "BracketLeft" || event.code === "BracketRight") return { action: "cycle", value: event.code === "BracketLeft" ? -1 : 1 };
  const actions = { KeyS: "schedule", KeyH: "activity", KeyA: "automation", KeyF: "revenue", KeyR: "refresh" } as const;
  const action = actions[event.code as keyof typeof actions];
  return action ? { action } : null;
}
