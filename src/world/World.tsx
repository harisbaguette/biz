import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { AlertTriangle, LockKeyhole, Clock3, Package, Factory, ScanLine, Truck, RotateCcw, CalendarDays } from '../ui/Icons';
import type { Account, Command, Layer, Snapshot } from '../types';
import type { RevenueLedger } from '../finance-types';
import { accountLabel, severity, status, n } from '../data';
import { accountFlow, currentAssets, flowTotals, type AccountFlow } from '../operations-state';
import { siteLayout, processes, type ProcessKey, type Rect } from './layout';
import { buildProcessFacility, buildWarehouse, industry, type FacilityParts } from './processFacilities';
import { processState, commandObservation } from '../game-state';
import './World.css';

export interface WorldHandle {
  zoom:(delta:number)=>void; reset:()=>void; rotate:()=>void; focus:(id:string)=>void;
  visitDistrict:(index:number)=>void; focusProcess:(key:ProcessKey)=>void;
}
interface Props {
  snapshot:Snapshot; selected:string|null; layer:Layer; reduced:boolean; stale:boolean;
  onSelect:(id:string)=>void; onReady:()=>void;
  onInspectProcess?:(key:ProcessKey)=>void; activeProcess?:ProcessKey|null;
  commands?:Command[]; thumbnails?:string[]; revenue?:RevenueLedger|null;
  revenueAccountId?:string|null; revenueError?:string|null;
  district?:number; onDistrictChange?:(index:number)=>void; trayOpen?:boolean;
  safeTop?:number; safeBottom?:number;
}
interface CargoSlot { object:THREE.Group; sources:THREE.Mesh[]; }
interface CargoBatch { mesh:THREE.InstancedMesh; sources:THREE.Mesh[]; slots:THREE.Group[]; }
interface TruckState { group:THREE.Group; hazard:THREE.Mesh; origin:THREE.Vector3; tripStart:number|null; }
function observation(account:Account,commands:Command[]=[]){
  return commandObservation(account,commands.filter(c=>String(c.payload.accountId??c.payload.account_id??'')===account.id)
    .sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))[0]);
}
function AccountState({account,stale,commands}:{account:Account;stale:boolean;commands:Command[]}){
  if(stale)return <Clock3 size={12}/>;
  if(account.status==='login_required'||!account.bound)return <LockKeyhole size={12}/>;
  const command=observation(account,commands);
  if(['warning','danger'].includes(severity(account))||command?.tone==='danger')return <AlertTriangle size={12}/>;
  if(command?.tone==='unknown')return <Clock3 size={12}/>;
  return null;
}
function disposeObject(object:THREE.Object3D){
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  object.traverse(o=>{if(!(o instanceof THREE.Mesh))return;geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const value of Object.values(m))if(value instanceof THREE.Texture)textures.add(value);}});
  geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());
}
const modelFiles:Record<string,string>={
  machine:'/assets/industrial/machine.glb','robot-arm-a':'/assets/industrial/robot-arm-a.glb',
  'scanner-high':'/assets/industrial/scanner-high.glb','conveyor-long':'/assets/industrial/conveyor-long.glb',
  'screen-wide':'/assets/industrial/screen-wide.glb','warning-traffic':'/assets/industrial/warning-traffic.glb',
  crate:'/assets/game-v2/crate.glb',pallet:'/assets/game-v2/pallet.glb',delivery:'/assets/models/delivery.glb',
};
function worldMode(width:number,height:number){
  if(width<600||width<=height*1.2)return 'portrait';
  return height<500?(width<740?'landscape-five':'landscape-seven'):'landscape';
}
const hiddenMatrix=new THREE.Matrix4().makeScale(0,0,0);

const World=forwardRef<WorldHandle,Props>(function World(props,ref){
  const host=useRef<HTMLDivElement>(null),propsRef=useRef(props),revision=useRef(0),controller=useRef<WorldHandle|null>(null);
  const markers=useRef(new Map<string,HTMLButtonElement>());
  const [error,setError]=useState<string|null>(null),[loaded,setLoaded]=useState(false),[attempt,setAttempt]=useState(0),[missing,setMissing]=useState(0),[mode,setMode]=useState(()=>worldMode(innerWidth,innerHeight));
  const landscape=mode!=='portrait';
  propsRef.current=props;revision.current++;
  useImperativeHandle(ref,()=>({zoom:d=>controller.current?.zoom(d),reset:()=>controller.current?.reset(),rotate:()=>controller.current?.rotate(),focus:id=>controller.current?.focus(id),visitDistrict:i=>controller.current?.visitDistrict(i),focusProcess:key=>controller.current?.focusProcess(key)}),[]);
  useEffect(()=>{
    if(!host.current)return;
    const element=host.current;setLoaded(false);setError(null);setMissing(0);
    (window as unknown as {__bizWorld:unknown}).__bizWorld={ready:false};
    let disposed=false,lostContext=false,frame=0,dirty=true,ready=false,lastRevision=-1,lastDraw=0,lastTime=performance.now(),totalFrames=0,renderMs=0;
    let following=true,lastSafe='',safe:Rect={left:12,right:element.clientWidth-12,top:68,bottom:element.clientHeight-84};
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});}catch{setError('3D 화면을 시작하지 못했습니다.');propsRef.current.onReady();return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.98;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
    renderer.domElement.setAttribute('role','img');renderer.domElement.setAttribute('aria-label','생산 공장과 13개 계정 창고, 제출 운송, 심사, 승인 보관, 월별 수익이 연결된 산업 단지');
    element.prepend(renderer.domElement);
    const scene=new THREE.Scene();scene.background=new THREE.Color('#9fb6a4');
    const camera=new THREE.OrthographicCamera(-25,25,50,-50,.1,350),direction=new THREE.Vector3(0,100,90);
    const controls=new OrbitControls(camera,element);controls.enableRotate=false;controls.enableDamping=true;controls.dampingFactor=.14;
    controls.screenSpacePanning=false;controls.minZoom=.65;controls.maxZoom=3;
    controls.mouseButtons={LEFT:THREE.MOUSE.PAN,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};
    controls.touches={ONE:THREE.TOUCH.PAN,TWO:THREE.TOUCH.DOLLY_PAN};
    controls.addEventListener('change',()=>{dirty=true;});controls.addEventListener('start',()=>{following=false;});
    scene.add(new THREE.HemisphereLight('#eef8f5','#75846d',1.8));
    const sun=new THREE.DirectionalLight('#fff1d8',2.4);sun.position.set(-38,85,38);sun.castShadow=true;
    sun.shadow.mapSize.set(1536,1536);Object.assign(sun.shadow.camera,{left:-58,right:58,top:72,bottom:-72,near:1,far:190});
    sun.shadow.normalBias=.035;sun.shadow.bias=-.0002;scene.add(sun);
    const fill=new THREE.DirectionalLight('#bfdfed',.6);fill.position.set(45,25,-35);scene.add(fill);
    const layout=siteLayout(element.clientWidth,element.clientHeight),buildingGroup=new THREE.Group();scene.add(buildingGroup);
    const materials=new Map<string,THREE.MeshStandardMaterial>(),models=new Map<string,THREE.Group>(),loader=new GLTFLoader(),abort=new AbortController();
    const accountGroups=new Map<string,THREE.Group>(),processGroups=new Map<ProcessKey,THREE.Group>(),facilityParts=new Map<ProcessKey,FacilityParts>();
    const selections=new Map<string,THREE.Mesh>(),signals=new Map<string,THREE.Mesh>(),cargo=new Map<string,CargoSlot[]>(),cargoBatches:CargoBatch[]=[];
    const truckStates=new Map<string,TruckState>(),truckBatches:{mesh:THREE.InstancedMesh;sources:THREE.Mesh[]}[]=[];
    const accountFlows=new Map<string,AccountFlow>(),seenSubmissionEvents=new Set<number>(),seenReady=new Map<string,number>();
    const productionDeliveries:{group:THREE.Group;start:number;accountId:string}[]=[],archiveTransfers:{group:THREE.Group;start:number;accountId:string}[]=[];
    const seenAssetStates=new Map<string,string>();
    const labelHeights=new Map<string,number>(),lastEventTrip=new Map<string,number>(),monthUnknown:THREE.Object3D[]=[];
    let numberMaterial:THREE.MeshBasicMaterial|null=null;
    let lastPick:unknown=null,lastObserved='',eventsInitialized=false,animationClock=0;
    function material(color:string){let m=materials.get(color);if(!m){m=new THREE.MeshStandardMaterial({color,roughness:.82,metalness:.05});materials.set(color,m);}return m;}
    function box(w:number,h:number,d:number,color:string,x:number,y:number,z:number,parent:THREE.Object3D=scene){
      const mesh=new THREE.Mesh(Math.min(w,h,d)<.4?new THREE.BoxGeometry(w,h,d):new RoundedBoxGeometry(w,h,d,1,Math.min(.1,h/3,w/3,d/3)),material(color));
      mesh.position.set(x,y,z);mesh.castShadow=h>.25;mesh.receiveShadow=true;parent.add(mesh);return mesh;
    }
    function dynamic<T extends THREE.Object3D>(object:T){object.userData.dynamic=true;return object;}
    function model(name:string,parent:THREE.Object3D,w:number,d:number,h:number){
      const source=models.get(name);if(!source)return null;
      const object=source.clone(true),size=new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
      object.scale.setScalar(Math.min(w/Math.max(.001,size.x),d/Math.max(.001,size.z),h/Math.max(.001,size.y)));
      const bounds=new THREE.Box3().setFromObject(object),center=bounds.getCenter(new THREE.Vector3());object.position.set(-center.x,.62-bounds.min.y,-center.z);
      object.traverse(child=>{if(child instanceof THREE.Mesh){child.castShadow=true;child.receiveShadow=true;}});parent.add(object);return object;
    }
    function atModel(name:string,x:number,z:number,w:number,d:number,h:number,parent:THREE.Object3D=scene){
      const anchor=new THREE.Group();anchor.position.set(x,0,z);parent.add(anchor);return model(name,anchor,w,d,h);
    }
    function ring(group:THREE.Group,key:string,w:number,d:number){
      const shape=new THREE.Shape();shape.moveTo(-w/2,-d/2);shape.lineTo(w/2,-d/2);shape.lineTo(w/2,d/2);shape.lineTo(-w/2,d/2);shape.closePath();
      const inner=new THREE.Path();inner.moveTo(-w/2+.15,-d/2+.15);inner.lineTo(-w/2+.15,d/2-.15);inner.lineTo(w/2-.15,d/2-.15);inner.lineTo(w/2-.15,-d/2+.15);inner.closePath();shape.holes.push(inner);
      const mesh=dynamic(new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color:'#ffe4a2',side:THREE.DoubleSide})));
      mesh.rotation.x=-Math.PI/2;mesh.position.y=.68;mesh.visible=false;group.add(mesh);selections.set(key,mesh);
    }
    function signal(group:THREE.Group,key:string,x:number,z:number){
      box(.11,2.2,.11,industry.steel,x,1.65,z,group);
      const light=dynamic(new THREE.Mesh(new THREE.SphereGeometry(.29,10,7),new THREE.MeshStandardMaterial({color:industry.unknown,emissive:industry.unknown,emissiveIntensity:.2})));
      light.position.set(x,2.85,z);group.add(light);signals.set(key,light);
    }
    function hit(group:THREE.Group,w:number,d:number,h:number,data:Record<string,unknown>){
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial({visible:false}));mesh.position.y=.6+h/2;
      Object.assign(mesh.userData,{hitTarget:true,...data});group.add(mesh);
    }
    function physicalNumber(parent:THREE.Object3D,text:string,w:number,z:number,y=.7,isDynamic=false){
      if(!numberMaterial){
        const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d');if(!ctx)return null;
        ctx.fillStyle=industry.steel;ctx.fillRect(0,0,512,256);ctx.fillStyle='#fff5da';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='800 44px sans-serif';
        for(let i=0;i<16;i++)ctx.fillText(i===15?'?':String(i+1),(i%4)*128+64,Math.floor(i/4)*64+35);
        const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;numberMaterial=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide});
      }
      const index=text==='?'?15:Math.max(0,Number(text)-1),col=index%4,row=Math.floor(index/4),geometry=new THREE.PlaneGeometry(w,w/2),uv=geometry.getAttribute('uv');
      for(let i=0;i<uv.count;i++)uv.setXY(i,(col+uv.getX(i))/4,1-(row+1-uv.getY(i))/4);
      const plane=new THREE.Mesh(geometry,numberMaterial);plane.rotation.x=-Math.PI/2;plane.position.set(0,y,z);
      if(isDynamic)dynamic(plane);parent.add(plane);return plane;
    }
    function makeCargo(parent:THREE.Object3D,key:string,columns:number,rows:number,levels:number,spacing:number,size:number){
      const slots:CargoSlot[]=[];
      for(let level=0;level<levels;level++)for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
        const object=new THREE.Group();object.position.set((column-(columns-1)/2)*spacing,.82+level*.88,(row-(rows-1)/2)*1.8-.1);parent.add(object);
        const pallet=model('pallet',object,size*1.04,size*.9,.15);if(pallet)pallet.position.y=-.12;
        const crate=model('crate',object,size,size*.84,.76);if(crate)crate.position.y=0;
        const sources:THREE.Mesh[]=[];object.traverse(o=>{if(o instanceof THREE.Mesh){o.userData.cargo=true;sources.push(o);}});
        object.visible=false;slots.push({object,sources});
      }
      cargo.set(key,slots);
    }
    function makeTruck(parent:THREE.Group,account:Account){
      const group=new THREE.Group();group.position.set(4.25,0,.8);parent.add(group);dynamic(group);
      const vehicle=model('delivery',group,1.5,3.4,1.7);if(vehicle)vehicle.position.y=.66;
      const hazard=dynamic(new THREE.Mesh(new THREE.ConeGeometry(.3,.65,3),new THREE.MeshStandardMaterial({color:industry.warning,emissive:industry.warning,emissiveIntensity:.2})));
      hazard.position.set(.45,2.5,.75);hazard.visible=false;group.add(hazard);
      const origin=new THREE.Vector3();group.getWorldPosition(origin);truckStates.set(account.id,{group,hazard,origin,tripStart:null});
      if(vehicle)vehicle.traverse(o=>{if(o instanceof THREE.Mesh)o.userData.truck=true;});
    }
    function road(x:number,z:number,w:number,d:number){
      box(w,.1,d,industry.road,x,.57,z);
      if(d>w)for(let p=z-d/2+1.3;p<z+d/2;p+=3.8)box(.12,.025,1.7,industry.line,x,.635,p);
      else for(let p=x-w/2+1.2;p<x+w/2;p+=3.8)box(1.7,.025,.12,industry.line,p,.635,z);
    }
    function arrow(x:number,z:number,angle:number){
      const shape=new THREE.Shape();shape.moveTo(-.2,-.8);shape.lineTo(.2,-.8);shape.lineTo(.2,.1);shape.lineTo(.7,.1);shape.lineTo(0,.9);shape.lineTo(-.7,.1);shape.lineTo(-.2,.1);shape.closePath();
      const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),material(industry.line));mesh.rotation.x=-Math.PI/2;mesh.rotation.z=angle;mesh.position.set(x,.65,z);scene.add(mesh);
    }
    function mergeStatic(){
      scene.updateMatrixWorld(true);const groups=new Map<string,THREE.Mesh[]>();
      scene.traverse(object=>{
        if(!(object instanceof THREE.Mesh)||object.userData.hitTarget||object.userData.noMerge||object.userData.cargo||object.userData.truck)return;
        let ancestor:THREE.Object3D|null=object;while(ancestor){if(ancestor.userData.dynamic)return;ancestor=ancestor.parent;}
        if(Array.isArray(object.material))return;
        const key=object.material.uuid;groups.set(key,[...(groups.get(key)||[]),object]);
      });
      for(const sources of groups.values()){
        const parts=sources.map(object=>(object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone()).applyMatrix4(object.matrixWorld));
        const geometry=mergeGeometries(parts,false);if(geometry){const batch=new THREE.Mesh(geometry,sources[0].material);batch.castShadow=true;batch.receiveShadow=true;scene.add(batch);for(const source of sources)source.removeFromParent();}
        parts.forEach(part=>part.dispose());
      }
      const cargoSources=new Map<string,{sources:THREE.Mesh[];slots:THREE.Group[]}>();
      for(const slots of cargo.values())for(const slot of slots)for(const source of slot.sources){
        const key=source.geometry.uuid+String(Array.isArray(source.material)?source.material.map(m=>m.uuid):source.material.uuid);
        const batch=cargoSources.get(key)||{sources:[],slots:[]};batch.sources.push(source);batch.slots.push(slot.object);cargoSources.set(key,batch);
      }
      for(const batch of cargoSources.values()){
        const first=batch.sources[0],mesh=new THREE.InstancedMesh(first.geometry,first.material,batch.sources.length);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;
        batch.sources.forEach(source=>{source.visible=false;});scene.add(mesh);cargoBatches.push({mesh,...batch});
      }
      const trucks=new Map<string,THREE.Mesh[]>();
      for(const state of truckStates.values())state.group.traverse(object=>{if(object instanceof THREE.Mesh&&object.userData.truck){const key=object.geometry.uuid+String(Array.isArray(object.material)?object.material.map(m=>m.uuid):object.material.uuid);trucks.set(key,[...(trucks.get(key)||[]),object]);}});
      for(const sources of trucks.values()){
        const mesh=new THREE.InstancedMesh(sources[0].geometry,sources[0].material,sources.length);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;sources.forEach(source=>{source.visible=false;});scene.add(mesh);truckBatches.push({mesh,sources});
      }
    }
    function build(){
      const centerX=(layout.minX+layout.maxX)/2,centerZ=(layout.minZ+layout.maxZ)/2,siteW=layout.maxX-layout.minX+2,siteD=layout.maxZ-layout.minZ+2;
      box(siteW,1.4,siteD,industry.rim,centerX,-.5,centerZ);
      box(siteW-.4,.28,siteD-.4,industry.ground,centerX,.33,centerZ);
      box(siteW-3,.1,siteD-3,industry.concrete,centerX,.48,centerZ);
      // A single ring road joins production, every account warehouse and the review/storage line.
      if(layout.landscape){
        const left=layout.minX+2,right=layout.maxX-2,cx=(left+right)/2;road(cx,-23,right-left,2);road(cx,25,right-left,2);
        const stockRight=Math.max(...layout.plots.map(point=>point[0]))+7.2;
        for(const x of [left,-35,stockRight,...layout.facilities.slice(3).map(point=>point[0]+6)])road(x,1,2,48);
        const rowZ=[...new Set(layout.plots.map(point=>point[1]+4.5))];for(const z of rowZ)road((layout.plots[0][0]+stockRight)/2,z,stockRight-layout.plots[0][0]+8,1.7);
        for(let x=left+13;x<right;x+=24){arrow(x,-23,-Math.PI/2);arrow(x,25,-Math.PI/2);}
      }else{
        road(-21,10,2.5,92);road(21,10,2.5,92);
        const rows=[...new Set(layout.plots.map(point=>point[1]))].slice(0,-1).map(z=>z+5.5);
        for(const z of [-23,...rows,layout.facilities[3][1]+6.5,layout.facilities[4][1]+5.5,layout.facilities[5][1]+5.5,layout.facilities[6][1]+5])road(0,z,43,2);
        for(const x of [-9.6,0,9.6])road(x,-.5,1.4,43);
        for(const z of [-18,-4,12,26,39,53]){arrow(-21,z,Math.PI);arrow(21,z,Math.PI);}
      }
      for(const a of propsRef.current.snapshot.accounts){
        const p=layout.plots[a.number-1];if(!p)continue;const group=new THREE.Group();group.position.set(p[0],0,p[1]);buildingGroup.add(group);accountGroups.set(a.id,group);
        buildWarehouse(group,box);ring(group,a.id,8.5,7.45);signal(group,a.id,-3.7,2.7);makeCargo(group,a.id,3,2,3,2.55,1.8);makeTruck(group,a);
        physicalNumber(group,String(a.number),1.9,2.5,.72);hit(group,8.1,7.1,3.7,{accountId:a.id});labelHeights.set(a.id,.72);
      }
      processes.forEach((process,index)=>{
        const p=layout.facilities[index],group=new THREE.Group();group.position.set(p[0],0,p[1]);group.rotation.y=layout.facilityRotations[index];buildingGroup.add(group);processGroups.set(process.key,group);
        const parts=buildProcessFacility({key:process.key,group,model,atModel,box});facilityParts.set(process.key,parts);labelHeights.set('process-'+process.key,.75);
        if(process.key==='stock')return;
        const width=process.key==='generation'?18:process.key==='review'?13:process.key==='submission'?25:41;
        ring(group,process.key,width+.5,8.6);signal(group,process.key,-width/2+.8,3.15);hit(group,width,8.1,Math.min(parts.height,4),{process:process.key});
        if(process.key==='inspection'||process.key==='archive')parts.bays.forEach((bay,i)=>{
          const account=propsRef.current.snapshot.accounts.find(a=>a.number===i+1);if(!account)return;
          makeCargo(bay,process.key+'-'+account.id,1,2,process.key==='archive'?2:1,1,1.55);ring(bay,process.key+'-'+account.id,2.8,5.7);
          physicalNumber(bay,String(i+1),1.4,2.1,.78);
        });
        if(process.key==='revenue')for(let i=0;i<12;i++){const number=new THREE.Group();number.position.x=-17.6+i*3.2;group.add(number);physicalNumber(number,String(i+1),1.45,2.1,.8);const unknown=physicalNumber(number,'?',1.45,2.5,1.7,true);if(unknown){unknown.rotation.x=0;monthUnknown.push(unknown);}}
      });
      // Loading lanes lead out of the last warehouse row into the same submission depot.
      if(!layout.landscape)for(const x of [-10.5,-6.5,-2.5,1.5,5.5,9.5,13.5,17.5])box(.14,.04,3.2,industry.line,x,.72,layout.facilities[3][1]+4.8);
      // Stock additions move only after a new observed count; there is no decorative endless freight.
      for(const account of propsRef.current.snapshot.accounts){
        const group=dynamic(new THREE.Group());scene.add(group);const crate=model('crate',group,1.4,1.25,1.3);if(crate)crate.position.y=.78;group.visible=false;productionDeliveries.push({group,start:-1,accountId:account.id});
        const finished=dynamic(new THREE.Group());scene.add(finished);const goods=model('crate',finished,1.55,1.4,1.3);if(goods)goods.position.y=.8;finished.visible=false;archiveTransfers.push({group:finished,start:-1,accountId:account.id});
      }
      mergeStatic();renderer.shadowMap.needsUpdate=true;ready=true;dirty=true;lastRevision=-1;setLoaded(true);setMissing(Object.keys(modelFiles).filter(name=>!models.has(name)).length);
      fit(true);propsRef.current.onReady();
    }
    async function load(name:string,path:string){
      const response=await fetch(path,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(18000)])});if(!response.ok)throw new Error(`Model HTTP ${response.status}: ${name}`);
      const gltf=await loader.parseAsync(await response.arrayBuffer(),path.slice(0,path.lastIndexOf('/')+1));if(disposed){disposeObject(gltf.scene);return;}models.set(name,gltf.scene);
    }
    Promise.allSettled(Object.entries(modelFiles).map(([name,path])=>load(name,path))).then(()=>{if(!disposed)build();});
    function readSafe(){
      const p=propsRef.current,w=element.clientWidth,h=element.clientHeight;
      safe={left:12,right:Math.max(56,w-12),top:Math.max(0,p.safeTop??68),bottom:Math.max(130,h-(p.safeBottom??84))};
      if(p.trayOpen&&layout.landscape){const tray=document.querySelector<HTMLElement>('.game-tray'),rect=tray?.getBoundingClientRect(),hostRect=element.getBoundingClientRect();if(rect&&rect.width<w*.72&&rect.left>hostRect.left+w*.25){safe.right=Math.max(68,rect.left-hostRect.left-10);safe.bottom=h-12;}}
      if(safe.bottom-safe.top<110)safe.bottom=safe.top+110;
    }
    function fit(resetAngle=false){
      readSafe();const w=element.clientWidth,h=element.clientHeight,compact=!!propsRef.current.trayOpen||(!layout.landscape&&safe.bottom-safe.top<400);
      const target=new THREE.Vector3((layout.minX+layout.maxX)/2,0,layout.landscape?1:compact?-3:7),dir=resetAngle?direction.clone():camera.position.clone().sub(controls.target).normalize().multiplyScalar(direction.length());
      camera.position.copy(target).add(dir);camera.lookAt(target);camera.updateMatrixWorld(true);
      const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1),corners:THREE.Vector3[]=[];
      const minZ=compact?Math.min(...layout.plots.map(p=>p[1]))-4.2:layout.minZ,maxZ=compact?Math.max(...layout.plots.map(p=>p[1]))+5.5:layout.maxZ;
      const minX=compact?Math.min(...layout.plots.map(p=>p[0]))-7.2:layout.minX,maxX=compact?Math.max(...layout.plots.map(p=>p[0]))+7.2:layout.maxX;
      for(const x of [minX,maxX])for(const z of [minZ,maxZ])for(const y of [0,compact?4:6.5])corners.push(new THREE.Vector3(x,y,z));
      const xs=corners.map(p=>p.clone().sub(target).dot(right)),ys=corners.map(p=>p.clone().sub(target).dot(up));
      const minY=Math.min(...ys),maxY=Math.max(...ys),units=Math.max((Math.max(...xs)-Math.min(...xs))/(safe.right-safe.left),(maxY-minY)/(safe.bottom-safe.top-18));
      camera.left=-w*units/2;camera.right=w*units/2;camera.top=h*units/2;camera.bottom=-h*units/2;
      const shift=up.multiplyScalar((minY+maxY)/2+((safe.top+safe.bottom)/2-h/2)*units).add(right.multiplyScalar((Math.min(...xs)+Math.max(...xs))/2-((safe.left+safe.right)/2-w/2)*units));
      controls.target.copy(target).add(shift);camera.position.copy(controls.target).add(dir);camera.zoom=1;camera.updateProjectionMatrix();controls.update();camera.updateMatrixWorld(true);following=true;dirty=true;
    }
    controller.current={zoom:delta=>{camera.zoom=THREE.MathUtils.clamp(camera.zoom*(delta>0?1.2:1/1.2),.65,3);camera.updateProjectionMatrix();following=false;dirty=true;},reset:()=>fit(true),rotate:()=>fit(true),visitDistrict:()=>fit(true),focus:()=>{following=true;dirty=true;},focusProcess:()=>{following=true;dirty=true;}};
    const pointers=new Set<number>();let gesture:{id:number;x:number;y:number;account:string|null;process:ProcessKey|null;cancelled:boolean}|null=null;
    function down(e:PointerEvent){
      if(lostContext)return;pointers.add(e.pointerId);if(pointers.size>1){if(gesture)gesture.cancelled=true;return;}
      const candidate=(e.target as Element).closest<HTMLButtonElement>('[data-account],[data-process]'),bounds=candidate?.getBoundingClientRect();
      const label=candidate&&bounds&&e.clientX>=bounds.left&&e.clientX<=bounds.right&&e.clientY>=bounds.top&&e.clientY<=bounds.bottom?candidate:null;
      if(!candidate&&(e.target as Element).closest('button')){e.stopPropagation();gesture=null;pointers.delete(e.pointerId);return;}
      gesture={id:e.pointerId,x:e.clientX,y:e.clientY,account:label?.dataset.account||null,process:label?.dataset.process as ProcessKey||null,cancelled:e.button!==0||!e.isPrimary};
    }
    function move(e:PointerEvent){if(gesture&&Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>8)gesture.cancelled=true;}
    function up(e:PointerEvent){
      const tap=gesture&&gesture.id===e.pointerId&&!gesture.cancelled&&pointers.size===1&&Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)<=8;pointers.delete(e.pointerId);
      if(!tap||!gesture||lostContext){if(!pointers.size)gesture=null;return;}const g=gesture;gesture=null;
      if(g.account){propsRef.current.onSelect(g.account);return;}if(g.process){propsRef.current.onInspectProcess?.(g.process);return;}
      camera.updateMatrixWorld(true);scene.updateMatrixWorld(true);const rect=element.getBoundingClientRect(),ray=new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);
      const intersections=ray.intersectObject(buildingGroup,true).filter(hit=>hit.object.userData.hitTarget);
      lastPick={x:e.clientX,y:e.clientY,hits:intersections.slice(0,5).map(hit=>({point:hit.point.toArray(),account:hit.object.userData.accountId,process:hit.object.userData.process}))};
      const target=intersections[0];if(target?.object.userData.accountId)propsRef.current.onSelect(target.object.userData.accountId);
      else if(target?.object.userData.process)propsRef.current.onInspectProcess?.(target.object.userData.process);
      else if(propsRef.current.selected||propsRef.current.activeProcess)propsRef.current.onSelect('');
    }
    function cancel(e:PointerEvent){pointers.delete(e.pointerId);if(gesture)gesture.cancelled=true;if(!pointers.size)gesture=null;}
    element.addEventListener('pointerdown',down,true);element.addEventListener('pointermove',move,true);element.addEventListener('pointerup',up,true);element.addEventListener('pointercancel',cancel,true);
    function lost(e:Event){e.preventDefault();lostContext=true;controls.enabled=false;cancelAnimationFrame(frame);setError('3D 화면 연결이 끊겼습니다.');(window as unknown as {__bizWorld:unknown}).__bizWorld={ready:false,lostContext:true};propsRef.current.onReady();}
    function restored(){if(!disposed)setAttempt(value=>value+1);}
    renderer.domElement.addEventListener('webglcontextlost',lost);renderer.domElement.addEventListener('webglcontextrestored',restored);
    function project(position:THREE.Vector3){const v=position.clone().project(camera);return {x:(v.x*.5+.5)*element.clientWidth,y:(-v.y*.5+.5)*element.clientHeight};}
    function projectLabels(){
      for(const marker of monthUnknown){const parentRotation=new THREE.Quaternion();marker.parent?.getWorldQuaternion(parentRotation);marker.quaternion.copy(parentRotation.invert().multiply(camera.quaternion));}
      for(const [key,marker] of markers.current){
        const account=propsRef.current.snapshot.accounts.find(a=>a.id===key),index=processes.findIndex(p=>'process-'+p.key===key);
        const p=account?layout.plots[account.number-1]:layout.facilities[index];if(!p)continue;
        const z=account?p[1]+3.5:p[1]+(processes[index]?.key==='stock'?0:layout.landscape&&index>=3?(layout.compactLandscape&&index%2===0?-22:25):4.4);
        const point=project(new THREE.Vector3(p[0],labelHeights.get(key)??.75,z));
        const halfW=marker.offsetWidth/2,halfH=marker.offsetHeight/2;
        const visible=point.x>=safe.left+halfW-1&&point.x<=safe.right-halfW+1&&point.y>=safe.top+halfH-1&&point.y<=safe.bottom-halfH+1;
        marker.style.visibility=visible?'visible':'hidden';marker.tabIndex=visible?0:-1;marker.dataset.anchorX=point.x.toFixed(2);marker.dataset.anchorY=point.y.toFixed(2);
        marker.style.transform=`translate(${point.x}px,${point.y}px) translate(-50%,-50%)`;
      }
    }
    function setSignal(key:string,tone:string){const light=signals.get(key);if(!light)return;const m=light.material as THREE.MeshStandardMaterial;
      const color=tone==='active'?industry.mint:tone==='danger'?industry.danger:tone==='warning'?industry.warning:tone==='unknown'?industry.unknown:industry.steel;
      m.color.set(color);m.emissive.set(color);m.emissiveIntensity=.2;
    }
    function showCargo(key:string,count:number,capacity:number,unknown=false){
      const slots=cargo.get(key)||[],visible=count>0?Math.max(1,Math.ceil(Math.min(1,count/Math.max(1,capacity))*slots.length)):0;
      slots.forEach((slot,index)=>{slot.object.visible=index<visible;slot.object.scale.setScalar(unknown?.94:1);});
    }
    function updateObserved(now:number){
      const p=propsRef.current,newObservation=lastObserved!==p.snapshot.observedAt;
      const submissionEvents=eventsInitialized&&newObservation?p.snapshot.recent.filter(event=>event.state==='submitted'&&!seenSubmissionEvents.has(event.id)):[];
      const observedAssets=currentAssets(p.snapshot),approvedTransfers=eventsInitialized&&newObservation?observedAssets.filter(asset=>seenAssetStates.get(asset.id)==='submitted'&&['approved','published'].includes(asset.state)):[];
      for(const account of p.snapshot.accounts){
        const flow=accountFlow(account,p.snapshot,p.stale);accountFlows.set(account.id,flow);
        const command=observation(account,p.commands),tone=p.stale?'unknown':command?.tone==='danger'?'danger':command?.tone==='unknown'?'unknown':severity(account);
        setSignal(account.id,tone);const selected=selections.get(account.id);if(selected)selected.visible=account.id===p.selected;
        showCargo(account.id,flow.ready,flow.target,p.stale);showCargo('inspection-'+account.id,flow.inspection,Math.max(1,account.capacity?.limit_count||20),p.stale);
        showCargo('archive-'+account.id,flow.archived,Math.max(1,flow.target),p.stale);for(const key of ['inspection','archive']){const baySelection=selections.get(key+'-'+account.id);if(baySelection)baySelection.visible=account.id===p.selected;}
        const truck=truckStates.get(account.id);if(truck){truck.hazard.visible=flow.dispatchMode==='fault'||flow.dispatchMode==='unknown';truck.group.rotation.z=flow.dispatchMode==='fault'?.06:0;if(['fault','unknown'].includes(flow.dispatchMode)){truck.tripStart=null;truck.group.position.set(4.25,0,.8);truck.group.rotation.y=0;}}
        // Only an observed increase is a completed transfer; startup never replays historical events.
        const oldReady=seenReady.get(account.id);
        if(newObservation&&!p.stale&&submissionEvents.some(event=>event.accountId===account.id)&&!p.reduced&&truck&&!['fault','unknown'].includes(flow.dispatchMode)){truck.tripStart=now;lastEventTrip.set(account.id,now);}
        if(newObservation&&!p.stale&&oldReady!==undefined&&flow.ready>oldReady&&!p.reduced){const delivery=productionDeliveries.find(d=>d.accountId===account.id);if(delivery)delivery.start=now;}
        if(newObservation&&!p.stale&&!p.reduced&&approvedTransfers.some(asset=>asset.accountId===account.id)){const transfer=archiveTransfers.find(item=>item.accountId===account.id);if(transfer)transfer.start=now;}
        if(newObservation)seenReady.set(account.id,flow.ready);
      }
      for(const [key,group] of processGroups){const state=processState(key,p.snapshot,p.stale);setSignal(key,state.tone);group.userData.active=state.active;const selected=selections.get(key);if(selected)selected.visible=key===p.activeProcess;}
      const revenue=facilityParts.get('revenue'),items=(p.revenue?.items||[]).filter(item=>item.accountId===(p.revenueAccountId||p.selected||p.snapshot.accounts[0]?.id));
      const months=Array.from({length:12},(_,i)=>items.filter(item=>item.month===i+1&&item.amountKrw!==null));
      const highest=Math.max(1,...months.map(records=>records.reduce((sum,item)=>sum+(item.amountKrw??0),0)));
      monthUnknown.forEach((object,index)=>{object.visible=months[index].length===0||!!p.revenueError;});
      revenue?.monthDoors.forEach((door,index)=>{const known=months[index].length>0&&!p.revenueError;door.rotation.y=known?-Math.PI/2:0;door.position.x=-17.6+index*3.2-(known?1.15:0);door.position.z=known?1.2:2.35;(door.material as THREE.MeshStandardMaterial).color.set(known?industry.white:industry.unknown);});
      revenue?.monthSeals.forEach((seal,index)=>{seal.visible=months[index].length>0&&!p.revenueError;});
      revenue?.monthBins.forEach((bin,index)=>{const records=p.revenueError?[]:months[index],amount=records.reduce((sum,item)=>sum+(item.amountKrw??0),0);bin.visible=records.length>0;bin.scale.y=amount>0?.25+.9*Math.sqrt(amount/highest):.09;bin.position.y=.88+.4*bin.scale.y;(bin.material as THREE.MeshStandardMaterial).color.set(amount>0?industry.orange:industry.mint);bin.userData.amount=records.length?amount:null;bin.userData.recorded=records.length>0;});
      if(newObservation){for(const event of p.snapshot.recent)seenSubmissionEvents.add(event.id);for(const asset of observedAssets)seenAssetStates.set(asset.id,asset.state);eventsInitialized=true;}
      lastObserved=p.snapshot.observedAt;renderer.shadowMap.needsUpdate=true;
    }
    function roadPath(account:Account,production=false){
      const base=layout.plots[account.number-1],rowZ=base[1]+(layout.landscape?4.5:5.5),factory=layout.facilities[0],dispatch=layout.facilities[3],left=layout.minX+2,stockRoad=Math.max(...layout.plots.map(point=>point[0]))+7.2;
      const xy:(readonly[number,number])[]=layout.landscape
        ? production?[[factory[0],factory[1]+4.6],[left,factory[1]+4.6],[left,25],[-35,25],[-35,rowZ],[base[0],rowZ],[base[0],base[1]+2.5]]
          :[[base[0]+4.25,base[1]+.8],[base[0]+4.25,rowZ],[stockRoad,rowZ],[stockRoad,25],[dispatch[0]+6,25],[dispatch[0]+6,0],[dispatch[0]+4,0]]
        : production?[[-8,-26.5],[-8,-23],[-21,-23],[-21,rowZ],[base[0],rowZ],[base[0],base[1]+2.5]]
          :[[base[0]+4.25,base[1]+.8],[base[0]+4.25,rowZ],[21,rowZ],[21,dispatch[1]+6.5],[dispatch[0],dispatch[1]+6.5],[dispatch[0],dispatch[1]+3]];
      return xy.map(([x,z])=>new THREE.Vector3(x,0,z));
    }
    function archivePath(account:Account){
      const bay=-18+(account.number-1)*3,inspection=layout.facilities[4],archive=layout.facilities[5];
      const points:(readonly[number,number])[]=layout.landscape?[[inspection[0]+4.5,-bay],[inspection[0]+6,-bay],[inspection[0]+6,25],[archive[0]+6,25],[archive[0]+6,-bay],[archive[0]+4.5,-bay]]:[[bay,inspection[1]+2.5],[bay,inspection[1]+5.5],[21,inspection[1]+5.5],[21,archive[1]+5.5],[bay,archive[1]+5.5],[bay,archive[1]+2.5]];
      return points.map(([x,z])=>new THREE.Vector3(x,0,z));
    }
    function pointOnPath(points:THREE.Vector3[],progress:number){
      const lengths=points.slice(1).map((point,index)=>point.distanceTo(points[index])),total=lengths.reduce((a,b)=>a+b,0);let left=Math.max(0,Math.min(1,progress))*total;
      for(let i=0;i<lengths.length;i++){if(left<=lengths[i])return points[i].clone().lerp(points[i+1],lengths[i]?left/lengths[i]:0);left-=lengths[i];}
      return points[points.length-1].clone();
    }
    function render(now:number){
      if(disposed||lostContext)return;frame=requestAnimationFrame(render);if(document.hidden||now-lastDraw<1000/30)return;
      const dt=Math.min(.1,Math.max(0,(now-lastTime)/1000));lastTime=now;const p=propsRef.current;animationClock+=dt;
      if(lastRevision!==revision.current){lastRevision=revision.current;dirty=true;readSafe();const safeKey=[safe.left,safe.right,safe.top,safe.bottom].join();if(safeKey!==lastSafe){lastSafe=safeKey;if(following||p.selected||p.activeProcess)fit();}updateObserved(now);}
      controls.update();let animated=false;
      if(!p.reduced&&!p.stale){
        for(const [key,parts]of facilityParts){const active=processGroups.get(key)?.userData.active===true;for(const object of parts.active){
          if(object.userData.belt){if(active){object.visible=true;object.position.x=((animationClock*2.2+Number(object.userData.beltOrigin)+6)%12+12)%12-6;animated=true;}else object.visible=false;}
          else if(object.userData.scanner){object.visible=active;if(active){object.position.z=Math.sin(animationClock*1.8)*1.4+1;animated=true;}}
          else if(active){object.rotation.y=Math.sin(animationClock*.8)*.28;animated=true;}
        }}
        for(const [id,truck]of truckStates){
          const flow=accountFlows.get(id);if(truck.tripStart!==null){const progress=Math.min(1,(now-truck.tripStart)/8500),account=p.snapshot.accounts.find(a=>a.id===id),base=account?layout.plots[account.number-1]:null;
            if(base&&account){const path=roadPath(account),t=progress<.5?progress*2:(1-progress)*2,world=pointOnPath(path,t),next=pointOnPath(path,Math.min(1,t+(progress<.5?.005:-.005)));truck.group.position.set(world.x-base[0],world.y,world.z-base[1]);truck.group.rotation.y=Math.atan2(next.x-world.x,next.z-world.z);}
            if(progress>=1){truck.group.position.set(4.25,0,.8);truck.group.rotation.y=0;truck.tripStart=null;}animated=true;
          }
          if(flow?.dispatchMode==='working'){const light=signals.get(id);if(light)(light.material as THREE.MeshStandardMaterial).emissiveIntensity=.35+Math.sin(animationClock*4)*.15;animated=true;}
        }
        for(const delivery of productionDeliveries){if(delivery.start<0)continue;const progress=(now-delivery.start)/7000;if(progress>=1){delivery.group.visible=false;delivery.start=-1;}else{const account=p.snapshot.accounts.find(a=>a.id===delivery.accountId);if(account){delivery.group.visible=true;delivery.group.position.copy(pointOnPath(roadPath(account,true),progress));delivery.group.position.y=.1;}}animated=true;}

        for(const transfer of archiveTransfers){if(transfer.start<0)continue;const progress=(now-transfer.start)/6500;if(progress>=1){transfer.group.visible=false;transfer.start=-1;}else{const account=p.snapshot.accounts.find(a=>a.id===transfer.accountId);if(account){transfer.group.visible=true;transfer.group.position.copy(pointOnPath(archivePath(account),progress));}}animated=true;}
      }else{
        for(const parts of facilityParts.values())for(const object of parts.active)if(object.userData.belt||object.userData.scanner)object.visible=false;
        for(const truck of truckStates.values())if(truck.tripStart!==null){truck.group.position.set(4.25,0,.8);truck.group.rotation.y=0;truck.tripStart=null;}
        for(const delivery of [...productionDeliveries,...archiveTransfers]){delivery.group.visible=false;delivery.start=-1;}
      }
      if(animated)dirty=true;
      if(dirty&&ready){scene.updateMatrixWorld(true);
        for(const batch of cargoBatches){batch.sources.forEach((source,index)=>batch.mesh.setMatrixAt(index,batch.slots[index].visible?source.matrixWorld:hiddenMatrix));batch.mesh.instanceMatrix.needsUpdate=true;}
        for(const batch of truckBatches){batch.sources.forEach((source,index)=>batch.mesh.setMatrixAt(index,source.matrixWorld));batch.mesh.instanceMatrix.needsUpdate=true;}
        camera.updateMatrixWorld(true);projectLabels();const start=performance.now();renderer.render(scene,camera);renderMs=performance.now()-start;totalFrames++;lastDraw=now;dirty=false;
      }
      const visibleAccounts=p.snapshot.accounts.filter(account=>markers.current.get(account.id)?.style.visibility==='visible').map(a=>a.id);
      (window as unknown as {__bizWorld:unknown}).__bizWorld={ready,totalFrames,renderMs,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,loaded:models.size,modelFailures:Object.keys(modelFiles).filter(name=>!models.has(name)),district:0,lastPick,rotationLocked:true,safe,zoom:camera.zoom,layoutColumns:layout.cols,visibleAccounts,
        cargo:p.snapshot.accounts.map(a=>({id:a.id,ready:a.ready,target:a.target,unknown:p.stale,visible:cargo.get(a.id)?.filter(slot=>slot.object.visible).length||0})),
        accountFlows:[...accountFlows.values()],trucks:[...truckStates].map(([id,truck])=>({id,mode:accountFlows.get(id)?.dispatchMode,moving:truck.tripStart!==null,lastObservedTrip:lastEventTrip.get(id)||null})),
        processes:[...processGroups].map(([key,group])=>({key,role:group.userData.role,active:group.userData.active})),
        physicalAccounts:p.snapshot.accounts.map(a=>{const pos=layout.plots[a.number-1];return {id:a.id,...project(new THREE.Vector3(pos[0],2,pos[1]-.7))};}),
        archiveTransfers:archiveTransfers.map(item=>({id:item.accountId,moving:item.start>=0})),revenue:{year:p.revenue?.year??null,accountId:p.revenueAccountId||p.selected||p.snapshot.accounts[0]?.id,source:'manual',months:facilityParts.get('revenue')?.monthBins.map((bin,i)=>({month:i+1,amount:bin.userData.amount??null,visible:bin.visible}))},
        camera:{target:controls.target.toArray(),matrixWorld:camera.matrixWorld.toArray(),projection:camera.projectionMatrix.toArray()},appearance:{background:'#9fb6a4',ground:industry.ground,water:null}};
    }
    function resize(){const w=element.clientWidth,h=element.clientHeight;if(!w||!h)return;const next=worldMode(w,h);if(next!==mode){setMode(next);return;}renderer.setSize(w,h);fit(true);}
    function visibility(){if(!document.hidden){lastTime=performance.now();dirty=true;}}
    const observer=new ResizeObserver(resize);observer.observe(element);document.addEventListener('visibilitychange',visibility);resize();frame=requestAnimationFrame(render);
    return()=>{disposed=true;abort.abort();cancelAnimationFrame(frame);observer.disconnect();controls.dispose();for(const[name,fn]of[['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel]]as const)element.removeEventListener(name,fn,true);document.removeEventListener('visibilitychange',visibility);renderer.domElement.removeEventListener('webglcontextlost',lost);renderer.domElement.removeEventListener('webglcontextrestored',restored);disposeObject(scene);models.forEach(disposeObject);renderer.dispose();renderer.domElement.remove();controller.current=null;};
  },[attempt,mode]);
  function bind(id:string,element:HTMLButtonElement|null){if(element)markers.current.set(id,element);else markers.current.delete(id);}
  const icons={generation:Factory,review:ScanLine,stock:Package,submission:Truck,inspection:ScanLine,archive:Package,revenue:CalendarDays};
  const totals=flowTotals(props.snapshot),selected=props.snapshot.accounts.find(a=>a.id===props.selected);
  const selectedFlow=selected?accountFlow(selected,props.snapshot,props.stale):null;
  function processValue(key:ProcessKey){
    if(props.stale&&['stock','inspection','archive'].includes(key))return '?';
    if(key==='stock')return n(totals.ready);
    if(key==='inspection')return selected?`${selected.number}번 · ${n(selectedFlow?.inspection||0)}`:n(totals.inspection);
    if(key==='archive')return selected?`${selected.number}번 · ${n(selectedFlow?.archived||0)}`:n(totals.archived);
    if(key==='revenue'){if(props.revenueError)return '연결 확인';const account=props.snapshot.accounts.find(a=>a.id===(props.revenueAccountId||props.selected));const missing=12-(props.revenue?.items||[]).filter(item=>item.accountId===(account?.id||props.snapshot.accounts[0]?.id)&&item.amountKrw!==null).length;return `${account?.number||1}번 · ${props.revenue?.year||new Date().getFullYear()}${missing===12&&!landscape?' · 미기록':''}`;}
    const state=processState(key,props.snapshot,props.stale);if(props.stale)return '미확인';
    if((key==='generation'||key==='review')&&(!props.snapshot.automation.productionEnabled||['disabled','lane_paused'].includes(props.snapshot.automation.lanes[key]?.status||'')))return '정지';
    if(key==='submission'&&!props.snapshot.automation.enabled)return state.active?'종료 후 정지':'정지';
    return state.active?'가동':state.tone==='warning'?'확인':state.tone==='unknown'?'미확인':'대기';
  }
  return <div ref={host} data-layer={props.layer} data-district={0} data-landscape={landscape} className={`world business-world game-world industrial-world ${error?'world-failed':''} ${props.reduced?'reduced':''}`}>
    {loaded&&!error&&missing>0&&<button className="world-model-retry" onPointerDown={e=>e.stopPropagation()} onClick={()=>setAttempt(v=>v+1)}><RotateCcw size={16}/>설비 {missing}개 다시 받기</button>}
    {!loaded&&!error&&<div className="world-loading"><span className="loader"/><span>산업 단지 연결 중</span></div>}
    {error?<div className="world-fallback"><h2>13개 계정 창고</h2><p>{error}</p><button className="world-retry" onClick={()=>setAttempt(v=>v+1)}><RotateCcw size={16}/>3D 다시 연결</button><div className="fallback-plots">{props.snapshot.accounts.map(a=><button key={a.id} onClick={()=>props.onSelect(a.id)}><AccountState account={a} stale={props.stale} commands={props.commands||[]}/><span>{accountLabel(a)}</span><strong>{props.stale?'?':n(a.ready)}</strong></button>)}{processes.map(p=><button key={p.key} onClick={()=>props.onInspectProcess?.(p.key)}>{p.name}</button>)}</div></div>:<div className="world-markers">
      {props.snapshot.accounts.map(account=>{const command=observation(account,props.commands),tone=props.stale?'unknown':command?.tone==='danger'?'danger':command?.tone==='unknown'?'unknown':severity(account),stock=account.ready;
        return <button key={account.id} ref={element=>bind(account.id,element)} data-account={account.id} className={`plot-label warehouse-placard ${props.selected===account.id?'selected':''} ${tone}`} onClick={e=>{if(e.detail===0)props.onSelect(account.id);}} aria-label={`${accountLabel(account)}, ${props.stale?'상태 확인 필요':command?.label||status(account)}, 재고 ${stock}개, 목표 ${account.target}개`}><span className="warehouse-plate"><b className="account-number">{account.number}</b><Package size={9}/><strong className="warehouse-stock">{props.stale?'?':n(stock)}</strong></span><span className="account-state-icon"><AccountState account={account} stale={props.stale} commands={props.commands||[]}/></span></button>;
      })}
      {processes.filter(process=>process.key!=='stock').map(process=>{const state=processState(process.key,props.snapshot,props.stale),Icon=icons[process.key];return <button key={process.key} ref={element=>bind('process-'+process.key,element)} data-process={process.key} className={`process-label facility-placard ${state.tone} ${props.activeProcess===process.key?'selected':''}`} onClick={e=>{if(e.detail===0)props.onInspectProcess?.(process.key);}} aria-label={`${process.name}, ${state.label}`}><span className="facility-plate"><Icon size={15}/><strong>{process.name}</strong><span className="facility-value">{processValue(process.key)}</span></span></button>;})}
    </div>}
  </div>;
});
export default World;
