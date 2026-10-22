import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { AlertTriangle, LockKeyhole, LoaderCircle, Clock3, Package, Factory, ScanLine, Truck, RotateCcw } from "../ui/Icons";
import type { Account, Command, Layer, Snapshot } from "../types";
import { accountLabel, severity, status, n } from "../data";
import { siteLayout, processes, districtCenters, accountDistrict, arrangeLabels, type ProcessKey, type Rect, type LabelPosition } from "./layout";
import { buildProcessFacility } from "./processFacilities";
import { processState, commandObservation } from "../game-state";
import "./World.css";

export interface WorldHandle {
  zoom: (delta: number) => void; reset: () => void; rotate: () => void; focus: (id: string) => void;
  visitDistrict: (index: number) => void; focusProcess: (key: ProcessKey) => void;
}
interface Props {
  snapshot: Snapshot; selected: string | null; layer: Layer; reduced: boolean; stale: boolean;
  onSelect: (id: string) => void; onReady: () => void;
  onInspectProcess?: (key: ProcessKey) => void; activeProcess?: ProcessKey | null;
  commands?: Command[]; thumbnails?: string[];
  district?: number; onDistrictChange?: (index: number) => void; trayOpen?: boolean;
  safeTop?: number; safeBottom?: number;
}
function accountObservation(a: Account, commands: Command[] = []) {
  const command = commands.filter(c => String(c.payload.accountId ?? c.payload.account_id ?? "") === a.id)
    .sort((a,b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  return commandObservation(a, command);
}
function pending(a: Account, commands: Command[] = []) {
  const observation = accountObservation(a, commands);
  return !!(observation?.pending || observation?.tone === "unknown");
}
function AccountState({account,waiting,stale,commandIssue=false}:{account:Account;waiting:boolean;stale:boolean;commandIssue?:boolean}) {
  if(stale)return <Clock3 size={13}/>;
  if(account.status==="login_required"||!account.bound)return <LockKeyhole size={13}/>;
  if(["warning","danger"].includes(severity(account))||commandIssue)return <AlertTriangle size={13}/>;
  if(waiting)return <Clock3 size={13}/>;
  if(account.running)return <LoaderCircle size={13}/>;
  return <span className="account-state-dot"/>;
}
function disposeObject(object: THREE.Object3D) {
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  object.traverse(o=>{if(!(o instanceof THREE.Mesh))return;geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const value of Object.values(m))if(value instanceof THREE.Texture)textures.add(value);}});
  geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());
}
const modelFiles: Record<string,string> = {
  ...Object.fromEntries(Array.from({length:8},(_,i)=>["workshop"+i,"/assets/game-v2/building-"+String.fromCharCode(65+i)+".glb"])),
  generation:"/assets/game-v2/building-A.glb",review:"/assets/game-v2/building-B.glb",stock:"/assets/game-v2/building-F.glb",submission:"/assets/game-v2/building-H.glb",
  tree:"/assets/game-v2/tree-A-medium.glb",rock:"/assets/game-v2/tree-B-small.glb",bush:"/assets/game-v2/bush.glb",crate:"/assets/game-v2/crate.glb",pallet:"/assets/game-v2/pallet.glb",tower:"/assets/game-v2/watertower.glb",car:"/assets/game-v2/car-stationwagon.glb",road:"/assets/game-v2/road-straight.glb",junction:"/assets/game-v2/road-junction.glb",lamp:"/assets/game-v2/streetlight.glb",bench:"/assets/game-v2/bench.glb",
};
const World=forwardRef<WorldHandle,Props>(function World(props,ref){
  const host=useRef<HTMLDivElement>(null),propsRef=useRef(props),controller=useRef<WorldHandle|null>(null);
  const markers=useRef(new Map<string,HTMLButtonElement>());
  const [error,setError]=useState<string|null>(null),[loaded,setLoaded]=useState(false),[attempt,setAttempt]=useState(0),[missingModels,setMissingModels]=useState(0);
  propsRef.current=props;
  useImperativeHandle(ref,()=>({zoom:d=>controller.current?.zoom(d),reset:()=>controller.current?.reset(),rotate:()=>controller.current?.rotate(),focus:id=>controller.current?.focus(id),visitDistrict:i=>controller.current?.visitDistrict(i),focusProcess:key=>controller.current?.focusProcess(key)}),[]);
  useEffect(()=>{if(props.district!==undefined)controller.current?.visitDistrict(props.district);},[props.district]);
  useEffect(()=>{
    if(!host.current)return;
    const element=host.current;setLoaded(false);setError(null);setMissingModels(0);(window as unknown as {__bizWorld:unknown}).__bizWorld={ready:false};
    let disposed=false,lostContext=false,frame=0,dirty=true,ready=false,district=THREE.MathUtils.clamp(propsRef.current.district??0,0,3),lastState="",lastDraw=0,lastTime=performance.now(),totalFrames=0,renderMs=0;
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:"low-power"});}catch{setError("3D 화면을 시작하지 못했습니다.");propsRef.current.onReady();return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
    renderer.domElement.setAttribute("aria-label","13개 작업동의 섬. 한 손가락으로 이동하고 두 손가락으로 확대합니다.");renderer.domElement.setAttribute("role","img");element.prepend(renderer.domElement);
    const scene=new THREE.Scene();scene.background=new THREE.Color("#8ecbd7");scene.fog=new THREE.Fog("#9bd2dc",110,190);
    const camera=new THREE.OrthographicCamera(-20,20,40,-40,.1,250),direction=new THREE.Vector3(19,62,78);
    const controls=new OrbitControls(camera,element);controls.enableRotate=false;controls.enableDamping=true;controls.dampingFactor=.12;controls.screenSpacePanning=false;controls.minZoom=.7;controls.maxZoom=2.5;
    controls.mouseButtons={LEFT:THREE.MOUSE.PAN,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};controls.touches={ONE:THREE.TOUCH.PAN,TWO:THREE.TOUCH.DOLLY_PAN};
    controls.addEventListener("change",()=>{dirty=true;});
    let lastPick:unknown=null;
    let targetPosition:THREE.Vector3|null=null,targetZoom:number|null=null,following=true,safe:Rect={left:20,right:element.clientWidth-20,top:124,bottom:element.clientHeight-108};
    controls.addEventListener("start",()=>{targetPosition=null;targetZoom=null;following=false;});
    scene.add(new THREE.HemisphereLight("#dff5ff","#778d66",2.2));
    const sun=new THREE.DirectionalLight("#fff0d5",3.1);sun.position.set(-36,65,35);sun.castShadow=true;sun.shadow.mapSize.set(1536,1536);Object.assign(sun.shadow.camera,{left:-62,right:62,top:65,bottom:-65,near:1,far:160});sun.shadow.bias=-.00035;sun.shadow.normalBias=.06;scene.add(sun);
    const fill=new THREE.DirectionalLight("#b2e6ff",.7);fill.position.set(35,30,-35);scene.add(fill);
    const layout=siteLayout(element.clientWidth,element.clientHeight),materials=new Map<string,THREE.MeshStandardMaterial>();
    function mat(color:string){if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.87}));return materials.get(color)!;}
    const staticBoxes:THREE.Mesh[]=[],staticModels:THREE.Mesh[]=[],stockBatches:{mesh:THREE.InstancedMesh;sources:THREE.Mesh[];slots:THREE.Group[]}[]=[];
    function box(w:number,h:number,d:number,color:string,x:number,y:number,z:number,parent:THREE.Object3D=scene,radius=.12){const o=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(radius,h/2,w/2,d/2)),mat(color));o.position.set(x,y,z);o.castShadow=h>.4;o.receiveShadow=true;parent.add(o);staticBoxes.push(o);return o;}
    const water=new THREE.Mesh(new THREE.PlaneGeometry(400,400),new THREE.MeshStandardMaterial({color:"#76becd",roughness:.42,metalness:.05}));water.rotation.x=-Math.PI/2;water.position.y=-1.2;scene.add(water);
    // Each neighbourhood is one walkable island, tied together by four stone bridges.
    for(const [cx,cz] of districtCenters){
      box(29,1.6,32,"#c4ab7a",cx,-.62,cz+.5,scene,.8);
      box(28.4,.3,31.4,"#96b873",cx,.23,cz+.5,scene,.65);
      box(2.6,.08,29,"#d3c7a4",cx,.42,cz+.8,scene,.1);
      box(22,.08,2.4,"#d3c7a4",cx,.43,cz+5,scene,.1);
      for(const side of [-1,1])box(1.0,.12,27,"#b7cc8f",cx+side*1.75,.42,cz+.8,scene,.2);
    }
    for(const z of [-18,18]){box(5.1,.4,3.1,"#d5c7a8",0,.18,z+5);for(const side of [-1,1])box(5.3,.6,.22,"#ede0bf",0,.62,z+5+side*1.45);}
    for(const x of [-16,16]){box(3.1,.4,6,"#d5c7a8",x,.18,0);for(const side of [-1,1])box(.22,.6,6,"#ede0bf",x+side*1.45,.62,0);}
    const buildingGroup=new THREE.Group();scene.add(buildingGroup);
    const markerHeights=new Map<string,number>();
    const accountGroups=new Map<string,THREE.Group>(),processGroups=new Map<ProcessKey,THREE.Group>(),selections=new Map<string,THREE.Mesh>(),lights=new Map<string,THREE.Mesh>(),cargo=new Map<string,THREE.Group[]>(),activeObjects=new Map<string,THREE.Object3D>();
    const models=new Map<string,THREE.Group>(),abort=new AbortController(),loader=new GLTFLoader();
    async function load(name:string,path:string){const response=await fetch(path,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(18000)])});if(!response.ok)throw new Error(`Model HTTP ${response.status}: ${name}`);const gltf=await loader.parseAsync(await response.arrayBuffer(),path.slice(0,path.lastIndexOf("/")+1));if(disposed){disposeObject(gltf.scene);return;}models.set(name,gltf.scene);}
    function model(name:string,parent:THREE.Object3D,w:number,d:number,h=6){const source=models.get(name);if(!source)return null;const o=source.clone(true),bounds=new THREE.Box3().setFromObject(o),size=bounds.getSize(new THREE.Vector3()),s=Math.min(w/Math.max(size.x,.01),d/Math.max(size.z,.01),h/Math.max(size.y,.01));o.scale.setScalar(s);const b=new THREE.Box3().setFromObject(o),center=b.getCenter(new THREE.Vector3());o.position.set(-center.x,.48-b.min.y,-center.z);o.traverse(child=>{if(child instanceof THREE.Mesh){child.castShadow=true;child.receiveShadow=true;}});parent.add(o);return o;}
    function atModel(name:string,x:number,z:number,w:number,d:number,h:number,parent:THREE.Object3D=scene){const anchor=new THREE.Group();anchor.position.set(x,0,z);parent.add(anchor);const placed=model(name,anchor,w,d,h);placed?.traverse(o=>{if(o instanceof THREE.Mesh)staticModels.push(o);});return placed;}
    function signal(group:THREE.Group,key:string){const pole=box(.09,1.8,.09,"#63766f",3.4,1.3,2.2,group,.015);pole.castShadow=false;const o=new THREE.Mesh(new THREE.SphereGeometry(.28,10,7),new THREE.MeshStandardMaterial({color:"#84938d",emissive:"#84938d",emissiveIntensity:.18}));o.position.set(3.4,2.3,2.2);group.add(o);lights.set(key,o);}
    function ring(group:THREE.Group,key:string,radius:number){const o=new THREE.Mesh(new THREE.RingGeometry(radius-.13,radius,40),new THREE.MeshBasicMaterial({color:"#ffe191",side:THREE.DoubleSide,transparent:true,opacity:.9}));o.rotation.x=-Math.PI/2;o.position.y=.51;o.visible=false;group.add(o);selections.set(key,o);}
    function makeCargo(group:THREE.Group,key:string){const slots:THREE.Group[]=[];for(let i=0;i<6;i++){const slot=new THREE.Group();slot.position.set(-2.4+(i%3)*.86,0,2.35+Math.floor(i/3)*.77);group.add(slot);model("crate",slot,.69,.63,.65);slots.push(slot);}cargo.set(key,slots);}
    function build(){
      for(const a of propsRef.current.snapshot.accounts){const p=layout.plots[a.number-1];if(!p)continue;const group=new THREE.Group();group.position.set(...[p[0],0,p[1]] as [number,number,number]);buildingGroup.add(group);accountGroups.set(a.id,group);const o=model("workshop"+([2,3,0,1,4,5,0,6,7,1,4,6,0][a.number-1]??0),group,6.8,5.9,7.2);if(o){o.position.z-=.7;o.traverse(child=>{if(child instanceof THREE.Mesh)child.userData.buildingSurface=true;});markerHeights.set(a.id,new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).y+1.0);}ring(group,a.id,4.15);signal(group,a.id);makeCargo(group,a.id);group.traverse(o=>{o.userData.accountId=a.id;o.userData.district=accountDistrict(a.number);});const hit=new THREE.Mesh(new THREE.BoxGeometry(7.2,8,6.8),new THREE.MeshBasicMaterial({visible:false}));hit.position.y=4.4;hit.userData.hitTarget=true;hit.userData.accountId=a.id;hit.userData.district=accountDistrict(a.number);group.add(hit);}
      processes.forEach((p,i)=>{const group=new THREE.Group();group.position.set(layout.facilities[i][0],0,layout.facilities[i][1]);buildingGroup.add(group);processGroups.set(p.key,group);const height=buildProcessFacility({key:p.key,group,model,atModel,box});markerHeights.set("process-"+p.key,height+1.0);
        ring(group,p.key,4.8);signal(group,p.key);if(p.key==="stock")makeCargo(group,"stock");const accent=new THREE.Mesh(new THREE.TorusGeometry(.42,.065,6,24),mat("#ffe191"));accent.rotation.x=-Math.PI/2;accent.position.set(-3.4,.62,2.2);group.add(accent);activeObjects.set(p.key,accent);group.traverse(o=>{o.userData.process=p.key;o.userData.district=i;});const hit=new THREE.Mesh(new THREE.BoxGeometry(8,8.5,6.6),new THREE.MeshBasicMaterial({visible:false}));hit.position.y=4.7;hit.userData.hitTarget=true;hit.userData.process=p.key;hit.userData.district=i;group.add(hit);});
      // Repeated landscaping uses a single authored kit and does not imply business activity.
      for(let di=0;di<districtCenters.length;di++){const [cx,cz]=districtCenters[di];
        for(let z=-11;z<=13;z+=4)atModel(z===5?"junction":"road",cx,cz+z,4,4,.3);
        for(const x of [-8,-4,4,8]){const road=atModel("road",cx+x,cz+5,4,4,.3);if(road)road.rotation.y=Math.PI/2;}
        for(const [x,z,s] of [[-11,-11,3],[11,-10,2.7],[-11,1,2.1],[11,6,2.9],[-11,13,2.5],[10,14,2.5],[-5,14,1.8],[5,-13,1.9]])atModel("tree",cx+x,cz+z,s,s,s*1.5);for(const [x,z]of[[-10,-5],[10,-3],[-10,8]])atModel("rock",cx+x,cz+z,1.7,1.5,1.2);for(const [x,z]of[[-10,11],[10,11]])atModel("bush",cx+x,cz+z,1.7,1.4,1.3);}
      // Merge authored scenery and repeated cargo instead of paying one draw call per prop.
      scene.updateMatrixWorld(true);
      for(const material of new Set(staticBoxes.map(o=>o.material as THREE.Material))){const sources=staticBoxes.filter(o=>o.material===material),parts=sources.map(o=>(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()).applyMatrix4(o.matrixWorld)),geometry=mergeGeometries(parts,false);if(geometry){const merged=new THREE.Mesh(geometry,material);merged.receiveShadow=true;merged.castShadow=true;scene.add(merged);sources.forEach(o=>{o.removeFromParent();o.geometry.dispose();});}parts.forEach(p=>p.dispose());}
      const scenery=new Map<string,THREE.Mesh[]>();for(const o of staticModels){const key=o.geometry.uuid+String(Array.isArray(o.material)?o.material.map(m=>m.uuid):o.material.uuid);scenery.set(key,[...(scenery.get(key)||[]),o]);}
      for(const sources of scenery.values()){const first=sources[0],batch=new THREE.InstancedMesh(first.geometry,first.material,sources.length);batch.castShadow=true;batch.receiveShadow=true;sources.forEach((o,i)=>{batch.setMatrixAt(i,o.matrixWorld);o.visible=false;});scene.add(batch);}
      const stock=new Map<string,{sources:THREE.Mesh[];slots:THREE.Group[]}>();for(const slots of cargo.values())for(const slot of slots)slot.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const key=o.geometry.uuid+String(Array.isArray(o.material)?o.material.map(m=>m.uuid):o.material.uuid),batch=stock.get(key)||{sources:[],slots:[]};batch.sources.push(o);batch.slots.push(slot);stock.set(key,batch);});
      for(const batch of stock.values()){const first=batch.sources[0],mesh=new THREE.InstancedMesh(first.geometry,first.material,batch.sources.length);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;scene.add(mesh);batch.sources.forEach(o=>{o.visible=false;});stockBatches.push({mesh,...batch});}
      renderer.shadowMap.needsUpdate=true;ready=true;dirty=true;setLoaded(true);setMissingModels(Object.keys(modelFiles).filter(n=>!models.has(n)).length);propsRef.current.onReady();fit(true);restoreFocus();
    }
    Promise.allSettled(Object.entries(modelFiles).map(([name,path])=>load(name,path))).then(()=>{if(!disposed)build();});
    function readSafe(){const p=propsRef.current,w=element.clientWidth,h=element.clientHeight,mobile=w<768;const top=w>h&&h<500?72:p.safeTop??(mobile?124:112),bottom=p.trayOpen&&mobile?Math.max(220,p.safeBottom??108):p.safeBottom??108;safe={left:20,right:w-20,top:Math.max(0,top),bottom:Math.max(top+64,h-bottom)};}
    function districtTarget(){const [x,z]=districtCenters[district];return new THREE.Vector3(x,0,z+1.0);}
    function fit(resetAngle=false){readSafe();const w=element.clientWidth,h=element.clientHeight,target=districtTarget(),dir=resetAngle?direction.clone():camera.position.clone().sub(controls.target).normalize().multiplyScalar(direction.length());camera.position.copy(target).add(dir);camera.lookAt(target);camera.updateMatrixWorld(true);const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1),corners:THREE.Vector3[]=[];const [cx,cz]=districtCenters[district];for(const x of [cx-13,cx+13])for(const z of [cz-15,cz+15])for(const y of [0,9])corners.push(new THREE.Vector3(x,y,z));const xs=corners.map(p=>p.clone().sub(target).dot(right)),ys=corners.map(p=>p.clone().sub(target).dot(up));const minY=Math.min(...ys),maxY=Math.max(...ys),units=Math.max((Math.max(...xs)-Math.min(...xs))/Math.max(120,safe.right-safe.left),(maxY-minY)/Math.max(120,safe.bottom-safe.top-52));camera.left=-w*units/2;camera.right=w*units/2;camera.top=h*units/2;camera.bottom=-h*units/2;const safeCY=(safe.top+safe.bottom)/2;const shift=up.multiplyScalar((minY+maxY)/2+(safeCY-h/2)*units);controls.target.copy(target).add(shift);camera.position.copy(controls.target).add(dir);camera.zoom=1;camera.updateProjectionMatrix();controls.update();camera.updateMatrixWorld(true);targetPosition=null;targetZoom=null;following=true;dirty=true;}
    function visit(index:number){const next=THREE.MathUtils.clamp(Math.round(index),0,3);if(next===district&&ready)return;district=next;fit(true);propsRef.current.onDistrictChange?.(district);}
    function focusPosition(position:readonly[number,number]) {
      readSafe();
      const availableHeight=safe.bottom-safe.top,compact=availableHeight<260;
      // In a compressed viewport the roof marker, rather than the ground, owns the focus.
      // The default camera remains identical when the normal game area is available.
      const account=propsRef.current.snapshot.accounts.find(a=>layout.plots[a.number-1]===position);
      const processIndex=layout.facilities.findIndex(p=>p===position);
      const key=account?.id||(processIndex>=0?"process-"+processes[processIndex].key:"");
      const zoom=compact?THREE.MathUtils.clamp(availableHeight/240,.85,1.1):1.42;
      const up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);
      const units=(camera.top-camera.bottom)/Math.max(1,element.clientHeight)/zoom;
      const shift=up.multiplyScalar(((safe.top+safe.bottom)/2-element.clientHeight/2)*units);
      targetPosition=new THREE.Vector3(position[0],compact?(markerHeights.get(key)??6):1.6,position[1]-(compact?.7:0)).add(shift);
      targetZoom=zoom;following=false;dirty=true;
    }
    controller.current={zoom:delta=>{targetZoom=THREE.MathUtils.clamp((targetZoom??camera.zoom)*(delta>0?1.2:1/1.2),.7,2.5);following=false;dirty=true;},reset:()=>fit(true),rotate:()=>fit(true),visitDistrict:visit,focus:id=>{const a=propsRef.current.snapshot.accounts.find(a=>a.id===id);if(!a)return;const di=accountDistrict(a.number);if(di!==district){district=di;propsRef.current.onDistrictChange?.(di);fit(true);}focusPosition(layout.plots[a.number-1]);},focusProcess:key=>{const i=processes.findIndex(p=>p.key===key);if(i<0)return;if(i!==district){district=i;propsRef.current.onDistrictChange?.(i);fit(true);}focusPosition(layout.facilities[i]);}};
    const pointers=new Set<number>();let gesture:{id:number;x:number;y:number;account:string|null;process:ProcessKey|null;cancelled:boolean}|null=null;
    function down(e:PointerEvent){if(lostContext)return;pointers.add(e.pointerId);if(pointers.size>1){if(gesture)gesture.cancelled=true;return;}const candidate=(e.target as Element).closest<HTMLButtonElement>("[data-account],[data-process]"),bounds=candidate?.getBoundingClientRect(),label=candidate&&bounds&&e.clientX>=bounds.left&&e.clientX<=bounds.right&&e.clientY>=bounds.top&&e.clientY<=bounds.bottom?candidate:null;if(!candidate&&(e.target as Element).closest("button")){e.stopPropagation();gesture=null;pointers.delete(e.pointerId);return;}gesture={id:e.pointerId,x:e.clientX,y:e.clientY,account:label?.dataset.account||null,process:label?.dataset.process as ProcessKey||null,cancelled:e.button!==0||!e.isPrimary};}
    function move(e:PointerEvent){if(gesture&&Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>7)gesture.cancelled=true;}
    function up(e:PointerEvent){const tap=gesture&&gesture.id===e.pointerId&&!gesture.cancelled&&pointers.size===1&&Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)<=7;pointers.delete(e.pointerId);if(!tap||!gesture||lostContext){if(!pointers.size)gesture=null;return;}const g=gesture;gesture=null;if(g.account){propsRef.current.onSelect(g.account);return;}if(g.process){propsRef.current.onInspectProcess?.(g.process);return;}camera.updateMatrixWorld(true);scene.updateMatrixWorld(true);const rect=element.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);const intersections=ray.intersectObject(buildingGroup,true);lastPick={x:e.clientX,y:e.clientY,hits:intersections.slice(0,8).map(h=>({distance:h.distance,point:h.point.toArray(),account:h.object.userData.accountId,process:h.object.userData.process,visible:h.object.visible,name:h.object.name}))};const hit=intersections.find(h=>h.object.userData.buildingSurface&&h.object.visible&&h.object.userData.district===district)||intersections.find(h=>h.object.userData.hitTarget&&h.object.userData.district===district);if(hit?.object.userData.accountId)propsRef.current.onSelect(hit.object.userData.accountId);else if(hit?.object.userData.process)propsRef.current.onInspectProcess?.(hit.object.userData.process);else if(propsRef.current.selected||propsRef.current.activeProcess){propsRef.current.onSelect("");fit(true);}}
    function cancel(e:PointerEvent){pointers.delete(e.pointerId);if(gesture)gesture.cancelled=true;if(!pointers.size)gesture=null;}
    element.addEventListener("pointerdown",down,true);element.addEventListener("pointermove",move,true);element.addEventListener("pointerup",up,true);element.addEventListener("pointercancel",cancel,true);
    function lost(e:Event){e.preventDefault();lostContext=true;controls.enabled=false;cancelAnimationFrame(frame);setError("3D 화면 연결이 끊겼습니다.");(window as unknown as {__bizWorld:unknown}).__bizWorld={ready:false,lostContext:true};propsRef.current.onReady();}
    function restored(){if(!disposed)setAttempt(v=>v+1);}
    renderer.domElement.addEventListener("webglcontextlost",lost);renderer.domElement.addEventListener("webglcontextrestored",restored);
    function projectLabels(){const nodes:LabelPosition[]=[],width=element.clientWidth,height=element.clientHeight;for(const [key,marker]of markers.current){const account=propsRef.current.snapshot.accounts.find(a=>a.id===key),processIndex=processes.findIndex(p=>"process-"+p.key===key),di=account?accountDistrict(account.number):processIndex;const p=account?layout.plots[account.number-1]:layout.facilities[processIndex];if(di!==district||!p){marker.style.visibility="hidden";marker.tabIndex=-1;continue;}const v=new THREE.Vector3(p[0],markerHeights.get(key)??6,p[1]-.7).project(camera),x=(v.x*.5+.5)*width,y=(-v.y*.5+.5)*height,visible=x>safe.left+24&&x<safe.right-24&&y>safe.top+24&&y<safe.bottom-24;marker.style.visibility=visible?"visible":"hidden";marker.tabIndex=visible?0:-1;marker.dataset.anchorX=x.toFixed(2);marker.dataset.anchorY=y.toFixed(2);if(visible)nodes.push({id:key,x,y,width:marker.offsetWidth,height:marker.offsetHeight});}for(const p of arrangeLabels(nodes,safe)){const marker=markers.current.get(p.id);if(marker)marker.style.transform=`translate(${p.x}px,${p.y}px) translate(-50%,-50%)`;}}
    function render(now:number){if(disposed||lostContext)return;frame=requestAnimationFrame(render);if(document.hidden||now-lastDraw<1000/30)return;const dt=Math.min((now-lastTime)/1000,.1);lastTime=now;const p=propsRef.current;const state=[p.snapshot.observedAt,p.selected,p.activeProcess,p.layer,p.stale,p.trayOpen,p.safeTop,p.safeBottom,(p.commands||[]).map(c=>c.id+c.status).join()].join("|");if(state!==lastState){const previous=lastState.split("|");lastState=state;dirty=true;renderer.shadowMap.needsUpdate=true;readSafe();if(previous[5]!==String(p.trayOpen)||previous[6]!==String(p.safeTop)||previous[7]!==String(p.safeBottom)){if(p.selected){const a=p.snapshot.accounts.find(a=>a.id===p.selected);if(a)focusPosition(layout.plots[a.number-1]);}else if(p.activeProcess)focusPosition(layout.facilities[processes.findIndex(pr=>pr.key===p.activeProcess)]);else if(following)fit();}}
      if(targetPosition){const delta=targetPosition.clone().sub(controls.target),alpha=p.reduced?1:1-Math.exp(-11*dt);if(delta.length()<.01){camera.position.add(delta);controls.target.copy(targetPosition);targetPosition=null;}else{delta.multiplyScalar(alpha);controls.target.add(delta);camera.position.add(delta);}dirty=true;}
      if(targetZoom!==null){camera.zoom=THREE.MathUtils.lerp(camera.zoom,targetZoom,p.reduced?1:1-Math.exp(-11*dt));if(Math.abs(camera.zoom-targetZoom)<.001){camera.zoom=targetZoom;targetZoom=null;}camera.updateProjectionMatrix();dirty=true;}controls.update();const [cx,cz]=districtCenters[district];const boundedX=THREE.MathUtils.clamp(controls.target.x,cx-14,cx+14),boundedZ=THREE.MathUtils.clamp(controls.target.z,cz-21,cz+23);if(boundedX!==controls.target.x||boundedZ!==controls.target.z){const delta=new THREE.Vector3(boundedX-controls.target.x,0,boundedZ-controls.target.z);controls.target.add(delta);camera.position.add(delta);dirty=true;}
      for(const a of p.snapshot.accounts){const light=lights.get(a.id);if(light){const material=light.material as THREE.MeshStandardMaterial;if(a.running&&!p.stale&&!p.reduced){material.emissiveIntensity=.35+Math.sin(now/450)*.18;dirty=true;}else material.emissiveIntensity=.18;}}
      for(const[key,o]of activeObjects){const active=processState(key as ProcessKey,p.snapshot,p.stale).active;o.visible=active;if(active&&!p.reduced){o.rotation.z+=dt*1.8;dirty=true;}}
      if(dirty&&ready){for(const a of p.snapshot.accounts){const selected=selections.get(a.id);if(selected)selected.visible=a.id===p.selected;const observation=accountObservation(a,p.commands),condition=p.stale?"unknown":["warning","danger"].includes(severity(a))?severity(a):observation?.tone==="danger"?"danger":observation?.tone==="unknown"?"unknown":severity(a),color=condition==="active"?"#76d6b3":["warning","danger"].includes(condition)?"#ef9c68":"#87968f",light=lights.get(a.id);if(light){const m=light.material as THREE.MeshStandardMaterial;m.color.set(color);m.emissive.set(color);}const ratio=a.target>0?Math.max(0,a.ready/a.target):0;cargo.get(a.id)?.forEach((slot,i)=>{slot.visible=ratio>i/6;slot.scale.y=Math.max(.2,Math.min(1,ratio*6-i));});}for(const[key,group]of processGroups){const selected=selections.get(key);if(selected)selected.visible=key===p.activeProcess;const ps=processState(key,p.snapshot,p.stale),light=lights.get(key);if(light){const m=light.material as THREE.MeshStandardMaterial;const color=ps.active?"#76d6b3":ps.tone==="warning"?"#ef9c68":"#87968f";m.color.set(color);m.emissive.set(color);}group.userData.active=ps.active;}const totalReady=p.snapshot.accounts.reduce((v,a)=>v+a.ready,0),totalTarget=p.snapshot.accounts.reduce((v,a)=>v+a.target,0);cargo.get("stock")?.forEach((slot,i)=>{slot.visible=totalTarget>0&&totalReady/totalTarget>i/6;});scene.updateMatrixWorld(true);const hidden=new THREE.Matrix4().makeScale(0,0,0);for(const batch of stockBatches){batch.sources.forEach((source,i)=>batch.mesh.setMatrixAt(i,batch.slots[i].visible?source.matrixWorld:hidden));batch.mesh.instanceMatrix.needsUpdate=true;}camera.updateMatrixWorld(true);projectLabels();const start=performance.now();renderer.render(scene,camera);renderMs=performance.now()-start;totalFrames++;lastDraw=now;dirty=false;}
      (window as unknown as{__bizWorld:unknown}).__bizWorld={ready,totalFrames,renderMs,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,loaded:models.size,modelFailures:Object.keys(modelFiles).filter(n=>!models.has(n)),district,lastPick,rotationLocked:true,safe,zoom:camera.zoom,layoutColumns:2,visibleAccounts:p.snapshot.accounts.filter(a=>accountDistrict(a.number)===district).map(a=>a.id),cargo:p.snapshot.accounts.map(a=>({id:a.id,ready:a.ready,target:a.target,visible:cargo.get(a.id)?.filter(o=>o.visible).length||0})),processes:[...processGroups].map(([key,g])=>({key,role:g.userData.role,active:g.userData.active})),camera:{target:controls.target.toArray(),matrixWorld:camera.matrixWorld.toArray(),projection:camera.projectionMatrix.toArray()},appearance:{background:"#8ecbd7",ground:"#96b873",water:"#76becd"}};
    }
    function restoreFocus(){const p=propsRef.current;if(p.selected)controller.current?.focus(p.selected);else if(p.activeProcess)controller.current?.focusProcess(p.activeProcess);}
    function resize(){const w=element.clientWidth,h=element.clientHeight;if(!w||!h)return;renderer.setSize(w,h);readSafe();fit();restoreFocus();}
    const observer=new ResizeObserver(resize);observer.observe(element);resize();frame=requestAnimationFrame(render);
    return()=>{disposed=true;abort.abort();cancelAnimationFrame(frame);observer.disconnect();controls.dispose();for(const[name,fn]of[["pointerdown",down],["pointermove",move],["pointerup",up],["pointercancel",cancel]] as const)element.removeEventListener(name,fn,true);renderer.domElement.removeEventListener("webglcontextlost",lost);renderer.domElement.removeEventListener("webglcontextrestored",restored);disposeObject(scene);models.forEach(disposeObject);materials.forEach(m=>m.dispose());renderer.dispose();renderer.domElement.remove();controller.current=null;};
  },[attempt]);
  function bindMarker(id:string,el:HTMLButtonElement|null){if(el)markers.current.set(id,el);else markers.current.delete(id);}
  const icons={generation:Factory,review:ScanLine,stock:Package,submission:Truck};
  return <div ref={host} data-layer={props.layer} data-district={props.district??0} className={`world business-world game-world ${error?"world-failed":""} ${props.reduced?"reduced":""}`}>
    {loaded&&!error&&missingModels>0&&<button className="world-model-retry" onPointerDown={e=>e.stopPropagation()} onClick={()=>setAttempt(v=>v+1)}><RotateCcw size={16}/>모형 {missingModels}개 다시 받기</button>}
    {!loaded&&!error&&<div className="world-loading"><span className="loader"/><span>작업섬으로 이동 중</span></div>}
    {error?<div className="world-fallback"><h2>작업동</h2><p>{error}</p><button className="world-retry" onClick={()=>setAttempt(v=>v+1)}><RotateCcw size={16}/>3D 다시 연결</button><div className="fallback-plots">{props.snapshot.accounts.map(a=><button key={a.id} onClick={()=>props.onSelect(a.id)}><AccountState account={a} waiting={pending(a,props.commands)} stale={props.stale}/><b>{a.number}</b><span>{accountLabel(a)}</span><strong>{n(a.ready)}</strong></button>)}{processes.map(p=><button key={p.key} onClick={()=>props.onInspectProcess?.(p.key)}>{p.name}</button>)}</div></div>:<div className="world-markers">{props.snapshot.accounts.map(a=>{const waiting=pending(a,props.commands),observation=accountObservation(a,props.commands);return <button key={a.id} ref={el=>bindMarker(a.id,el)} data-account={a.id} className={`plot-label ${props.selected===a.id?"selected":""} ${props.stale?"unknown":["warning","danger"].includes(severity(a))?severity(a):observation?.tone==="danger"?"danger":waiting?"unknown":severity(a)} ${waiting?"has-command":""}`} onClick={e=>{if(e.detail===0)props.onSelect(a.id);}} aria-label={`${accountLabel(a)}, ${props.stale?"상태 확인 필요":["warning","danger"].includes(severity(a))?status(a)+(observation?" · "+observation.label:""):observation?.label||status(a)}, 제출 가능 ${a.ready}개, 목표 ${a.target}개`}><span className="account-marker-top"><b className="account-number">{a.number}</b><AccountState account={a} waiting={waiting} stale={props.stale} commandIssue={observation?.tone==="danger"}/></span><span className="account-alias">{accountLabel(a)}</span>{props.layer!=="status"&&<b className="account-layer-value">{n(props.layer==="stock"?a.ready:a.counts.submitted||0)}</b>}</button>;})}{processes.map(p=>{const state=processState(p.key,props.snapshot,props.stale),Icon=icons[p.key];return <button key={p.key} ref={el=>bindMarker("process-"+p.key,el)} data-process={p.key} className={`process-label ${state.tone} ${props.activeProcess===p.key?"selected":""}`} onClick={e=>{if(e.detail===0)props.onInspectProcess?.(p.key);}} aria-label={`${p.name}, ${state.label}`}><Icon size={17}/><strong>{p.name}</strong>{state.active?<LoaderCircle size={14}/>:state.tone==="unknown"?<Clock3 size={14}/>:null}</button>;})}</div>}
  </div>;
});
export default World;
