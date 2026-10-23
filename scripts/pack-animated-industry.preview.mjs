import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from '@playwright/test';
const root=resolve('.'),out=resolve('artifacts/animated-industry');await mkdir(out,{recursive:true});
const html=`<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#d9e5e8;color:#203b40;font:600 16px system-ui}#grid{display:grid;grid-template-columns:repeat(5,1fr)}.cell{height:300px;position:relative;border:1px solid #bccdd1}.cell img{width:100%;height:265px;object-fit:contain}.cell label{display:block;text-align:center}</style>
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script><div id="grid"></div>
<script type="module">
import * as T from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
window.audit=[];const renderer=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.setSize(320,265);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
const manifest=await(await fetch('/assets/animated-industry/manifest.json')).json();
for(const entry of manifest.models){
 const gltf=await new GLTFLoader().loadAsync(entry.url),model=gltf.scene,scene=new T.Scene();scene.add(model);scene.add(new T.HemisphereLight(0xf4f9ff,0x809b86,2.1));const sun=new T.DirectionalLight(0xffefd7,3);sun.position.set(-3,6,4);scene.add(sun);model.updateMatrixWorld(true);
 const allBounds=new T.Box3();for(const clip of gltf.animations){const mixer=new T.AnimationMixer(model);const action=mixer.clipAction(clip).setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();for(let i=0;i<=24;i++){mixer.setTime(clip.duration*i/24);model.updateMatrixWorld(true);allBounds.union(new T.Box3().setFromObject(model));}mixer.stopAllAction();}
 const height=allBounds.max.y,scale=2.6/Math.max(...allBounds.getSize(new T.Vector3()).toArray());model.scale.setScalar(scale);
 const camera=new T.PerspectiveCamera(35,320/265,.01,100);camera.position.set(4.3,3.2,5.6);camera.lookAt(0,height*scale*.45,0);
 const item={id:entry.id,bytes:entry.bytes,animationBoundsUnscaled:{min:allBounds.min.toArray(),max:allBounds.max.toArray(),size:allBounds.getSize(new T.Vector3()).toArray()},clips:[],nodes:[],samples:[]};model.traverse(n=>{if(n.isMesh)item.nodes.push({name:n.name,geometryVertices:n.geometry.attributes.position.count});});
 for(const clip of gltf.animations){
  const mixer=new T.AnimationMixer(model),action=mixer.clipAction(clip);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();const poses=[];
  for(let i=0;i<=4;i++){mixer.setTime(clip.duration*i/4);model.updateMatrixWorld(true);poses.push(model.getObjectByName(entry.id==='robot-arm-pick'?'claw-a':'top').getWorldPosition(new T.Vector3()).toArray());}
  const start=poses[0],motion=Math.max(...poses.map(p=>Math.hypot(...p.map((v,i)=>v-start[i]))));
  mixer.setTime(clip.duration*.35);model.updateMatrixWorld(true);const before=model.getObjectByName(entry.id==='robot-arm-pick'?'claw-a':'top').matrixWorld.toArray();mixer.update(0);model.updateMatrixWorld(true);const after=model.getObjectByName(entry.id==='robot-arm-pick'?'claw-a':'top').matrixWorld.toArray();
  item.clips.push({name:clip.name,duration:clip.duration,tracks:clip.tracks.length,poses,motion,pausedStable:before.every((v,i)=>v===after[i])});mixer.stopAllAction();
 }
 const clip=gltf.animations.find(c=>c.name===(entry.id==='robot-arm-pick'?'pick-and-place':'toggle')),mixer=new T.AnimationMixer(model);const action=mixer.clipAction(clip);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();
 for(let frame=0;frame<5;frame++){
  const time=clip.duration*frame/4;mixer.setTime(time);model.updateMatrixWorld(true);renderer.render(scene,camera);const cell=document.createElement('div');cell.className='cell';const img=new Image();img.src=renderer.domElement.toDataURL();await img.decode();cell.append(img);const label=document.createElement('label');label.textContent=entry.id+' '+time.toFixed(2)+'s';cell.append(label);grid.append(cell);
  const box=new T.Box3().setFromObject(model);item.samples.push({time,min:box.min.toArray(),max:box.max.toArray(),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles});
 }
 mixer.stopAllAction();action.reset().setLoop(T.LoopRepeat,Infinity).play();let delta=0;for(let n=0;n<30;n++){mixer.update(1/60);model.updateMatrixWorld(true);delta+=1/60;}item.realtimeUpdateSeconds=delta;
 window.audit.push(item);
}
renderer.dispose();renderer.forceContextLoss();window.done=true;
</script>`;
const server=createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('content-type','text/html');res.end(html);return;}const url=decodeURIComponent(req.url.split('?')[0]);const p=resolve(root,'.'+(url.startsWith('/assets/')?'/public'+url:url));if(!p.startsWith(root+'/')){res.writeHead(403).end();return;}res.setHeader('content-type',({'.js':'text/javascript','.json':'application/json','.glb':'model/gltf-binary'})[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:'/Users/kh/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
try{const page=await browser.newPage({viewport:{width:1600,height:600}}),errors=[],failed=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push(r.url()));await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.done,{timeout:60000});await page.screenshot({path:resolve(out,'asset-motion-contact-sheet.png')});const models=await page.evaluate(()=>window.audit);const result={modelCount:models.length,clipCount:models.flatMap(x=>x.clips).length,errors,failed,models};await writeFile(resolve(out,'asset-render-audit.json'),JSON.stringify(result,null,2)+'\n');if(errors.length||failed.length||models.length!==2||models.some(m=>m.clips.some(c=>c.motion<.001||!c.pausedStable)))throw Error('animation verification failed');console.log(JSON.stringify({models:models.length,clips:result.clipCount,errors:errors.length,failed:failed.length}));}finally{await browser.close();await new Promise(r=>server.close(r));}
