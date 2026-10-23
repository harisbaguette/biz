import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {AlertTriangle,CalendarDays,Clock3,Factory,LockKeyhole,RotateCcw} from '../ui/Icons';
import type {Account,Command,Layer,Schedule,Snapshot} from '../types';
import type {RevenueLedger} from '../finance-types';
import {accountLabel} from '../data';
import {accountCycle,type AccountCycle} from '../owner-cycle';
import {currentAssets} from '../operations-state';
import {processState} from '../game-state';
import {processes,siteLayout,type ProcessKey,type Rect} from './layout';
import {buildAccountStation,buildLedger,buildPrintPress,buildSubmissionClock,industry,type SharedParts,type StationParts} from './processFacilities';
import './World.css';

export type AccountArea='review'|'schedule'|'stock'|'archive'|'account';
export interface WorldHandle {zoom:(delta:number)=>void;reset:()=>void;rotate:()=>void;focus:(id:string)=>void;visitDistrict:(index:number)=>void;focusProcess:(key:ProcessKey)=>void;}
interface Props {
 snapshot:Snapshot;selected:string|null;layer:Layer;reduced:boolean;stale:boolean;
 onSelect:(id:string)=>void;onReady:()=>void;onInspectProcess?:(key:ProcessKey)=>void;activeProcess?:ProcessKey|null;
 onInspectAccount?:(id:string,area:AccountArea)=>void;schedules?:Schedule[];commands?:Command[];thumbnails?:string[];
 revenue?:RevenueLedger|null;revenueAccountId?:string|null;revenueError?:string|null;
 district?:number;onDistrictChange?:(index:number)=>void;trayOpen?:boolean;safeTop?:number;safeBottom?:number;
}
interface DynamicBatch {mesh:THREE.InstancedMesh;sources:THREE.Mesh[];roots:THREE.Object3D[];}
interface Transfer {id:string;kind:'production'|'submission'|'archive';start:number;group:THREE.Group;}
const modelFiles:Record<string,string>={
 'print-stack':'/assets/workshop/print-stack.glb','submission-folio':'/assets/workshop/submission-folio.glb',
 'review-clock':'/assets/workshop/review-clock.glb','gallery-frame':'/assets/workshop/gallery-frame.glb',
 'conveyor-long':'/assets/industrial/conveyor-long.glb','scanner-high':'/assets/industrial/scanner-high.glb',
};
function modeFor(width:number,height:number){return width>=600&&width>height*1.2?(height<500?'landscape-short':'landscape'):height<720?'portrait-short':'portrait';}
function workshopLayout(width:number,height:number,plans:boolean){
 const base=siteLayout(width,height);if(!plans)return base;
 if(base.compactLandscape){
  const plots=Array.from({length:13},(_,i)=>i<7?[-30+i*12,-10]as const:[-42+(i-7)*12,10]as const);
  return {...base,plots,cols:7,colGap:12,rowGap:20,minX:-47,maxX:47,minZ:-12,maxZ:24,facilities:[[-42,-10],[-42,-10],[0,0],[42,10],[0,0],[0,0],[30,10]]as (readonly[number,number])[]};
 }
 if(!base.landscape){const gap=base.compactPortrait?15:9,start=base.compactPortrait?-16:-14,rowGap=14,last=start+4*rowGap;return {...base,colGap:gap,rowGap,plots:Array.from({length:13},(_,i)=>[-gap+(i%3)*gap,start+Math.floor(i/3)*rowGap]as const),minX:-gap-(base.compactPortrait?7.6:4.3),maxX:gap+(base.compactPortrait?7.6:4.3),maxZ:last+12,facilities:[[0,-22],[5,-22],[0,0],[gap,last],[0,0],[0,0],[0,last]]as (readonly[number,number])[]};}
 return base;
}
function dispose(object:THREE.Object3D){
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
 object.traverse(node=>{if(!(node instanceof THREE.Mesh))return;geometries.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material]){materials.add(material);for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);}});
 geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());
}
function StateIcon({cycle}:{account:Account;cycle:AccountCycle}){
 if(cycle.stale)return <Clock3 size={12}/>;
 if(cycle.blocked)return /로그인|인증|계정 연결|미연결/.test(cycle.blocker||'')?<LockKeyhole size={12}/>:<AlertTriangle size={12}/>;
 return null;
}
const World=forwardRef<WorldHandle,Props>(function World(props,ref){
 const host=useRef<HTMLDivElement>(null),latest=useRef(props),revision=useRef(0),controller=useRef<WorldHandle|null>(null),markers=useRef(new Map<string,HTMLButtonElement>()),retryPictures=useRef<()=>void>(()=>{});
 const [mode,setMode]=useState(()=>modeFor(innerWidth,innerHeight)),[attempt,setAttempt]=useState(0),[loaded,setLoaded]=useState(false),[error,setError]=useState<string|null>(null),[missing,setMissing]=useState(0),[pictureMissing,setPictureMissing]=useState(0);
 const plans=props.snapshot.accounts.some(account=>!!accountCycle(account,props.snapshot,props.stale,{schedules:props.schedules}).overviewPlanLabel);
 latest.current=props;revision.current++;
 useImperativeHandle(ref,()=>({zoom:d=>controller.current?.zoom(d),reset:()=>controller.current?.reset(),rotate:()=>controller.current?.rotate(),focus:id=>controller.current?.focus(id),focusProcess:key=>controller.current?.focusProcess(key),visitDistrict:i=>controller.current?.visitDistrict(i)}),[]);
 useEffect(()=>{
  if(!host.current)return;const element=host.current;setLoaded(false);setError(null);setMissing(0);setPictureMissing(0);(window as unknown as {__bizWorld:unknown}).__bizWorld={ready:false};
  let renderer:THREE.WebGLRenderer;try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});}catch{setError('작업소를 열지 못했습니다.');latest.current.onReady();return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.06;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
  renderer.domElement.setAttribute('role','img');renderer.domElement.setAttribute('aria-label','공유 인쇄기와 13개 계정별 작품 심사 작업대. 각 계정의 심사, 다음 제출 계획, 다음 확인 시각이 함께 표시됩니다.');element.prepend(renderer.domElement);
  let stopped=false,lost=false,ready=false,dirty=true,frame=0,lastDraw=0,lastRevision=-1,frames=0,renderMs=0,lastSafe='',following=true,lastSelected=latest.current.selected;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#b9cdca');
  const camera=new THREE.OrthographicCamera(-16,16,25,-25,.1,300),direction=new THREE.Vector3(mode.endsWith('-short')?0:7,96,98);
  const controls=new OrbitControls(camera,element);controls.enableRotate=false;controls.enableDamping=true;controls.dampingFactor=.14;controls.screenSpacePanning=false;controls.minZoom=.65;controls.maxZoom=3;
  controls.mouseButtons={LEFT:THREE.MOUSE.PAN,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};controls.touches={ONE:THREE.TOUCH.PAN,TWO:THREE.TOUCH.DOLLY_PAN};controls.addEventListener('change',()=>{dirty=true;});
  scene.add(new THREE.HemisphereLight('#f6fbfc','#698c89',2.0));const sun=new THREE.DirectionalLight('#fff0dc',2.55);sun.position.set(-26,65,32);sun.castShadow=true;sun.shadow.mapSize.set(1536,1536);Object.assign(sun.shadow.camera,{left:-55,right:55,top:55,bottom:-55,near:1,far:150});sun.shadow.normalBias=.025;sun.shadow.bias=-.0002;scene.add(sun);
  const fill=new THREE.DirectionalLight('#b9e4ee',.72);fill.position.set(30,25,-20);scene.add(fill);
  const layout=workshopLayout(element.clientWidth,element.clientHeight,plans),stationDepth=plans&&layout.compactLandscape?.45:plans&&!layout.landscape?(layout.compactPortrait?.42:.65):layout.compactPortrait?.8:layout.compactLandscape?.75:1,stationHeight=plans&&layout.compactLandscape?.7:plans&&!layout.landscape?(layout.compactPortrait?.55:.85):1,pressScale=plans&&layout.compactLandscape?.45:layout.compactPortrait?.72:layout.compactLandscape?.65:1,buildingGroup=new THREE.Group();scene.add(buildingGroup);
  const materials=new Map<string,THREE.MeshStandardMaterial>(),geometries=new Map<string,THREE.BufferGeometry>(),models=new Map<string,THREE.Group>(),loader=new GLTFLoader(),abort=new AbortController();
  const groups=new Map<string,THREE.Group>(),stations=new Map<string,StationParts>(),cycles=new Map<string,AccountCycle>(),selections=new Map<string,THREE.Mesh>(),dynamicRoots:THREE.Object3D[]=[],dynamicBatches:DynamicBatch[]=[],pictures=new Map<string,THREE.Texture>(),pictureLoads=new Map<string,Promise<THREE.Texture|null>>(),pictureFailures=new Set<string>(),shared=new Map<ProcessKey,SharedParts>(),processGroups=new Map<ProcessKey,THREE.Group>();
  const pictureCallbacks=new Map<string,Map<string,(texture:THREE.Texture)=>void>>(),pictureAttempts=new Map<string,number>(),pictureRetryTimers=new Map<string,ReturnType<typeof setTimeout>>();
  const artworkBindings=new Map<string,{paper:THREE.MeshStandardMaterial;candidate:string|null}>();let printerPaper:THREE.MeshStandardMaterial|null=null,printerCandidate:string|null|undefined;
  const transfers:Transfer[]=[],seenEvents=new Set<number>(),assetStates=new Map<string,string>(),seenStock=new Map<string,number>();let initialized=false,lastObserved='',lastPick:unknown=null;
  let safe:Rect={left:12,right:element.clientWidth-12,top:68,bottom:element.clientHeight-84};
  function material(color:string){let m=materials.get(color);if(!m){m=new THREE.MeshStandardMaterial({color,roughness:.64,metalness:color===industry.steel||color===industry.dark?.18:.04});materials.set(color,m);}return m;}
  function box(w:number,h:number,d:number,color:string,x:number,y:number,z:number,parent:THREE.Object3D=scene){
   const key=[w,h,d].join('/');let geometry=geometries.get(key);if(!geometry){geometry=Math.min(w,h,d)<.12?new THREE.BoxGeometry(w,h,d):new RoundedBoxGeometry(w,h,d,2,Math.min(.09,w/3,h/3,d/3));geometries.set(key,geometry);}
   const object=new THREE.Mesh(geometry,material(color));object.position.set(x,y,z);object.castShadow=h>.1;object.receiveShadow=true;parent.add(object);return object;
  }
  function dynamic<T extends THREE.Object3D>(object:T){object.userData.dynamic=true;if(object instanceof THREE.Mesh)object.material=Array.isArray(object.material)?object.material.map(item=>item.clone()):object.material.clone();dynamicRoots.push(object);return object;}
  function model(name:string,parent:THREE.Object3D,w:number,d:number,h:number){
   const source=models.get(name);if(!source)return null;const object=source.clone(true),bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3());object.scale.setScalar(Math.min(w/Math.max(.001,size.x),d/Math.max(.001,size.z),h/Math.max(.001,size.y)));
   const fitted=new THREE.Box3().setFromObject(object),center=fitted.getCenter(new THREE.Vector3());object.position.set(-center.x,-fitted.min.y,-center.z);object.traverse(node=>{if(node instanceof THREE.Mesh){node.castShadow=true;node.receiveShadow=true;}});parent.add(object);return object;
  }
  function ring(group:THREE.Group,key:string,w:number,d:number){
   const shape=new THREE.Shape();shape.moveTo(-w/2,-d/2);shape.lineTo(w/2,-d/2);shape.lineTo(w/2,d/2);shape.lineTo(-w/2,d/2);shape.closePath();const hole=new THREE.Path();hole.moveTo(-w/2+.09,-d/2+.09);hole.lineTo(-w/2+.09,d/2-.09);hole.lineTo(w/2-.09,d/2-.09);hole.lineTo(w/2-.09,-d/2+.09);hole.closePath();shape.holes.push(hole);
   const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color:'#ddb86f',side:THREE.DoubleSide}));mesh.rotation.x=-Math.PI/2;mesh.position.y=.18;mesh.userData.noMerge=true;mesh.visible=false;group.add(mesh);selections.set(key,mesh);
  }
  function hit(parent:THREE.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,data:Record<string,unknown>){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial({visible:false}));mesh.position.set(x,y,z);Object.assign(mesh.userData,{hitTarget:true,...data});parent.add(mesh);}
  function activePicture(id:string){return printerCandidate===id||[...artworkBindings.values()].some(binding=>binding.candidate===id);}
  function startPicture(id:string){
   if(stopped||pictureLoads.has(id)||!activePicture(id))return;
   const count=(pictureAttempts.get(id)||0)+1;if(count>4)return;pictureAttempts.set(id,count);
   const pending=new Promise<THREE.Texture|null>(resolve=>{new THREE.TextureLoader().load('/api/thumbnail/'+encodeURIComponent(id)+(count>1?'?retry='+(count-1):''),texture=>{
    if(stopped){texture.dispose();resolve(null);return;}texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());pictures.set(id,texture);
    if(pictures.size>96){for(const [oldId,oldTexture]of pictures){if(pictures.size<=96)break;if(!activePicture(oldId)){pictures.delete(oldId);oldTexture.dispose();}}}
    pictureFailures.delete(id);setPictureMissing(pictureFailures.size);pictureAttempts.delete(id);for(const apply of pictureCallbacks.get(id)?.values()||[])apply(texture);pictureCallbacks.delete(id);dirty=true;resolve(texture);
   },undefined,()=>{
    if(!stopped&&activePicture(id)){pictureFailures.add(id);setPictureMissing(pictureFailures.size);if(count<4){const timer=setTimeout(()=>{pictureRetryTimers.delete(id);startPicture(id);},[300,900,1800][count-1]);pictureRetryTimers.set(id,timer);}}
    else{pictureCallbacks.delete(id);pictureAttempts.delete(id);}resolve(null);
   });});pictureLoads.set(id,pending);pending.finally(()=>pictureLoads.delete(id));
  }
  function picture(id:string,key:string,apply:(texture:THREE.Texture)=>void){
   const cached=pictures.get(id);if(cached){apply(cached);return;}
   const callbacks=pictureCallbacks.get(id)||new Map<string,(texture:THREE.Texture)=>void>();callbacks.set(key,apply);pictureCallbacks.set(id,callbacks);
   if(!pictureRetryTimers.has(id))startPicture(id);
  }
  retryPictures.current=()=>{for(const id of pictureFailures){if(!activePicture(id))continue;const timer=pictureRetryTimers.get(id);if(timer)clearTimeout(timer);pictureRetryTimers.delete(id);pictureAttempts.delete(id);startPicture(id);}};
  function bindArtwork(account:Account,parts:StationParts){
   const available=new Set(latest.current.thumbnails||[]),assets=currentAssets(latest.current.snapshot,account.id);
   for(const area of ['stock','review','archive'] as const){
    const states=area==='stock'?['ready']:area==='review'?['submitted']:['approved','published'];const candidate=assets.find(asset=>states.includes(asset.state)&&available.has(asset.id));
    groups.get(account.id)!.userData['image-'+area]=!!candidate;
    const key=account.id+'/'+area,previous=artworkBindings.get(key);if(previous&&previous.candidate===(candidate?.id||null))continue;
    const paper=previous?.paper||new THREE.MeshStandardMaterial({color:industry.white,roughness:.62,metalness:0});artworkBindings.set(key,{paper,candidate:candidate?.id||null});paper.map=null;paper.needsUpdate=true;
    if(!previous)for(const item of parts.artwork.filter(item=>item.area===area))item.object.traverse(node=>{if(node instanceof THREE.Mesh&&node.name==='artwork-surface')node.material=paper;});
    if(!candidate)continue;
    const apply=(texture:THREE.Texture)=>{if(artworkBindings.get(key)?.candidate!==candidate.id)return;paper.map=texture;paper.color.set('#ffffff');paper.needsUpdate=true;dirty=true;};
    picture(candidate.id,key,apply);
   }
  }
  function bindPrinterArtwork(parts:SharedParts){
   const available=new Set(latest.current.thumbnails||[]),candidate=currentAssets(latest.current.snapshot).find(asset=>asset.state==='ready'&&available.has(asset.id));if(printerCandidate===(candidate?.id||null))return;printerCandidate=candidate?.id||null;
   const first=!printerPaper,paper=printerPaper||new THREE.MeshStandardMaterial({color:industry.white,roughness:.62});printerPaper=paper;paper.map=null;paper.needsUpdate=true;
   if(first)for(const object of parts.active)object.traverse(node=>{if(node instanceof THREE.Mesh&&node.name==='artwork-surface')node.material=paper;});
   if(candidate)picture(candidate.id,'printer',texture=>{if(printerCandidate!==candidate.id)return;paper.map=texture;paper.needsUpdate=true;dirty=true;});
  }
  function mergeAndInstance(){
   scene.updateMatrixWorld(true);const statics=new Map<string,THREE.Mesh[]>();
   scene.traverse(node=>{if(!(node instanceof THREE.Mesh)||node.userData.hitTarget||node.userData.noMerge||Array.isArray(node.material))return;let ancestor:THREE.Object3D|null=node;while(ancestor){if(!ancestor.visible||ancestor.userData.dynamic)return;ancestor=ancestor.parent;}statics.set(node.material.uuid,[...(statics.get(node.material.uuid)||[]),node]);});
   for(const sources of statics.values()){
    const parts=sources.map(source=>(source.geometry.index?source.geometry.toNonIndexed():source.geometry.clone()).applyMatrix4(source.matrixWorld));const geometry=mergeGeometries(parts,false);if(geometry){const merged=new THREE.Mesh(geometry,sources[0].material);merged.castShadow=true;merged.receiveShadow=true;scene.add(merged);sources.forEach(source=>source.removeFromParent());}parts.forEach(part=>part.dispose());
   }
   const batches=new Map<string,{sources:THREE.Mesh[];roots:THREE.Object3D[]}>();
   for(const root of dynamicRoots){if(root instanceof THREE.Mesh)continue;root.traverse(node=>{if(!(node instanceof THREE.Mesh)||node.userData.hitTarget)return;const key=node.geometry.uuid+String(Array.isArray(node.material)?node.material.map(m=>m.uuid):node.material.uuid),batch=batches.get(key)||{sources:[],roots:[]};batch.sources.push(node);batch.roots.push(root);batches.set(key,batch);});}
   for(const batch of batches.values()){const source=batch.sources[0],mesh=new THREE.InstancedMesh(source.geometry,source.material,batch.sources.length);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;batch.sources.forEach(source=>{source.visible=false;});scene.add(mesh);dynamicBatches.push({mesh,...batch});}
  }
  function rollerLine(x1:number,z1:number,x2:number,z2:number,width=.55){
   const length=Math.hypot(x2-x1,z2-z1);if(length<.05)return;const group=new THREE.Group();group.position.set((x1+x2)/2,.29,(z1+z2)/2);group.rotation.y=Math.atan2(x2-x1,z2-z1);scene.add(group);
   box(width+.16,.15,length,industry.steel,0,0,0,group);for(const side of [-1,1])box(.055,.13,length,industry.orange,side*(width/2+.035),.15,0,group);
   for(let i=.17;i<length;i+=.42){const roller=new THREE.Mesh(new THREE.CylinderGeometry(.065,.065,width,10),material(industry.white));roller.rotation.z=Math.PI/2;roller.position.set(0,.13,-length/2+i);group.add(roller);}
  }
  function build(){
   const cx=(layout.minX+layout.maxX)/2,cz=(layout.minZ+layout.maxZ)/2,w=layout.maxX-layout.minX+1,d=layout.maxZ-layout.minZ+1;
   box(w,.75,d,industry.rim,cx,-.4,cz);box(w-.25,.18,d-.25,industry.floor,cx,.02,cz);
   // One roller spine and short row feeds form a working print line, not separate tables.
   const feed=plans&&layout.compactLandscape?-46:layout.compactLandscape?-49:layout.landscape?-21:-3.5,top=plans&&layout.compactLandscape?-11:layout.compactLandscape?-17:layout.landscape?-10:-17.8,bottom=Math.max(...layout.plots.map(point=>point[1]))+1.95;
   rollerLine(feed,top,feed,bottom);
   const printer=layout.facilities[0];
   if(layout.landscape){rollerLine(printer[0]-2.8*pressScale,printer[1]+4.4*pressScale,feed,printer[1]+4.4*pressScale);}
   else rollerLine(printer[0]-2.8*pressScale,printer[1]+4.4*pressScale,feed,top);
   for(const z of [...new Set(layout.plots.map(point=>point[1]))]){const row=layout.plots.filter(point=>point[1]===z),left=Math.min(feed,...row.map(point=>point[0]-2.3*(layout.compactLandscape?1.4:1))),right=Math.max(feed,...row.map(point=>point[0]-2.3*(layout.compactLandscape?1.4:1)));rollerLine(left,z+1.95,right,z+1.95);for(const point of row)rollerLine(point[0]-2.3*(layout.compactLandscape?1.4:1),z+Math.min(1.65,stationDepth*2.2),point[0]-2.3*(layout.compactLandscape?1.4:1),z+1.95);}
   const tools={box,model,dynamic};
   for(const account of latest.current.snapshot.accounts){
    const p=layout.plots[account.number-1];if(!p)continue;const group=new THREE.Group();group.position.set(p[0],.1,p[1]);group.scale.z=stationDepth;group.scale.y=stationHeight;if(layout.compactLandscape)group.scale.x=1.4;buildingGroup.add(group);groups.set(account.id,group);
    const parts=buildAccountStation(group,tools);stations.set(account.id,parts);bindArtwork(account,parts);ring(group,account.id,6.7,5.0);
    hit(group,4.9,.55,3.1,-.25,1.35,-.35,{accountId:account.id,area:'review'});
    hit(group,1.45,.9,1.65,-2.3,.75,1.45,{accountId:account.id,area:'stock'});
    hit(group,1.05,1.7,3.2,2.57,1.1,-.05,{accountId:account.id,area:'archive'});
    hit(group,1.0,1.0,.7,1.8,1.8,-1.4,{accountId:account.id,area:'schedule'});
    hit(group,2.0,1.7,.7,-2.3,1.03,2.05,{accountId:account.id,area:'account',blockedOnly:true});
    for(const kind of ['production','submission','archive'] as const){const transfer=dynamic(new THREE.Group());scene.add(transfer);model(kind==='submission'?'submission-folio':'print-stack',transfer,.8,.65,.16);transfer.visible=false;transfers.push({id:account.id,kind,start:-1,group:transfer});}
   }
   for(const process of processes){const index=processes.findIndex(item=>item.key===process.key),p=layout.facilities[index],group=new THREE.Group();group.position.set(p[0],.12,p[1]);buildingGroup.add(group);group.userData.role=process.key==='inspection'?'account-review-tables':process.key==='archive'?'account-publication-galleries':process.key==='stock'?'account-outgoing-prints':process.key;processGroups.set(process.key,group);
    if(process.key==='generation'){if(pressScale!==1)group.scale.setScalar(pressScale);const parts=buildPrintPress(group,tools);shared.set(process.key,parts);bindPrinterArtwork(parts);hit(group,16,2.8,5.5,0,1.5,0,{process:process.key});}
    else if(process.key==='revenue'){shared.set(process.key,buildLedger(group,tools));hit(group,4.8,1.5,3.6,0,.9,0,{process:process.key});}
    else if(process.key==='submission'){shared.set(process.key,buildSubmissionClock(group,tools));hit(group,4.8,2.5,3.6,0,1.4,0,{process:process.key});}
   }
   mergeAndInstance();ready=true;lastRevision=-1;dirty=true;renderer.shadowMap.needsUpdate=true;setLoaded(true);setMissing(Object.keys(modelFiles).filter(key=>!models.has(key)).length);fit(true);latest.current.onReady();
  }
  async function load(name:string,path:string){const response=await fetch(path,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(18000)])});if(!response.ok)throw new Error('Model HTTP '+response.status+': '+name);const gltf=await loader.parseAsync(await response.arrayBuffer(),path.slice(0,path.lastIndexOf('/')+1));if(stopped){dispose(gltf.scene);return;}models.set(name,gltf.scene);}
  Promise.allSettled(Object.entries(modelFiles).map(([name,path])=>load(name,path))).then(()=>{if(!stopped)build();});
  function readSafe(){const p=latest.current,w=element.clientWidth,h=element.clientHeight;safe={left:12,right:w-12,top:p.safeTop??68,bottom:h-(p.safeBottom??84)};
   if(p.trayOpen&&layout.landscape){const rect=document.querySelector<HTMLElement>('.game-tray')?.getBoundingClientRect(),hostRect=element.getBoundingClientRect();if(rect&&rect.width<w*.72&&rect.left>hostRect.left+w*.25){safe.right=Math.max(68,rect.left-hostRect.left-10);safe.bottom=h-12;}}
   if(safe.bottom-safe.top<170)safe.bottom=safe.top+170;
  }
  function settleControls(){const damping=controls.enableDamping;controls.enableDamping=false;controls.update();controls.enableDamping=damping;}
  function fit(reset=false){
   settleControls();readSafe();const w=element.clientWidth,h=element.clientHeight,compact=!!latest.current.trayOpen;
   const minX=compact?Math.min(...layout.plots.map(p=>p[0]))-4.2:layout.minX,maxX=compact?Math.max(...layout.plots.map(p=>p[0]))+4.2:layout.maxX,minZ=compact?Math.min(...layout.plots.map(p=>p[1]))-2.6:layout.minZ,maxZ=compact?Math.max(...layout.plots.map(p=>p[1]))+5.0:layout.maxZ;
   const target=new THREE.Vector3((minX+maxX)/2,0,(minZ+maxZ)/2),dir=reset?direction.clone():camera.position.clone().sub(controls.target).normalize().multiplyScalar(direction.length());camera.position.copy(target).add(dir);camera.lookAt(target);camera.updateMatrixWorld(true);
   const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1),corners:THREE.Vector3[]=[];for(const x of [minX,maxX])for(const z of [minZ,maxZ])for(const y of [0,compact?2.7:3.8])corners.push(new THREE.Vector3(x,y,z));const xs=corners.map(p=>p.clone().sub(target).dot(right)),ys=corners.map(p=>p.clone().sub(target).dot(up)),minY=Math.min(...ys),maxY=Math.max(...ys);
   const units=Math.max((Math.max(...xs)-Math.min(...xs))/(safe.right-safe.left),(maxY-minY)/Math.max(120,safe.bottom-safe.top-10));camera.left=-w*units/2;camera.right=w*units/2;camera.top=h*units/2;camera.bottom=-h*units/2;
   const shift=up.multiplyScalar((minY+maxY)/2+((safe.top+safe.bottom)/2-h/2)*units-(plans&&layout.compactLandscape?12*units:0)).add(right.multiplyScalar((Math.min(...xs)+Math.max(...xs))/2-((safe.left+safe.right)/2-w/2)*units));controls.target.copy(target).add(shift);camera.position.copy(controls.target).add(dir);camera.zoom=1;camera.updateProjectionMatrix();controls.update();camera.updateMatrixWorld(true);following=true;dirty=true;
  }
  controller.current={zoom:delta=>{camera.zoom=THREE.MathUtils.clamp(camera.zoom*(delta>0?1.2:1/1.2),.65,3);camera.updateProjectionMatrix();following=false;dirty=true;},reset:()=>fit(true),rotate:()=>fit(true),focus:id=>{const account=latest.current.snapshot.accounts.find(item=>item.id===id);if(account){
    settleControls();readSafe();const p=layout.plots[account.number-1],dir=direction.clone(),zoom=layout.landscape?1.8:2.35,w=element.clientWidth,h=element.clientHeight,units=Math.max(7.5*(layout.compactLandscape?1.4:1)/(Math.min(safe.right-safe.left,layout.landscape?550:400)*.8),(plans?9:7.8)/Math.max(120,(safe.bottom-safe.top)*.8));
    controls.target.set(p[0],.5,p[1]+1.3);camera.position.copy(controls.target).add(dir);camera.lookAt(controls.target);camera.updateMatrixWorld(true);
    const up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1),right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0);controls.target.add(up.multiplyScalar(((safe.top+safe.bottom)/2-h/2)*units)).add(right.multiplyScalar(-((safe.left+safe.right)/2-w/2)*units));camera.position.copy(controls.target).add(dir);camera.left=-w*units*zoom/2;camera.right=w*units*zoom/2;camera.top=h*units*zoom/2;camera.bottom=-h*units*zoom/2;camera.zoom=zoom;camera.updateProjectionMatrix();controls.update();dirty=true;
   }following=false;},focusProcess:()=>{following=true;dirty=true;},visitDistrict:()=>fit(true)};
  const pointers=new Set<number>();let gesture:{id:number;x:number;y:number;account:string|null;process:ProcessKey|null;cancelled:boolean}|null=null;
  function down(event:PointerEvent){if(lost)return;pointers.add(event.pointerId);if(pointers.size>1){if(gesture)gesture.cancelled=true;return;}const candidate=(event.target as Element).closest<HTMLButtonElement>('[data-account],[data-process]'),bounds=candidate?.getBoundingClientRect(),label=candidate&&bounds&&event.clientX>=bounds.left&&event.clientX<=bounds.right&&event.clientY>=bounds.top&&event.clientY<=bounds.bottom?candidate:null;
   if(!candidate&&(event.target as Element).closest('button')){event.stopPropagation();gesture=null;pointers.delete(event.pointerId);return;}gesture={id:event.pointerId,x:event.clientX,y:event.clientY,account:label?.dataset.account||null,process:label?.dataset.process as ProcessKey||null,cancelled:event.button!==0||!event.isPrimary};
  }
  function move(event:PointerEvent){if(gesture&&Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>8){gesture.cancelled=true;following=false;}}
  function inspectAccount(id:string,area:AccountArea){if(latest.current.onInspectAccount)latest.current.onInspectAccount(id,area);else latest.current.onSelect(id);}
  function up(event:PointerEvent){const tap=gesture&&gesture.id===event.pointerId&&!gesture.cancelled&&pointers.size===1&&Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)<=8;pointers.delete(event.pointerId);if(!tap||!gesture||lost){if(!pointers.size)gesture=null;return;}const g=gesture;gesture=null;
   if(g.account){latest.current.onSelect(g.account);return;}if(g.process){latest.current.onInspectProcess?.(g.process);return;}
   camera.updateMatrixWorld(true);scene.updateMatrixWorld(true);const rect=element.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
   const hits=ray.intersectObject(buildingGroup,true).filter(hit=>hit.object.userData.hitTarget&&(!hit.object.userData.blockedOnly||cycles.get(hit.object.userData.accountId)?.blocked));lastPick={x:event.clientX,y:event.clientY,hits:hits.slice(0,5).map(hit=>({account:hit.object.userData.accountId,area:hit.object.userData.area,process:hit.object.userData.process,point:hit.point.toArray()}))};const target=hits[0]?.object.userData;
   if(target?.accountId)inspectAccount(target.accountId,target.area);else if(target?.process)latest.current.onInspectProcess?.(target.process);else if(latest.current.selected||latest.current.activeProcess)latest.current.onSelect('');
  }
  function cancel(event:PointerEvent){pointers.delete(event.pointerId);if(gesture)gesture.cancelled=true;if(!pointers.size)gesture=null;}
  for(const [name,fn]of[['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel]]as const)element.addEventListener(name,fn,true);
  function contextLost(event:Event){event.preventDefault();lost=true;controls.enabled=false;cancelAnimationFrame(frame);setError('작업소의 3D 연결이 끊겼습니다.');(window as unknown as {__bizWorld:unknown}).__bizWorld={ready:false,lostContext:true};latest.current.onReady();}
  function restored(){if(!stopped)setAttempt(value=>value+1);}renderer.domElement.addEventListener('webglcontextlost',contextLost);renderer.domElement.addEventListener('webglcontextrestored',restored);
  function project(position:THREE.Vector3){const point=position.clone().project(camera);return {x:(point.x*.5+.5)*element.clientWidth,y:(-point.y*.5+.5)*element.clientHeight};}
  function projectLocal(id:string,x:number,y:number,z:number){const point=new THREE.Vector3(x,y,z);groups.get(id)?.localToWorld(point);return project(point);}
  function projectLabels(){
   const spacing=project(new THREE.Vector3(layout.colGap,0,0)).x-project(new THREE.Vector3(0,0,0)).x;
   for(const [key,marker]of markers.current){const account=latest.current.snapshot.accounts.find(a=>a.id===key),index=processes.findIndex(p=>'process-'+p.key===key),p=account?layout.plots[account.number-1]:layout.facilities[index];if(!p)continue;
    const compactPress=!account&&layout.compactPortrait&&processes[index]?.key==='generation',landscapePress=!account&&layout.compactLandscape&&processes[index]?.key==='generation',point=project(new THREE.Vector3(p[0]+(compactPress?9:landscapePress?(plans?0:-4):0),.35,p[1]+(account?(plans&&!layout.landscape?(layout.compactPortrait?7.2:6.6):layout.compactPortrait||layout.compactLandscape?6.4:5.0):plans&&layout.compactLandscape?(processes[index]?.key==='generation'?7:6.6):compactPress?-1.5:processes[index]?.key==='generation'?(layout.landscape&&!layout.compactLandscape?6.2:3.6):2.7)));
    if(account&&layout.compactLandscape)point.y+=plans?18:12;if(!account){marker.style.width=plans&&layout.compactLandscape?'70px':landscapePress?'104px':processes[index]?.key==='generation'?'140px':'';marker.style.flexDirection=plans&&layout.compactLandscape?'column':'';marker.style.whiteSpace=plans&&layout.compactLandscape?'normal':'';}
    if(account){marker.style.width=Math.max(layout.landscape&&element.clientHeight<500?70:74,Math.min(150,spacing-7))+'px';marker.dataset.compact=String(spacing<97||(plans&&(layout.compactPortrait||layout.compactLandscape)));}
    const dock=layout.compactLandscape&&!latest.current.trayOpen?document.querySelector<HTMLElement>('.command-dock:not([hidden])')?.getBoundingClientRect():null,bottomLimit=dock?Math.max(safe.bottom,dock.top-element.getBoundingClientRect().top):safe.bottom;
    const halfW=marker.offsetWidth/2,halfH=marker.offsetHeight/2,visible=point.x>=safe.left+halfW-.5&&point.x<=safe.right-halfW+.5&&point.y>=safe.top+halfH-.5&&point.y<=bottomLimit-halfH+.5;marker.style.visibility=visible?'visible':'hidden';marker.tabIndex=visible?0:-1;marker.style.transform=`translate(${point.x}px,${point.y}px) translate(-50%,-50%)`;marker.dataset.anchorX=point.x.toFixed(2);marker.dataset.anchorY=point.y.toFixed(2);
   }
  }
  function setClock(clock:THREE.Object3D|null,cycle:AccountCycle){if(!clock)return;const hour=clock.getObjectByName('hour-hand'),minute=clock.getObjectByName('minute-hand'),precise=cycle.nextAt&&!/^\d{4}-\d{2}-\d{2}$/.test(cycle.nextAt)&&Number.isFinite(Date.parse(cycle.nextAt));
   if(hour)hour.visible=!!precise;if(minute)minute.visible=!!precise;if(!precise)return;const values=new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',hour:'numeric',minute:'numeric',hourCycle:'h23'}).formatToParts(new Date(cycle.nextAt!));const hours=Number(values.find(p=>p.type==='hour')?.value||0),minutes=Number(values.find(p=>p.type==='minute')?.value||0);if(hour)hour.rotation.z=-(hours%12+minutes/60)*Math.PI/6;if(minute)minute.rotation.z=-minutes*Math.PI/30;
  }
  function updateObserved(now:number){const p=latest.current,newObservation=p.snapshot.observedAt!==lastObserved,assets=currentAssets(p.snapshot),events=initialized&&newObservation?p.snapshot.recent.filter(event=>event.state==='submitted'&&!seenEvents.has(event.id)):[],approved=initialized&&newObservation?assets.filter(asset=>assetStates.get(asset.id)==='submitted'&&['approved','published'].includes(asset.state)):[];
   for(const account of p.snapshot.accounts){const cycle=accountCycle(account,p.snapshot,p.stale,{schedules:p.schedules}),parts=stations.get(account.id);cycles.set(account.id,cycle);if(!parts)continue;if(newObservation)bindArtwork(account,parts);
    parts.review.forEach((group,i)=>{group.visible=cycle.reviewCount>0&&i<Math.max(1,Math.ceil(Math.min(1,cycle.reviewCount/20)*4));});parts.stock.forEach((group,i)=>{group.visible=cycle.ready>0&&i<Math.max(1,Math.ceil(cycle.stockFill*3));});parts.archive.forEach((group,i)=>{group.visible=cycle.archived>0&&!!groups.get(account.id)?.userData['image-archive']&&i<Math.max(1,Math.min(2,Math.ceil(cycle.archived/20)));});parts.archiveStorage.visible=cycle.archived>0&&!groups.get(account.id)?.userData['image-archive'];
    parts.gate.visible=cycle.blocked&&/로그인|인증|계정 연결|미연결/.test(cycle.blocker||'');parts.fault.visible=cycle.blocked&&!parts.gate.visible;setClock(parts.clock,cycle);const selected=selections.get(account.id);if(selected)selected.visible=account.id===p.selected;
    if(newObservation&&initialized&&!p.stale&&!p.reduced){if(events.some(event=>event.accountId===account.id)&&!cycle.blocked){const transfer=transfers.find(t=>t.id===account.id&&t.kind==='submission');if(transfer)transfer.start=now;}if(approved.some(asset=>asset.accountId===account.id)){const transfer=transfers.find(t=>t.id===account.id&&t.kind==='archive');if(transfer)transfer.start=now;}const previous=seenStock.get(account.id);if(previous!==undefined&&cycle.ready>previous){const transfer=transfers.find(t=>t.id===account.id&&t.kind==='production');if(transfer)transfer.start=now;}}
    if(p.stale||cycle.blocked){for(const transfer of transfers.filter(t=>t.id===account.id&&t.kind==='submission')){transfer.start=-1;transfer.group.visible=false;}}
    if(newObservation)seenStock.set(account.id,cycle.ready);
   }
   const printer=shared.get('generation');if(newObservation&&printer)bindPrinterArtwork(printer);
   if(newObservation){for(const id of pictureFailures){if(activePicture(id))continue;pictureFailures.delete(id);pictureCallbacks.delete(id);pictureAttempts.delete(id);const timer=pictureRetryTimers.get(id);if(timer)clearTimeout(timer);pictureRetryTimers.delete(id);}setPictureMissing(pictureFailures.size);}
   const ledger=shared.get('revenue'),revenueId=p.revenueAccountId||p.selected||p.snapshot.accounts[0]?.id,items=(p.revenue?.items||[]).filter(item=>item.accountId===revenueId),maximum=Math.max(1,...items.map(item=>item.amountKrw||0));
   ledger?.months.forEach((mesh,index)=>{const record=items.find(item=>item.month===index+1),known=!!record&&record.amountKrw!==null&&!p.revenueError;mesh.scale.y=known&&record.amountKrw!>0?1+Math.sqrt(record.amountKrw!/maximum)*3:1;(mesh.material as THREE.MeshStandardMaterial).color.set(known?record.amountKrw===0?industry.mint:industry.orange:industry.concrete);mesh.userData.amount=known?record.amountKrw:null;});ledger?.monthSeals.forEach((seal,index)=>{seal.visible=items.some(item=>item.month===index+1&&item.amountKrw!==null)&&!p.revenueError;});
   for(const [key,group]of processGroups)group.userData.active=processState(key,p.snapshot,p.stale).active;
   if(newObservation){for(const event of p.snapshot.recent)seenEvents.add(event.id);for(const asset of assets)assetStates.set(asset.id,asset.state);lastObserved=p.snapshot.observedAt;initialized=true;}renderer.shadowMap.needsUpdate=true;
  }
  function transferPosition(transfer:Transfer,t:number){const account=latest.current.snapshot.accounts.find(a=>a.id===transfer.id),p=account?layout.plots[account.number-1]:null;if(!p)return new THREE.Vector3();
   const depth=stationDepth,span=layout.compactLandscape?1.4:1;if(transfer.kind==='submission')return new THREE.Vector3(p[0]+THREE.MathUtils.lerp(-2.3,-.25,t)*span,1.55,p[1]+THREE.MathUtils.lerp(1.45,-.2,t)*depth);
   if(transfer.kind==='archive')return new THREE.Vector3(p[0]+THREE.MathUtils.lerp(-.25,2.57,t)*span,1.6+Math.sin(t*Math.PI)*.18,p[1]+THREE.MathUtils.lerp(-.2,.4,t)*depth);
   const factory=layout.facilities[0],start=new THREE.Vector3(factory[0]-2.8*pressScale,1.3*pressScale,factory[1]+2.15*pressScale),exit=new THREE.Vector3(start.x,.62,factory[1]+4.4*pressScale),aisle=plans&&layout.compactLandscape?-46:layout.compactLandscape?-49:layout.landscape?-21:-3.5,points=[start,exit,new THREE.Vector3(aisle,.62,exit.z),new THREE.Vector3(aisle,.62,p[1]+1.95),new THREE.Vector3(p[0]-2.3*span,.62,p[1]+1.95),new THREE.Vector3(p[0]-2.3*span,.8,p[1]+1.45*depth)],lengths=points.slice(1).map((point,i)=>point.distanceTo(points[i]));let distance=t*lengths.reduce((a,b)=>a+b,0);for(let i=0;i<lengths.length;i++){if(distance<=lengths[i])return points[i].clone().lerp(points[i+1],distance/Math.max(.001,lengths[i]));distance-=lengths[i];}return points[points.length-1];
  }
  function render(now:number){if(stopped||lost)return;frame=requestAnimationFrame(render);if(document.hidden||now-lastDraw<1000/30)return;const p=latest.current;
   if(lastRevision!==revision.current){lastRevision=revision.current;dirty=true;readSafe();const safeKey=[safe.left,safe.right,safe.top,safe.bottom,p.trayOpen].join();const selectionChanged=lastSelected!==p.selected,safeChanged=lastSafe!==safeKey;lastSelected=p.selected;lastSafe=safeKey;if(selectionChanged||safeChanged){if(p.selected)controller.current?.focus(p.selected);else if(selectionChanged)fit(true);else if(following||p.activeProcess)fit();}updateObserved(now);}
   controls.update();let animated=false;
   for(const transfer of transfers){if(transfer.start<0)continue;if(p.reduced||p.stale){transfer.start=-1;transfer.group.visible=false;dirty=true;continue;}const progress=(now-transfer.start)/(transfer.kind==='production'?4200:1800);if(progress>=1){transfer.start=-1;transfer.group.visible=false;dirty=true;}else{transfer.group.visible=true;transfer.group.position.copy(transferPosition(transfer,progress));animated=true;}}
   if(!p.reduced&&!p.stale&&processGroups.get('generation')?.userData.active){const output=shared.get('generation')?.active.at(-1);if(output){output.position.z=2.15+Math.sin(now/1200)*.35;animated=true;}}
   if(animated)dirty=true;
   if(dirty&&ready){scene.updateMatrixWorld(true);for(const batch of dynamicBatches){let count=0;batch.sources.forEach((source,index)=>{let visible=true,node:THREE.Object3D|null=source.parent;while(node){if(!node.visible){visible=false;break;}if(node===batch.roots[index])break;node=node.parent;}if(visible)batch.mesh.setMatrixAt(count++,source.matrixWorld);});batch.mesh.count=count;batch.mesh.visible=count>0;batch.mesh.instanceMatrix.needsUpdate=true;}camera.updateMatrixWorld(true);projectLabels();const start=performance.now();renderer.render(scene,camera);renderMs=performance.now()-start;frames++;lastDraw=now;dirty=false;}
   (window as unknown as {__bizWorld:unknown}).__bizWorld={ready,view:'owner-cycle-workshop',totalFrames:frames,renderMs,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,loaded:models.size,modelFailures:Object.keys(modelFiles).filter(key=>!models.has(key)),selected:p.selected,thumbnailFailures:[...pictureFailures],thumbnailAttempts:Object.fromEntries(pictureAttempts),resources:{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,artworkBindings:artworkBindings.size,textureCache:pictures.size},district:0,rotationLocked:true,lastPick,safe,zoom:camera.zoom,layoutColumns:layout.cols,
    visibleAccounts:p.snapshot.accounts.filter(account=>markers.current.get(account.id)?.style.visibility==='visible').map(account=>account.id),cycles:[...cycles].map(([id,cycle])=>({id,...cycle})),cargo:p.snapshot.accounts.map(account=>({id:account.id,ready:account.ready,target:account.target,visible:stations.get(account.id)?.stock.filter(group=>group.visible).length||0})),review:p.snapshot.accounts.map(account=>({id:account.id,count:cycles.get(account.id)?.reviewCount||0,blocker:cycles.get(account.id)?.blocker,gate:stations.get(account.id)?.gate.visible,fault:stations.get(account.id)?.fault.visible,visible:stations.get(account.id)?.review.filter(group=>group.visible).length||0})),
    processes:[...processGroups].map(([key,group])=>({key,role:group.userData.role,active:group.userData.active})),physicalAccounts:p.snapshot.accounts.map(account=>({id:account.id,...projectLocal(account.id,-.25,1.45,-.35)})),physicalAreas:p.snapshot.accounts.flatMap(account=>{return [{area:'review',x:-.25,y:1.45,z:-.35},{area:'stock',x:-2.3,y:.85,z:1.45},{area:'archive',x:2.57,y:1.2,z:0},{area:'schedule',x:1.8,y:2.0,z:-1.4}].map(area=>({id:account.id,area:area.area,...projectLocal(account.id,area.x,area.y,area.z)}));}),transfers:transfers.map(transfer=>({id:transfer.id,kind:transfer.kind,moving:transfer.start>=0})),revenue:{year:p.revenue?.year??null,accountId:p.revenueAccountId||p.selected,months:shared.get('revenue')?.months.map((month,i)=>({month:i+1,amount:month.userData.amount??null}))},camera:{target:controls.target.toArray(),matrixWorld:camera.matrixWorld.toArray(),projection:camera.projectionMatrix.toArray()}};
  }
  function resize(){const w=element.clientWidth,h=element.clientHeight;if(!w||!h)return;const next=modeFor(w,h);if(next!==mode){setMode(next);return;}renderer.setSize(w,h);if(latest.current.selected)controller.current?.focus(latest.current.selected);else fit(true);}
  function visibility(){if(!document.hidden){dirty=true;}}
  const markerObserver=new ResizeObserver(()=>{dirty=true;});for(const marker of markers.current.values())markerObserver.observe(marker);
  const observer=new ResizeObserver(resize);observer.observe(element);document.addEventListener('visibilitychange',visibility);resize();frame=requestAnimationFrame(render);
  return()=>{stopped=true;retryPictures.current=()=>{};pictureRetryTimers.forEach(clearTimeout);abort.abort();cancelAnimationFrame(frame);observer.disconnect();markerObserver.disconnect();controls.dispose();for(const [name,fn]of[['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel]]as const)element.removeEventListener(name,fn,true);document.removeEventListener('visibilitychange',visibility);renderer.domElement.removeEventListener('webglcontextlost',contextLost);renderer.domElement.removeEventListener('webglcontextrestored',restored);dispose(scene);models.forEach(dispose);pictures.forEach(texture=>texture.dispose());renderer.dispose();renderer.domElement.remove();controller.current=null;};
 },[attempt,mode,plans]);
 function bind(id:string,element:HTMLButtonElement|null){if(element)markers.current.set(id,element);else markers.current.delete(id);}
 const visibleFacilities=processes.filter(process=>['generation','submission','revenue'].includes(process.key));
 const retryHud=pictureMissing>0&&missing===0?document.querySelector('.game-hud'):null;
 const retryControl=loaded&&!error&&(missing>0||pictureMissing>0)?<button className="world-model-retry" style={pictureMissing>0&&missing===0?{position:'absolute',zIndex:13,top:retryHud?0:8,bottom:'auto',left:'50%',transform:'translateX(-50%)',width:44,minWidth:44,height:44,minHeight:44,padding:2,display:'flex',flexDirection:'column',gap:0,pointerEvents:'auto',border:'1px solid var(--p-warning-line,#b98b4e)',borderRadius:'var(--p-radius-sm,7px)',background:'var(--p-warning-soft,#fff3d5)',color:'var(--p-warning,#754c1a)',fontSize:12,fontWeight:650,boxShadow:'var(--p-control-shadow)'}:undefined} onPointerDown={event=>event.stopPropagation()} onClick={()=>missing>0?setAttempt(value=>value+1):retryPictures.current()} aria-label={missing>0?`작품 도구 ${missing}개 다시 받기`:`그림 ${pictureMissing}개를 받지 못했습니다. 그림 다시 받기`} title={pictureMissing>0?'그림 다시 받기':undefined}>{pictureMissing>0&&missing===0?<><span style={{display:'flex',alignItems:'center',gap:3}}><RotateCcw size={14}/><b>{pictureMissing}</b></span><span style={{fontSize:10,lineHeight:1.1}}>그림</span></>:<><RotateCcw size={16}/>작품 도구 {missing}개 다시 받기</>}</button>:null;
 return <div ref={host} data-layer={props.layer} data-district={0} data-landscape={mode.startsWith('landscape')} data-plan-layout={plans&&mode==='landscape-short'?'compact-landscape':plans?'planned':'none'} className={`world business-world game-world owner-workshop ${error?'world-failed':''} ${props.reduced?'reduced':''}`}>
  {!loaded&&!error&&<div className="world-loading"><span className="loader"/><span>작업소에 연결하는 중</span></div>}
  {retryHud?createPortal(retryControl,retryHud):retryControl}
  <span className="sr-only" role="status">{pictureMissing>0?`그림 ${pictureMissing}개를 받지 못했습니다. 그림 다시 받기 버튼으로 복구할 수 있습니다.`:''}</span>

  {error?<div className="world-fallback"><h2>13개 계정 작업대</h2><p>{error}</p><button className="world-retry" onClick={()=>setAttempt(value=>value+1)}><RotateCcw size={16}/>3D 다시 열기</button><div className="fallback-plots">{props.snapshot.accounts.map(account=>{const cycle=accountCycle(account,props.snapshot,props.stale,{schedules:props.schedules});return <button key={account.id} onClick={()=>props.onSelect(account.id)}><strong>{accountLabel(account)} · {cycle.reviewLabel}</strong><span>{cycle.overviewLabel}</span>{cycle.overviewPlanLabel&&<span>{cycle.overviewPlanLabel}</span>}<span>{cycle.nextLabel}</span></button>;})}</div></div>:<div className="world-markers">
   {props.snapshot.accounts.map(account=>{const cycle=accountCycle(account,props.snapshot,props.stale,{schedules:props.schedules});return <button key={account.id} ref={element=>bind(account.id,element)} data-account={account.id} data-cycle-tone={cycle.tone} className={`plot-label cycle-sign ${props.selected===account.id?'selected':''} ${cycle.tone} ${cycle.overviewPlanLabel?'has-plan':''}`} onClick={event=>{if(event.detail===0)props.onSelect(account.id);}} aria-label={[...new Set([accountLabel(account),cycle.reviewLabel,cycle.overviewLabel,cycle.overviewPlanLabel,cycle.submissionLabel,cycle.nextLabel])].filter(Boolean).join(', ')} title={cycle.detail}><span className="world-cycle-review" data-cycle-review><b>{account.number}</b><strong>{cycle.reviewLabel}</strong>{!(plans&&mode==='landscape-short')&&<StateIcon account={account} cycle={cycle}/>}</span><span className="world-cycle-submission" data-cycle-submission>{cycle.overviewLabel}</span>{cycle.overviewPlanLabel&&<span className="world-cycle-plan" data-cycle-plan>{cycle.overviewPlanLabel}</span>}<span className="world-cycle-next" data-cycle-next>{cycle.nextLabel}</span></button>;})}
   {visibleFacilities.map(process=>{const Icon=process.key==='generation'?Factory:CalendarDays,state=processState(process.key,props.snapshot,props.stale);return <button key={process.key} ref={element=>bind('process-'+process.key,element)} data-process={process.key} className={`process-label workshop-control ${process.key==='generation'?'press-control':''} ${props.activeProcess===process.key?'selected':''}`} onClick={event=>{if(event.detail===0)props.onInspectProcess?.(process.key);}} aria-label={`${process.name}, ${state.label}`}><span className="workshop-control-title"><Icon size={15}/><strong>{process.name}</strong></span>{process.key==='generation'&&<small>{state.label}</small>}{process.key==='revenue'&&<span>{props.revenue?.year||new Date().getFullYear()}</span>}</button>;})}
  </div>}
 </div>;
});
export default World;
