export type ProcessKey = "generation" | "review" | "stock" | "submission";
export const processes: { key: ProcessKey; name: string; model: string }[] = [
  { key: "generation", name: "제작", model: "building-k" },
  { key: "review", name: "검수", model: "building-h" },
  { key: "stock", name: "비축", model: "building-e" },
  { key: "submission", name: "제출·심사", model: "building-f" },
];
export type Position = readonly [number, number];
export function siteLayout(width: number, height: number) {
  const cols = width / height > 1.75 ? 7 : width / height < 0.82 ? 3 : 4;
  const rows = Math.ceil(13 / cols);
  const plots: Position[] = Array.from({ length: 13 }, (_, i) => [
    ((i % cols) - (cols - 1) / 2) * 7.8,
    Math.floor(i / cols) * 8.2,
  ]);
  const processCols = cols === 3 ? 2 : 4;
  const facilities: Position[] = processCols === 2
    ? [[-4.6, -18.2], [4.6, -18.2], [4.6, -10], [-4.6, -10]]
    : processes.map((_, i) => [((i % processCols) - (processCols - 1) / 2) * 9.2, -10]);
  const all = [...plots, ...facilities];
  const minX = Math.min(...all.map(p => p[0])) - 4.4;
  const maxX = Math.max(...all.map(p => p[0])) + 4.4;
  const minZ = Math.min(...all.map(p => p[1])) - 4.1;
  const maxZ = (rows - 1) * 8.2 + 4.1;
  return { plots, facilities, minX, maxX, minZ, maxZ, cols };
}
// Default positions remain available to small read-only consumers.
export const plots = siteLayout(1440, 900).plots;
export interface Rect { left: number; right: number; top: number; bottom: number }
export interface LabelPosition { id: string; x: number; y: number; width: number; height: number }
/** Place complete hit rectangles, rather than only text pixels. Leader lines retain identity. */
export function arrangeLabels(nodes: LabelPosition[], safe: Rect): LabelPosition[] {
  const placed: LabelPosition[] = [];
  const overlap = (a: LabelPosition, b: LabelPosition) =>
    Math.max(0, (a.width + b.width) / 2 + 4 - Math.abs(a.x - b.x)) *
    Math.max(0, (a.height + b.height) / 2 + 4 - Math.abs(a.y - b.y));
  for (const node of nodes) {
    const clamp = (x: number, y: number): LabelPosition => ({ ...node,
      x: Math.max(safe.left + node.width / 2, Math.min(safe.right - node.width / 2, x)),
      y: Math.max(safe.top + node.height / 2, Math.min(safe.bottom - node.height / 2, y)),
    });
    const candidates = [clamp(node.x, node.y)];
    for (let radius = 12; radius <= 180; radius += 12)
      for (let a = 0; a < 16; a++)
        candidates.push(clamp(node.x + Math.cos(a * Math.PI / 8) * radius, node.y + Math.sin(a * Math.PI / 8) * radius));
    let best = candidates[0], score = Infinity;
    for (const c of candidates) {
      const collision = placed.reduce((sum, p) => sum + overlap(c, p), 0);
      const cost = collision * 10000 + (c.x - node.x) ** 2 + (c.y - node.y) ** 2;
      if (cost < score) { score = cost; best = c; }
    }
    if (placed.some(p => overlap(best, p) > 0)) {
      for (let y = safe.top + node.height / 2; y <= safe.bottom - node.height / 2; y += 8)
        for (let x = safe.left + node.width / 2; x <= safe.right - node.width / 2; x += 8) {
          const c = clamp(x, y);
          const cost = placed.reduce((sum, p) => sum + overlap(c, p), 0) * 10000 + (x - node.x) ** 2 + (y - node.y) ** 2;
          if (cost < score) { score = cost; best = c; }
        }
    }
    placed.push(best);
  }
  return placed;
}
