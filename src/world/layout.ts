export type ProcessKey='generation'|'review'|'stock'|'submission'|'inspection'|'archive'|'revenue';
export type Position=readonly[number,number];
export const processes:{key:ProcessKey;name:string;model:string}[]=[{key:'generation',name:'인쇄기',model:'print-press'},{key:'review',name:'인쇄 검수',model:'quality-gate'},{key:'stock',name:'출고 작품',model:'print-stack'},{key:'submission',name:'제출 설정',model:'submission-clock'},{key:'inspection',name:'계정별 심사',model:'review-table'},{key:'archive',name:'공개 작품',model:'gallery-frame'},{key:'revenue',name:'월 수익',model:'revenue-ledger'}];
export const districtRanges=[[1,13]] as const;
export const districtCenters:Position[]=[[0,0]];
export function accountDistrict(_number:number){return 0;}
/** Identity stays in reading order; each account is a complete local work cycle. */
export function siteLayout(width:number,height:number){
 const landscape=width>=600&&width>height*1.2,compactPortrait=!landscape&&height<720,compactLandscape=landscape&&height<500,cols=landscape?5:3,rowGap=landscape?(compactLandscape?16:10):compactPortrait?12:11,colGap=landscape?(compactLandscape?22:8.5):compactPortrait?11.5:7;
 const plots:Position[]=Array.from({length:13},(_,i)=>[landscape?-2*colGap+(i%cols)*colGap:-colGap+(i%cols)*colGap,(landscape?(compactLandscape?-16:-8):compactPortrait?-17.5:-12.5)+Math.floor(i/cols)*rowGap]);
 const facilities:Position[]=compactLandscape?[[-56,0],[-52,0],[0,0],[44,16],[0,0],[0,0],[22,16]]:landscape?[[-30,-2],[-26,-2],[0,0],[17,12],[0,0],[0,0],[8.5,12]]:[[0,-22],[5,-22],[0,0],[colGap,compactPortrait?30.5:31.5],[0,0],[0,0],[0,compactPortrait?30.5:31.5]];
 return {plots,facilities,facilityRotations:[0,0,0,0,0,0,0],minX:landscape?(compactLandscape?-64:-39):-colGap-4.3,maxX:landscape?(compactLandscape?49:23):colGap+4.3,minZ:landscape?(compactLandscape?-19:-13):-26,maxZ:landscape?(compactLandscape?28:18.5):41,cols,rowGap,colGap,districts:districtCenters,landscape,compactPortrait,compactLandscape};
}
export const plots=siteLayout(1440,900).plots;
export interface Rect{left:number;right:number;top:number;bottom:number}
export interface LabelPosition{id:string;x:number;y:number;width:number;height:number}
/** A compatibility helper for non-world consumers; the workshop preserves physical anchors. */
export function arrangeLabels(nodes:LabelPosition[],safe:Rect){return nodes.map(node=>({...node,x:Math.max(safe.left+node.width/2,Math.min(safe.right-node.width/2,node.x)),y:Math.max(safe.top+node.height/2,Math.min(safe.bottom-node.height/2,node.y))}));}
