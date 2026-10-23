import * as THREE from 'three';
import type { ProcessKey } from './layout';

/** Materials belong to a print workshop: ink, enamel, paper, glass and brass. */
export const industry={ground:'#dce5e0',rim:'#7f9d99',concrete:'#d3dfd9',floor:'#f0f1e9',road:'#d0dcd6',line:'#f8f4e6',steel:'#345863',blue:'#477985',white:'#faf8ed',dark:'#17343f',orange:'#ce9a59',mint:'#67b6a3',warning:'#cd9b53',danger:'#bd625a',unknown:'#8c9b9b',cargo:'#f0e7d5'} as const;
export const facilityRoles:Record<ProcessKey,string>={generation:'artwork-printing-press',review:'print-quality-gate',stock:'account-outgoing-prints',submission:'submission-planning-desk',inspection:'account-review-tables',archive:'account-publication-galleries',revenue:'monthly-revenue-ledger'};
export interface WorkshopTools {
  box:(w:number,h:number,d:number,color:string,x:number,y:number,z:number,parent:THREE.Object3D)=>THREE.Mesh;
  model:(name:string,parent:THREE.Object3D,w:number,d:number,h:number)=>THREE.Object3D|null;
  dynamic:<T extends THREE.Object3D>(object:T)=>T;
}
export interface StationParts {
  stock:THREE.Group[];review:THREE.Group[];archive:THREE.Group[];
  archiveStorage:THREE.Group;clock:THREE.Object3D|null;gate:THREE.Group;fault:THREE.Group;cart:THREE.Group;
  artwork:{area:'stock'|'review'|'archive';object:THREE.Object3D}[];
}
function place(tools:WorkshopTools,name:string,parent:THREE.Object3D,x:number,y:number,z:number,w:number,d:number,h:number){
  const holder=new THREE.Group();holder.position.set(x,y,z);parent.add(holder);const object=tools.model(name,holder,w,d,h);return {holder,object};
}
function metalRing(parent:THREE.Object3D,x:number,y:number,z:number,size:number,color:string){
  const mesh=new THREE.Mesh(new THREE.TorusGeometry(size,.06,7,20,Math.PI),new THREE.MeshStandardMaterial({color,metalness:.48,roughness:.36}));mesh.position.set(x,y,z);parent.add(mesh);return mesh;
}
/** Every account keeps its outgoing prints, review and finished pictures within arm's reach. */
export function buildAccountStation(group:THREE.Group,tools:WorkshopTools):StationParts {
  const {box,dynamic}=tools,stock:THREE.Group[]=[],review:THREE.Group[]=[],archive:THREE.Group[]=[],artwork:StationParts['artwork']=[];
  // A large examination table is the centre. Its open surface is visible when review is empty.
  box(4.9,.20,3.1,industry.dark,-.25,1.05,-.35,group);
  box(4.72,.12,2.96,industry.white,-.25,1.21,-.35,group);
  for(const x of [-2.35,1.85])for(const z of [-1.65,.95])box(.18,1.0,.18,industry.blue,x,.58,z,group);
  box(4.72,.13,.15,industry.orange,-.25,1.34,1.08,group);box(4.72,.13,.15,industry.orange,-.25,1.34,-1.78,group);for(const x of [-2.55,2.05])box(.13,.13,2.86,industry.orange,x,1.34,-.35,group);
  for(const x of [-1.9,1.4])box(.08,.035,1.95,industry.concrete,x,1.286,-.25,group);
  // Small outgoing pallet, visibly secondary to the review table.
  box(1.35,.13,1.50,industry.blue,-2.3,.27,1.45,group);
  for(const z of [1.0,1.45,1.9])box(1.40,.08,.19,industry.white,-2.3,.38,z,group);
  for(let i=0;i<3;i++){
    const {holder,object}=place(tools,'print-stack',group,-2.3,.44+i*.19,1.45,1.13,1.0,.20);dynamic(holder);holder.visible=false;stock.push(holder);if(object)artwork.push({area:'stock',object});
  }
  // Four piles are a density representation; the exact current number stays on the nameplate.
  for(let i=0;i<4;i++){
    const {holder,object}=place(tools,'print-stack',group,-1.25+(i%2)*1.9,1.36,-1.0+Math.floor(i/2)*1.25,1.72,1.16,.32);dynamic(holder);holder.rotation.y=(i%2===0?-.035:.035);holder.visible=false;review.push(holder);if(object)artwork.push({area:'review',object});
  }
  const clockPlace=place(tools,'review-clock',group,1.8,1.28,-1.4,.68,.39,.83);dynamic(clockPlace.holder);
  // A broad picture is shown only when an actual published thumbnail is available.
  box(1.4,.11,3.15,industry.blue,2.65,.55,-.05,group);
  for(const z of [-1.5,1.4])box(.13,.6,.16,industry.steel,2.65,.28,z,group);
  for(let i=0;i<2;i++){
    const {holder,object}=place(tools,'gallery-frame',group,2.65+i*.1,.62,.65-i*1.05,1.45,.68,1.62);dynamic(holder);holder.visible=false;archive.push(holder);if(object)artwork.push({area:'archive',object});
  }
  const archiveStorage=dynamic(new THREE.Group());archiveStorage.position.set(2.65,.61,.0);group.add(archiveStorage);
  box(1.6,.65,2.3,industry.mint,0,.35,0,archiveStorage);box(1.5,.11,2.1,industry.steel,0,.72,0,archiveStorage);
  for(let i=0;i<4;i++)box(1.25,.025,.08,industry.white,0,.76,-.72+i*.45,archiveStorage);box(.65,.035,.65,industry.mint,0,.81,0,archiveStorage);const topTick=box(.23,.035,.10,industry.white,-.12,.85,.02,archiveStorage);topTick.rotation.y=-.65;const topTick2=box(.40,.035,.10,industry.white,.08,.85,.0,archiveStorage);topTick2.rotation.y=.65;
  box(.42,.42,.07,industry.mint,0,.44,1.2,archiveStorage);const tick=box(.23,.06,.035,industry.white,-.07,.43,1.25,archiveStorage);tick.rotation.z=-.65;const tick2=box(.34,.06,.035,industry.white,.10,.48,1.25,archiveStorage);tick2.rotation.z=.65;archiveStorage.visible=false;
  // A short roller incline joins outgoing sheets to the examination well.
  const feed=new THREE.Group();feed.position.set(-1.55,.85,1.15);feed.rotation.y=-.65;feed.rotation.x=-.25;group.add(feed);box(.68,.12,1.65,industry.steel,0,0,0,feed);
  for(let i=0;i<5;i++){const roller=new THREE.Mesh(new THREE.CylinderGeometry(.065,.065,.7,10),new THREE.MeshStandardMaterial({color:industry.white,roughness:.4,metalness:.3}));roller.rotation.z=Math.PI/2;roller.position.set(0,.08,-.65+i*.325);feed.add(roller);}
  const gate=dynamic(new THREE.Group());gate.position.set(-2.3,0,2.05);group.add(gate);
  for(const x of [-.82,.82])box(.17,1.3,.25,industry.dark,x,.8,0,gate);box(1.85,.38,.25,industry.danger,0,1.2,0,gate);for(const x of [-.6,0,.6]){const stripe=box(.15,.39,.035,industry.orange,x,1.2,.15,gate);stripe.rotation.z=-.3;}
  box(.48,.50,.16,industry.orange,.1,1.23,.22,gate);metalRing(gate,.1,1.54,.22,.18,industry.orange);gate.visible=false;
  const fault=dynamic(new THREE.Group());fault.position.set(-1.35,.18,1.75);fault.scale.setScalar(1.65);group.add(fault);
  box(.75,.3,.48,industry.danger,0,.22,0,fault);const sign=new THREE.Mesh(new THREE.ConeGeometry(.4,.9,3),new THREE.MeshStandardMaterial({color:industry.orange,roughness:.45,metalness:.15}));sign.rotation.y=Math.PI;sign.position.set(-.15,.88,0);fault.add(sign);const handle=box(.5,.09,.09,industry.white,0,.43,0,fault);handle.rotation.z=-.35;metalRing(fault,.16,.67,0,.15,industry.dark);fault.visible=false;
  const cart=dynamic(new THREE.Group());cart.position.set(-1.3,.20,1.48);group.add(cart);
  box(.9,.1,.7,industry.mint,0,.28,0,cart);box(.08,.6,.08,industry.steel,.4,.55,-.26,cart);box(.08,.6,.08,industry.steel,.4,.55,.26,cart);box(.08,.08,.62,industry.steel,.4,.86,0,cart);
  for(const x of [-.32,.32])for(const z of [-.25,.25]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.08,9),new THREE.MeshStandardMaterial({color:industry.dark,roughness:.7}));wheel.rotation.z=Math.PI/2;wheel.position.set(x,.12,z);cart.add(wheel);}
  return {stock,review,archive,archiveStorage,clock:clockPlace.object,gate,fault,cart,artwork};
}
export interface SharedParts {
  active:THREE.Object3D[];months:THREE.Mesh[];monthSeals:THREE.Mesh[];
  rollers?:THREE.Group[];
  lamps?:{process:'generation'|'review';material:THREE.MeshStandardMaterial}[];
}
export function buildPrintPress(group:THREE.Group,tools:WorkshopTools):SharedParts {
  const {box,model,dynamic}=tools,active:THREE.Object3D[]=[],rollers:THREE.Group[]=[],lamps:NonNullable<SharedParts['lamps']>=[];
  // An open stamping press and a separate articulated quality-inspection bay.
  // The animation envelope fits inside each bay, including the fully extended piston.
  box(13.5,.18,6.2,industry.white,-.6,.28,0,group);
  box(7.2,.6,3.3,industry.blue,-2.8,.73,-.45,group);
  for(const x of [-6.05,.45]){
    box(.38,2.9,2.7,industry.danger,x,1.86,-.45,group);
    box(.46,.18,2.85,industry.orange,x,3.36,-.45,group);
  }
  box(6.9,.26,.65,industry.blue,-2.8,3.34,-1.7,group);
  box(4.7,.12,2.4,industry.dark,-2.8,1.08,-.45,group);
  const press=new THREE.Group();press.position.set(-3.4,1.16,-.6);group.add(press);
  model('piston-square',press,1.1,1.1,2.2);
  const hopper=new THREE.Group();hopper.position.set(-1.2,1.17,-.65);group.add(hopper);model('print-stack',hopper,1.4,1.5,.4);active.push(hopper);
  box(4.8,.42,.12,industry.dark,-2.8,.83,1.25,group);box(5.1,.10,.24,industry.orange,-2.8,.58,1.35,group);
  const output=new THREE.Group();output.position.set(-2.8,.45,2.5);group.add(output);model('conveyor-long',output,1.7,3.8,.65);
  // The arm's sweep is on the right of the press; it never sweeps through the housing.
  box(3.2,.24,3.2,industry.blue,3.8,.48,-.8,group);
  const arm=new THREE.Group();arm.position.set(3.8,.62,-.8);group.add(arm);model('robot-arm-pick',arm,3.0,3.0,3.2);
  const cross=new THREE.Group();cross.position.set(2.65,.43,1.5);cross.rotation.y=Math.PI/2;group.add(cross);model('conveyor-long',cross,1.3,4.2,.65);
  for(let i=0;i<3;i++){
    const axle=dynamic(new THREE.Group());axle.position.set(-2.8,1.06,1.9+i*.5);group.add(axle);
    const roller=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,1.45,16),new THREE.MeshStandardMaterial({color:industry.steel,roughness:.3,metalness:.2}));roller.rotation.z=Math.PI/2;axle.add(roller);
    box(1.4,.035,.04,industry.orange,0,.135,0,axle);rollers.push(axle);
  }
  for(const [process,x]of [['generation',-5.8],['review',5.05]]as const){
    box(.16,.7,.16,industry.dark,x,1.0,1.0,group);
    const lamp=dynamic(box(.36,.30,.36,industry.unknown,x,1.52,1.0,group));lamps.push({process,material:lamp.material as THREE.MeshStandardMaterial});
  }
  const print=dynamic(new THREE.Group());print.position.set(-2.8,1.24,2.15);group.add(print);model('print-stack',print,1.65,1.2,.25);active.push(print);
  return {active,rollers,lamps,months:[],monthSeals:[]};
}
/** The spare work bays hold a compact ledger and the submission clock, not remote warehouses. */
export function buildLedger(group:THREE.Group,tools:WorkshopTools):SharedParts {
  const {box,dynamic}=tools,months:THREE.Mesh[]=[],monthSeals:THREE.Mesh[]=[];
  box(4.7,.23,3.5,industry.blue,0,.80,0,group);for(const x of [-2,2])box(.25,.75,2.8,industry.dark,x,.43,0,group);
  box(3.9,.13,2.7,industry.dark,0,1.0,-.1,group);const left=box(1.75,.10,2.5,industry.white,-.9,1.18,-.1,group);left.rotation.z=-.12;const right=box(1.75,.10,2.5,industry.white,.9,1.18,-.1,group);right.rotation.z=.12;
  for(let i=0;i<12;i++){
    const x=-1.5+(i%6)*.6,z=-.9+Math.floor(i/6)*1.1;
    const month=dynamic(box(.43,.06,.72,industry.concrete,x,1.30,z,group));months.push(month);
    const seal=dynamic(new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,.06,12),new THREE.MeshStandardMaterial({color:industry.mint,metalness:.2,roughness:.6})));seal.position.set(x,1.36,z);group.add(seal);monthSeals.push(seal);
  }
  return {active:[],months,monthSeals};
}
export function buildSubmissionClock(group:THREE.Group,tools:WorkshopTools):SharedParts {
  const {box,model}=tools;box(4.6,.20,3.5,industry.white,0,.38,0,group);box(3.9,2.0,.35,industry.blue,0,1.55,-.85,group);
  const holder=new THREE.Group();holder.position.set(-1.1,.5,.8);group.add(holder);const clock=model('review-clock',holder,1.05,.6,1.3);for(const name of ['hour-hand','minute-hand']){const hand=clock?.getObjectByName(name);if(hand)hand.visible=false;}
  for(let i=0;i<13;i++)box(.42,.32,.12,industry.concrete,-1.45+(i%6)*.56,1.1+Math.floor(i/6)*.45,-.61,group);
  return {active:[],months:[],monthSeals:[]};
}
