export type ProcessKey = "generation" | "review" | "stock" | "submission" | "inspection" | "archive" | "revenue";
export const processes: { key: ProcessKey; name: string; model: string }[] = [
  { key: "generation", name: "생산", model: "factory" },
  { key: "review", name: "제작 검수", model: "quality-gate" },
  { key: "stock", name: "재고", model: "warehouse" },
  { key: "submission", name: "제출", model: "dispatch" },
  { key: "inspection", name: "심사", model: "inspection" },
  { key: "archive", name: "승인·공개", model: "archive" },
  { key: "revenue", name: "수익", model: "treasury" },
];
export type Position = readonly [number, number];
/** Compatibility for saved clients. Accounts now share one continuous site. */
export const districtRanges = [[1, 13]] as const;
export const districtCenters: Position[] = [[0, 4]];
export function accountDistrict(_number: number) { return 0; }
/** All 13 warehouses fit the same connected campus; no account is paged away. */
export function siteLayout(width: number, height: number) {
  const landscape=width>=600 && width>height*1.2;
  if(landscape && height<500){
    const cols=width<740?5:7,spacing=width<740?15:10;
    const plots:Position[]=Array.from({length:13},(_,i)=>[-30+(i%cols)*spacing,-9+(Math.floor(i/cols))*18-(cols===5?9:0)]);
    const facilities:Position[]=[[-48,-11],[-48,11],[-5,-22],[44,0],[57,0],[70,0],[83,0]];
    return {plots,facilities,facilityRotations:[0,0,0,Math.PI/2,Math.PI/2,Math.PI/2,Math.PI/2],minX:-62,maxX:102,minZ:-26,maxZ:28,cols,districts:districtCenters,landscape,compactLandscape:true};
  }
  if(landscape){
    const plots:Position[]=Array.from({length:13},(_,i)=>[-25+(i%4)*9.6,-13+Math.floor(i/4)*9]);
    const facilities:Position[]=[[-46,-10],[-46,9],[-10,-20],[18,0],[31,0],[44,0],[57,0]];
    return {plots,facilities,facilityRotations:[0,0,0,Math.PI/2,Math.PI/2,Math.PI/2,Math.PI/2],minX:-57,maxX:66,minZ:-25,maxZ:29,cols:4,districts:districtCenters,landscape,compactLandscape:false};
  }
  const plots: Position[] = Array.from({ length:13 },(_,i)=>[-14.4+(i%4)*9.6,-17+Math.floor(i/4)*11]);
  // The 13th warehouse shares its row with the dispatch depot, keeping the line connected.
  const facilities: Position[] = [[-8,-30],[10,-30],[0,-22.7],[5.5,16],[0,29],[0,40],[0,51]];
  return { plots, facilities, minX:-22.5, maxX:22.5, minZ:-37, maxZ:58, cols:4, districts:districtCenters,facilityRotations:[0,0,0,0,0,0,0],landscape,compactLandscape:false };
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
