export type ProcessKey = "generation" | "review" | "stock" | "submission";
export const processes: { key: ProcessKey; name: string; model: string }[] = [
  { key: "generation", name: "제작", model: "building-A" },
  { key: "review", name: "검수", model: "building-B" },
  { key: "stock", name: "비축", model: "building-F" },
  { key: "submission", name: "제출·심사", model: "building-H" },
];
export type Position = readonly [number, number];
export const districtRanges = [[1, 4], [5, 7], [8, 10], [11, 13]] as const;
export const districtCenters: Position[] = [[-16, 18], [16, 18], [-16, -18], [16, -18]];
export function accountDistrict(number: number) { return number <= 4 ? 0 : number <= 7 ? 1 : number <= 10 ? 2 : 3; }
/** Physical neighbourhoods are stable across devices; cameras adapt, never account identity. */
export function siteLayout(_width: number, _height: number) {
  const plots: Position[] = [];
  const facilities: Position[] = [];
  districtCenters.forEach(([x, z], district) => {
    const [first, last] = districtRanges[district];
    const local: Position[] = district === 0 ? [[-5.5,-1], [5.5,-1], [-5.5,9], [5.5,9]] : [[-5.5,0],[5.5,0],[0,10]];
    for (let number=first; number<=last; number++) { const p=local[number-first]; plots[number-1]=[x+p[0],z+p[1]]; }
    facilities.push([x, z-11]);
  });
  return { plots, facilities, minX:-30, maxX:30, minZ:-35, maxZ:35, cols:2, districts:districtCenters };
}
// Default positions remain available to small read-only consumers.
export const plots = siteLayout(1440, 900).plots;
export interface Rect { left: number; right: number; top: number; bottom: number }
export interface LabelPosition { id: string; x: number; y: number; width: number; height: number }
/** Keep the current neighbourhood's full touch targets near their physical buildings. */
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
