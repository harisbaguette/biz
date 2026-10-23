// 미리캔버스 운영용 자체 제작 소품. 외부 모형을 바꾸어 이름만 붙이지 않는다.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { writeFile, mkdir } from 'node:fs/promises';

// GLTFExporter의 Blob 변환만 제공한다. 브라우저/사용자 데스크톱에 접근하지 않는다.
globalThis.FileReader=class { readAsArrayBuffer(blob){blob.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();});} };
const out='public/assets/workshop';await mkdir(out,{recursive:true});
const palette={ivory:'#fff3da',paper:'#fffdf5',edge:'#d9cbb3',teal:'#163e46',metal:'#36555c',coral:'#e76e56',gold:'#e4b65c',ink:'#4c5e60'};
const mats=Object.fromEntries(Object.entries(palette).map(([key,color])=>[key,new THREE.MeshStandardMaterial({name:key,color,roughness:key==='gold'?.46:.79,metalness:key==='gold'?.32:0})]));
const groups={};
function mesh(g,geom,mat,name,pos=[0,0,0],rot=[0,0,0]){const m=new THREE.Mesh(geom,typeof mat==='string'?mats[mat]:mat);m.name=name;m.position.set(...pos);m.rotation.set(...rot);g.add(m);return m;}
function box(g,name,size,pos,mat='ivory',radius=.025,rot=[0,0,0]){return mesh(g,new RoundedBoxGeometry(...size,1,Math.min(radius,...size.map(v=>v*.45))),mat,name,pos,rot);}
function cyl(g,name,radius,depth,pos,mat='ivory',rot=[Math.PI/2,0,0],segments=32){return mesh(g,new THREE.CylinderGeometry(radius,radius,depth,segments),mat,name,pos,rot);}
function shape(g,name,pts,depth,pos,mat='ivory',rot=[0,0,0]){const s=new THREE.Shape();pts.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();return mesh(g,new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.006,bevelThickness:.006}),mat,name,pos,rot);}
function artMaterial(){return new THREE.MeshStandardMaterial({name:'artwork-surface',color:palette.paper,roughness:.92,side:THREE.DoubleSide});}
function artPlane(g,width,height,pos,rot){return mesh(g,new THREE.PlaneGeometry(width,height),artMaterial(),'artwork-surface',pos,rot);}
function finish(id,g,role,face,extra={}){g.name=id;g.userData={role,face,source:'BLUEKITE WORKS original',...extra};groups[id]=g;}

// 한 장 한 장의 벌어진 모서리와 종이 단면이 보이는 인쇄물 묶음.
{
 const g=new THREE.Group();
 const sheets=[[-.035,-.015,-.035],[.028,.005,.025],[-.015,.02,-.015],[.018,-.01,.018],[-.01,.015,-.025],[0,0,0]];
 sheets.forEach(([x,z,angle],i)=>box(g,'paper-'+i,[1.7,.035,1.26],[x,.018+i*.041,z],i%2?'paper':'ivory',.012,[0,angle,0]));
 // 얇은 상단 프린트면은 실제 계정의 썸네일로 바꿀 수 있다.
 artPlane(g,1.43,1.04,[0,.244,0],[-Math.PI/2,0,0]);
 // 낱장 분리가 읽히는 살짝 들린 앞 귀퉁이. 그림을 가리지 않는다.
 shape(g,'curled-paper-corner',[[0,0],[.20,0],[0,.20]],.012,[.62,.253,.46],'paper',[-Math.PI/2,0,.12]);
 box(g,'coral-index-tab',[.27,.027,.15],[.56,.184,.66],'coral',.015);
 // 황동 바인더 클립이 뒤쪽 세 장만 잡는다.
 box(g,'binder-jaw',[.29,.10,.16],[-.50,.25,-.59],'teal',.025);
 mesh(g,new THREE.TorusGeometry(.075,.013,6,14,Math.PI*1.75),'gold','binder-loop',[-.50,.32,-.59],[Math.PI/2,0,0]);
 finish('print-stack',g,'출고 대기 작품 프린트','+Y',{artworkMesh:'artwork-surface',artworkSize:[1.43,1.04]});
}
// 서류봉투의 접힌 삼각 덮개·봉인 띠가 큰 크기로 읽히는 제출 묶음.
{
 const g=new THREE.Group();
 for(let i=0;i<3;i++)box(g,'folio-sheet-'+i,[1.68,.045,1.20],[i===1?.035:0,.025+i*.052,i===1?-.018:0],i===2?'ivory':'paper',.025,[0,i===1?.03:0,0]);
 // 덮개가 V자 봉투 실루엣을 만든다.
 shape(g,'envelope-flap',[[-.80,.56],[.80,.56],[0,-.05]],.022,[0,.183,0],'ivory',[-Math.PI/2,0,0]);
 box(g,'seal-ribbon',[.22,.018,1.22],[.42,.215,0],'coral',.008);
 cyl(g,'wax-seal',.125,.035,[0,.230,-.02],'coral',[0,0,0],24);
 cyl(g,'wax-seal-inset',.078,.039,[0,.232,-.02],'gold',[0,0,0],20);
 box(g,'address-window',[.40,.014,.22],[-.47,.208,.33],'paper',.012);
 box(g,'dispatch-tab',[.28,.03,.16],[-.60,.13,.66],'gold',.015);
 finish('submission-folio',g,'봉인된 제출 작품 묶음','+Y');
}
// 완료와 혼동하는 체크 없이 시간만 표시하는 실제 탁상시계.
{
 const g=new THREE.Group();
 box(g,'left-foot',[.25,.15,.33],[-.30,.075,0],'teal',.05,[0,0,-.12]);
 box(g,'right-foot',[.25,.15,.33],[.30,.075,0],'teal',.05,[0,0,.12]);
 cyl(g,'clock-case',.49,.29,[0,.63,0],'teal');
 cyl(g,'clock-brass-rim',.432,.036,[0,.63,.162],'gold');
 cyl(g,'clock-face',.393,.038,[0,.63,.184],'paper');
 for(let i=0;i<12;i++){const a=i*Math.PI/6;box(g,'clock-tick-'+i,[i%3===0?.035:.023,i%3===0?.080:.043,.015],[Math.sin(a)*.335,.63+Math.cos(a)*.335,.212],'ink',.006,[0,0,-a]);}
 const hour=new THREE.Group();hour.name='hour-hand';hour.position.set(0,.63,.235);g.add(hour);box(hour,'hour-pointer',[.052,.23,.025],[0,.085,0],'teal',.016);hour.rotation.z=.72;
 const minute=new THREE.Group();minute.name='minute-hand';minute.position.set(0,.63,.258);g.add(minute);box(minute,'minute-pointer',[.034,.33,.025],[0,.13,0],'coral',.012);minute.rotation.z=-.80;
 cyl(g,'hand-pin',.045,.037,[0,.63,.283],'gold');
 box(g,'winding-crown',[.16,.075,.14],[0,1.145,0],'gold',.025);
 finish('review-clock',g,'심사 대기 시계','+Z',{hourHand:'hour-hand',minuteHand:'minute-hand',timeIsIllustrative:true});
}
// 공개 작품은 서류/상자와 다르게 직립 전시한다. 실제 작품 그림을 채우는 면을 분리한다.
{
 const g=new THREE.Group();
 box(g,'gallery-plinth',[1.38,.115,.52],[0,.058,0],'teal',.045);
 const frame=new THREE.Group();frame.name='frame-body';frame.position.y=.13;frame.rotation.x=-.12;g.add(frame);
 box(frame,'frame-backing',[1.24,1.45,.09],[0,.74,0],'teal',.045);
 box(frame,'frame-left',[.105,1.49,.12],[-.59,.74,.075],'ivory',.025);
 box(frame,'frame-right',[.105,1.49,.12],[.59,.74,.075],'ivory',.025);
 box(frame,'frame-top',[1.26,.105,.12],[0,1.43,.075],'ivory',.025);
 box(frame,'frame-bottom',[1.26,.105,.12],[0,.045,.075],'ivory',.025);
 box(frame,'mount-board',[1.075,1.27,.025],[0,.74,.075],'paper',.008);
 artPlane(frame,.91,1.10,[0,.74,.092],[0,0,0]);
 box(frame,'corner-inlay',[.22,.045,.026],[.45,.063,.15],'coral',.010);
 // 중앙 받침과 뒤 지지대가 비스듬한 액자를 물리적으로 지탱한다.
 box(g,'rear-stand',[.18,1.05,.09],[0,.56,-.17],'metal',.02,[-.25,0,0]);
 finish('gallery-frame',g,'공개된 작품 전시 프레임','+Z',{artworkMesh:'artwork-surface',artworkSize:[.91,1.10]});
}
const models=[];
for(const [id,g] of Object.entries(groups)){
 g.updateMatrixWorld(true);let b=new THREE.Box3().setFromObject(g);const c=b.getCenter(new THREE.Vector3());g.position.set(-c.x,-b.min.y,-c.z);g.updateMatrixWorld(true);b=new THREE.Box3().setFromObject(g);
 const bytes=await new GLTFExporter().parseAsync(g,{binary:true});await writeFile(out+'/'+id+'.glb',Buffer.from(bytes));
 let triangles=0,meshes=0;g.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
 models.push({id,url:'/assets/workshop/'+id+'.glb',role:g.userData.role,face:g.userData.face,size:b.getSize(new THREE.Vector3()).toArray().map(n=>+n.toFixed(5)),bytes:bytes.byteLength,triangles,meshes,artworkMesh:g.userData.artworkMesh??null,artworkSize:g.userData.artworkSize??null});
}
await writeFile(out+'/manifest.json',JSON.stringify({source:'BLUEKITE WORKS original',license:'프로젝트 자체 제작',axes:'+Y up, XZ centered, Y grounded',models},null,2)+'\n');
await writeFile(out+'/SOURCE.txt','BLUEKITE WORKS 프로젝트 전용 자체 제작 3D 소품.\n제작 코드: scripts/pack-workshop-assets.mjs\n외부 3D 모형·이미지·텍스처를 포함하지 않음.\n시계 기본 바늘은 예시이며 업무 완료 시각을 보증하지 않음.\nartwork-surface는 운영 시 해당 계정의 실제 썸네일로 교체함.\n');
console.log(JSON.stringify({models:models.length,bytes:models.reduce((s,m)=>s+m.bytes,0),triangles:models.reduce((s,m)=>s+m.triangles,0),details:models}));
