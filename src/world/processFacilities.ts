import * as THREE from 'three';
import type { ProcessKey } from './layout';

/** One restrained material family for every machine, warehouse and game control. */
export const industry = {
  ground:'#86a68b', rim:'#718b79', concrete:'#d6ded1', floor:'#b4c5b8',
  road:'#485f62', line:'#eadca6', steel:'#41666c', blue:'#547c8b',
  white:'#e7ede2', dark:'#263f44', orange:'#d3944e', mint:'#70b8a2',
  warning:'#e09b52', danger:'#c65c4d', unknown:'#8a9694', cargo:'#b98d60',
} as const;
export const facilityRoles: Record<ProcessKey,string> = {
  generation:'production-line',review:'quality-gate',stock:'account-warehouses',
  submission:'dispatch-depot',inspection:'review-bays',archive:'approved-storage',revenue:'monthly-treasury',
};
export interface FacilityTools {
  key:ProcessKey; group:THREE.Group;
  model:(name:string,parent:THREE.Object3D,width:number,depth:number,height:number)=>THREE.Object3D|null;
  atModel:(name:string,x:number,z:number,width:number,depth:number,height:number,parent:THREE.Object3D)=>THREE.Object3D|null;
  box:(w:number,h:number,d:number,color:string,x:number,y:number,z:number,parent:THREE.Object3D)=>THREE.Mesh;
}
export interface FacilityParts { height:number; active:THREE.Object3D[]; bays:THREE.Group[]; monthBins:THREE.Mesh[]; monthDoors:THREE.Mesh[]; monthSeals:THREE.Mesh[]; }
function dynamic<T extends THREE.Object3D>(object:T){object.userData.dynamic=true;if(object instanceof THREE.Mesh)object.material=Array.isArray(object.material)?object.material.map(m=>m.clone()):object.material.clone();return object;}

/** Open fronts keep the stock itself visible, including an unmistakably empty rack. */
export function buildWarehouse(group:THREE.Group,box:FacilityTools['box']) {
  box(8.1,.4,7.1,industry.concrete,0,.28,0,group);
  box(7.7,.14,6.7,industry.floor,0,.56,0,group);
  box(7.7,2.45,.24,industry.blue,0,1.85,-3.2,group);
  for(const x of [-3.72,3.72])box(.22,1.9,6.2,industry.white,x,1.6,-.05,group);
  box(8.05,.3,.65,industry.steel,0,3.2,-3.05,group);
  for(const x of [-3.7,3.7])box(.26,3.0,.27,industry.steel,x,2.08,2.95,group);
  box(8.05,.32,.36,industry.blue,0,3.6,2.95,group);
  // Two shelves per bay; the empty floor and bare shelf grid remain visible at zero stock.
  for(const x of [-2.55,0,2.55]){
    for(const edge of [-.95,.95])box(.12,2.32,4.2,industry.steel,x+edge,1.78,-.15,group);
    for(const y of [.73,1.61,2.49]){
      for(const edge of [-.96,.96])box(.12,.10,4.1,industry.white,x+edge,y,-.15,group);
      for(const z of [-2.14,1.84])box(2.08,.10,.12,industry.white,x,y,z,group);
    }
  }
  box(5.6,.10,.3,industry.line,0,.62,3.05,group);
  return 3.6;
}

/** Facilities are authored around their actual role, never substituted with houses. */
export function buildProcessFacility({key,group,atModel,box}:FacilityTools):FacilityParts {
  const active:THREE.Object3D[]=[],bays:THREE.Group[]=[],monthBins:THREE.Mesh[]=[],monthDoors:THREE.Mesh[]=[],monthSeals:THREE.Mesh[]=[];
  group.userData.role=facilityRoles[key];
  if(key==='stock')return {height:0,active,bays,monthBins,monthDoors,monthSeals};
  if(key==='generation'||key==='review'){
    const w=key==='generation'?18:13;
    box(w,.65,10,industry.concrete,0,.25,0,group);
    box(w-.6,3.5,.35,industry.blue,0,2.22,-4.5,group);
    for(const x of [-w/2+.5,w/2-.5])box(.4,3.4,8.6,industry.white,x,2.2,0,group);
    box(w+.25,.45,3.2,industry.steel,0,4.18,-3.4,group);
    box(w+.25,.2,.45,industry.orange,0,4.28,-1.62,group);
    if(key==='generation'){
      atModel('machine',-4,-.2,5.4,5.5,3.5,group);
      const arm=atModel('robot-arm-a',3,-.4,4,4,3.5,group);if(arm){const elbow=arm.getObjectByName('element-b'),wrist=arm.getObjectByName('element-d');if(elbow)elbow.rotation.z=.65;if(wrist)wrist.rotation.z=-1.1;active.push(dynamic(arm));}
      atModel('conveyor-long',0,3.6,15,2.2,1.2,group);
      for(const x of [-7.2,-5.9]){
        const chimney=new THREE.Mesh(new THREE.CylinderGeometry(.55,.65,5.5,10),new THREE.MeshStandardMaterial({color:industry.steel,roughness:.8}));
        chimney.position.set(x,3.4,-3.6);group.add(chimney);
        const cap=box(1.55,.22,1.55,industry.white,x,6.2,-3.6,group);cap.rotation.y=Math.PI/4;
      }
      for(let i=0;i<5;i++){
        const item=dynamic(box(.72,.58,.72,industry.orange,-5+i*2.3,1.08,3.6,group));
        item.userData.beltOrigin=item.position.x;item.userData.belt=true;active.push(item);
      }
    }else{
      atModel('scanner-high',0,.8,5,5,4,group);
      atModel('conveyor-long',0,3.2,10.5,2.1,1.2,group);
      atModel('screen-wide',-3.7,-1.8,2.3,1.2,2.2,group);
      const sweep=dynamic(box(6,.08,.1,industry.mint,0,2.15,1.5,group));sweep.userData.scanner=true;active.push(sweep);
    }
    return {height:4.6,active,bays,monthBins,monthDoors,monthSeals};
  }
  if(key==='submission'){
    box(25,.6,8,industry.concrete,0,.25,0,group);
    box(24.5,2.9,.3,industry.blue,0,1.95,-3.5,group);
    box(25,.4,2.5,industry.steel,0,3.7,-2.7,group);
    for(const x of [-10,-5,0,5,10]){
      box(.22,3.4,5.8,industry.white,x,2,-.7,group);
      box(3.5,.12,3.8,industry.dark,x,.64,.1,group);
      box(3.2,.08,.4,industry.line,x,.74,2.6,group);
    }
    atModel('warning-traffic',11,2.3,1.2,1.2,3.2,group);
    return {height:3.8,active,bays,monthBins,monthDoors,monthSeals};
  }
  if(key==='inspection'||key==='archive'){
    box(41,.55,8.1,industry.concrete,0,.28,0,group);
    box(40.3,key==='inspection'?1.5:2.9,.3,key==='inspection'?industry.orange:industry.blue,0,key==='inspection'?1.35:2.05,-3.5,group);
    if(key==='archive')box(41,.5,2.45,industry.blue,0,3.7,-2.65,group);
    for(let i=0;i<13;i++){
      const bay=new THREE.Group();bay.position.set(-18+i*3,0,.25);group.add(bay);bays.push(bay);
      box(2.8,.12,5.4,industry.floor,0,.63,0,bay);
      for(const x of [-1.4,1.4])box(.12,key==='inspection'?1.3:2.4,5.4,industry.white,x,key==='inspection'?1.28:1.83,0,bay);
      box(2.5,.08,.3,industry.line,0,.72,2.5,bay);
      if(key==='inspection')box(2.45,.12,2.3,industry.steel,0,1.13,-1,bay);
      else for(const y of [1.2,2.1]){for(const x of [-1.18,1.18])box(.12,.10,4.6,industry.white,x,y,-.15,bay);for(const z of [-2.39,2.09])box(2.5,.10,.12,industry.white,0,y,z,bay);}
    }
    if(key==='inspection'){
      for(const x of [-15,0,15])atModel('scanner-high',x,.6,4.2,5,4.4,group);
      box(40,.3,.65,industry.orange,0,4.3,.8,group);
      for(const x of [-19.5,19.5])box(.55,4.1,.65,industry.steel,x,2.6,.8,group);
      atModel('conveyor-long',0,3.2,38,1.2,.9,group);
      const sweep=dynamic(box(39,.05,.12,industry.mint,0,2.3,.6,group));sweep.userData.scanner=true;active.push(sweep);
    }
    return {height:3.65,active,bays,monthBins,monthDoors,monthSeals};
  }
  // Twelve vault drawers correspond to twelve months. Unrecorded months remain open and empty.
  box(41,.6,8.2,industry.concrete,0,.3,0,group);
  box(40.3,3.0,.6,industry.steel,0,2.1,-3.3,group);
  box(41,.5,2.1,industry.white,0,3.85,-2.5,group);
  for(const x of [-20,20]){box(1.0,3.6,7.0,industry.steel,x,2.4,0,group);box(1.3,.35,7.3,industry.orange,x,4.3,0,group);}
  for(let i=0;i<12;i++){
    const x=-17.6+i*3.2;
    box(2.85,.16,4.9,industry.dark,x,.76,.1,group);
    for(const side of [-1,1])box(.14,1.9,4.9,industry.white,x+side*1.35,1.78,.1,group);
    const fill=dynamic(box(2.2,.8,2.6,industry.orange,x,1.25,.45,group));fill.visible=false;monthBins.push(fill);
    const door=dynamic(box(2.5,1.95,.2,industry.unknown,x,1.8,2.35,group));monthDoors.push(door);
    const seal=dynamic(new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,.1,10),new THREE.MeshStandardMaterial({color:industry.mint,emissive:industry.mint,emissiveIntensity:.15})));seal.rotation.x=Math.PI/2;seal.position.set(x+.83,1.83,2.5);group.add(seal);monthSeals.push(seal);
    const handle=box(.8,.13,.13,industry.steel,x,.9,2.6,group);handle.userData.month=i+1;
  }
  return {height:3.7,active,bays,monthBins,monthDoors,monthSeals};
}
