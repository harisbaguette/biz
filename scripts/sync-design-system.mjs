import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

// Install the source files supplied by Pattove's official shadcn registries.
// No registry source or generated illustration is restyled during installation.
const source = resolve(process.env.PATTOVE_DESIGN_SYSTEM || '../디자인시스템/실행관리(Ops-Run)');
const target = resolve('src/design-system/vendor');
const check = process.argv.includes('--check');
const components = ['button', 'icon-button', 'input', 'field', 'select', 'badge', 'switch', 'dialog', 'bottom-nav', 'empty-state'];
const icons = {
  ArrowRight:'ICO-445', CalendarDays:'ICO-753', ChevronDown:'ICO-453', ChevronLeft:'ICO-454', ChevronRight:'ICO-455',
  Layers3:'ICO-280', History:'ICO-319', ScanLine:'lucide:scan-line', Clock3:'lucide:clock-3', Check:'ICO-122', Info:'ICO-94',
  Move3D:'lucide:move-3d', Factory:'ICO-831', Focus:'ICO-595', KeyRound:'lucide:key-round', Minus:'ICO-531', Package:'ICO-395',
  Plus:'ICO-25', RefreshCw:'ICO-41', RotateCw:'ICO-72', RotateCcw:'ICO-40', Settings2:'lucide:settings-2', TriangleAlert:'ICO-96',
  WifiOff:'ICO-349', Home:'ICO-01', Map:'ICO-263', CheckCircle2:'ICO-95', Volume2:'ICO-203', VolumeX:'ICO-204', Navigation:'ICO-326', Anchor:'ICO-817', Palette:'ICO-699', Waves:'ICO-955', Sparkles:'ICO-427', Gamepad2:'lucide:gamepad-2', Image:'ICO-592', NotebookPen:'lucide:notebook-pen', Search:'ICO-62',
  Send:'ICO-49', ShieldCheck:'ICO-645', Video:'ICO-153', X:'ICO-08', PackageOpen:'ICO-733', ImageOff:'lucide:image-off',
  AlertTriangle:'ICO-96', LockKeyhole:'lucide:lock-keyhole', LoaderCircle:'lucide:loader-circle', Truck:'ICO-804',
};
const selected = new Map();
for (const id of components) {
  const registryPath = `src/registry/r/pattove-main-${id}-react.json`;
  const registry = JSON.parse(readFileSync(resolve(source, registryPath), 'utf8'));
  for (const file of registry.files) {
    if (!/^design\/(?:base\.css|styles\/.*\.css|css\/.*\.css|react\/.*\.jsx)$/.test(file.path)) continue;
    const name = file.path.replace(/^design\//, '');
    const bytes = Buffer.from(file.content);
    if (selected.has(name) && !selected.get(name).bytes.equals(bytes)) throw Error(`Registry dependency mismatch: ${name}`);
    selected.set(name, {bytes, source:`${registryPath}#${file.path}`});
  }
}
for (const name of ['PretendardVariable.woff2','Pretendard-LICENSE.txt','Outfit-Variable.woff2','Outfit-OFL.txt']) {
  selected.set(`fonts/${name}`, {bytes:readFileSync(resolve(source,'assets/fonts',name)),source:`assets/fonts/${name}`});
}
const {asset,metadata} = await import(pathToFileURL(resolve(source,'scripts/lib/illustration-store.mjs')).href);
const illustrationIds = [...new Set(Object.values(icons))];
for (const id of illustrationIds) {
  const item = metadata(id);
  const rendered = await asset(id,{format:'webp',size:96});
  selected.set(`icons/${id.replace(/:/g,'-')}.webp`, {bytes:rendered.bytes,source:`assets/icons/illustrated/manifest.json#${id}`,canonicalId:item.canonicalId});
}
selected.set('icons/mapping.json',{bytes:Buffer.from(JSON.stringify(icons,null,2)+'\n'),source:'selected icon IDs from Pattove illustration catalog'});
const rootTokens = [...selected].filter(([name])=>name === 'base.css' || name.startsWith('styles/')).map(([,item])=>item.bytes.toString('utf8').match(/^\.ds(?:\[data-style="main"\])?\{([^}]+)\}/)?.[1] || '').join('');
if (!rootTokens) throw Error('Pattove root token block missing');
const rootTokenFile = resolve('src/design-system/root-tokens.css');
const rootTokenCSS = '/* Main tokens mirrored to the application root; generated from the unmodified registry base.css. */\n:root {' + rootTokens + '}\n';
if (check) { if (!readFileSync(rootTokenFile).equals(Buffer.from(rootTokenCSS))) throw Error('Application root tokens differ'); }
else writeFileSync(rootTokenFile,rootTokenCSS);
const previous = existsSync(resolve(target,'manifest.json')) ? JSON.parse(readFileSync(resolve(target,'manifest.json'),'utf8')) : null;
const hashes = {};
for (const [name,item] of selected) {
  const dest = resolve(target,name);
  if (check) {
    if (!existsSync(dest) || !readFileSync(dest).equals(item.bytes)) throw Error(`Pattove original differs: ${name}`);
  } else {
    mkdirSync(dirname(dest),{recursive:true});
    writeFileSync(dest,item.bytes);
  }
  hashes[name] = {sha256:createHash('sha256').update(item.bytes).digest('hex'),source:item.source,...(item.canonicalId?{canonicalId:item.canonicalId}:{})};
}
const css = [...selected.keys()].filter(name=>name.endsWith('.css'));
const index = css.map(name=>`@import "./${name}";`).join('\n')+'\n@import "../adapter.css";\n';
const manifest = {source:'디자인시스템/실행관리(Ops-Run)',system:'Pattove',style:'main',version:'0.8.0',components,icons:illustrationIds,files:hashes};
if (check) {
  if (readFileSync(resolve(target,'index.css'),'utf8')!==index) throw Error('Pattove CSS imports differ');
  if (JSON.stringify(previous)!==JSON.stringify(manifest)) throw Error('Pattove manifest differs');
} else {
  // Remove only previous generated vendor files. Product adapters stay outside vendor/.
  const keep = new Set([...selected.keys(),'index.css','manifest.json']);
  const removeStale = dir => {for(const item of readdirSync(dir,{withFileTypes:true})) {const p=resolve(dir,item.name);if(item.isDirectory())removeStale(p);else if(!p.endsWith('.d.ts') && !keep.has(relative(target,p).split('\\').join('/')))rmSync(p);}};
  removeStale(target);
  writeFileSync(resolve(target,'index.css'),index);
  writeFileSync(resolve(target,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
}
console.log(`Pattove main: ${selected.size}/${selected.size} originals ${check?'verified':'installed'}; ${components.length} component registries; ${illustrationIds.length} illustration IDs`);
