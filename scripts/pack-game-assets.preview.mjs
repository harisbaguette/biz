// Headless audit for every packed game-v2 model. It never touches user windows.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from '@playwright/test';

const root = resolve('.');
const out = resolve('artifacts/game-assets-v2');
await mkdir(out, { recursive: true });
const html = `<!doctype html><meta charset="utf-8"><title>KayKit 30 model audit</title>
<style>body{margin:0;background:#d9e5e8;font:600 16px system-ui;color:#21373e}#grid{display:grid;grid-template-columns:repeat(6,1fr)}.cell{height:250px;position:relative;border:1px solid #bed2d6}canvas,img{position:absolute;inset:0}label{position:absolute;bottom:10px;left:0;right:0;text-align:center}</style>
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script><div id="grid"></div>
<script type="module">
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const manifest=await(await fetch('/assets/game-v2/manifest.json')).json();
const loader=new GLTFLoader();window.audit=[];const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
for(const entry of manifest.models){
 const cell=document.createElement('div');cell.className='cell';grid.append(cell);
 renderer.setSize(264,250);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;cell.append(renderer.domElement);
 const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xf0f9ff,0x9bb3a1,2.1));const sun=new THREE.DirectionalLight(0xfff1d5,3.2);sun.position.set(-3,7,5);scene.add(sun);
 const model=(await loader.loadAsync(entry.url)).scene;model.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(model);const size=box.getSize(new THREE.Vector3());
 const scale=2.5/Math.max(size.x,size.y,size.z);model.scale.setScalar(scale);scene.add(model);
 const camera=new THREE.PerspectiveCamera(33,264/250,.01,100);camera.position.set(4.8,3.9,6.6);camera.lookAt(0,size.y*scale*.45,0);
 renderer.render(scene,camera);const label=document.createElement('label');label.textContent=entry.id;cell.append(label);
 window.audit.push({id:entry.id,size:size.toArray(),min:box.min.toArray(),triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls});const image=new Image();image.src=renderer.domElement.toDataURL();await image.decode();renderer.domElement.replaceWith(image);
}
renderer.dispose();renderer.forceContextLoss();window.done=true;
</script>`;
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
    const url = decodeURIComponent(req.url.split('?')[0]);
    const rel = url.startsWith('/assets/') ? '/public' + url : url;
    const file = resolve(root, '.' + rel);
    if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    const mime = { '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary' }[extname(file)];
    if (mime) res.setHeader('Content-Type', mime);
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'], executablePath: process.env.BIZ_CHROMIUM_PATH || '/Users/kh/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell' });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1260 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.done === true, { timeout: 60000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(out, 'all-models-v2.png'), fullPage: true });
  const models = await page.evaluate(() => window.audit);
  const result = { count: models.length, errors, models };
  await writeFile(resolve(out, 'render-audit.json'), JSON.stringify(result, null, 2) + '\n');
  if (errors.length || models.length !== 30 || models.some(x => Math.abs(x.min[1]) > .0001)) throw new Error('Asset audit failed');
  console.log(JSON.stringify({ loaded: models.length, errors: errors.length, groundingPassed: models.filter(x => Math.abs(x.min[1]) < .0001).length, screenshot: 'artifacts/game-assets-v2/all-models-v2.png' }));
} finally { await browser.close(); await new Promise(r => server.close(r)); }
