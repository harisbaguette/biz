#!/usr/bin/env python3
"""Kenney 원본 프레스 clip 보존 및 분리관절 팔에 명시적인 운반 clip 추가."""
import argparse, importlib.util, json, math, struct, tempfile, zipfile, shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NAMES = {'piston-square': '왕복 생산 프레스', 'robot-arm-pick': '집기·올리기·이동·놓기 관절팔'}

def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT/'scripts'/filename)
    result = importlib.util.module_from_spec(spec); spec.loader.exec_module(result)
    return result

def add_pick_clip(path):
    raw = path.read_bytes(); size = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20+size]); binary = bytearray(raw[28+size:])
    nodes = {node['name']: index for index,node in enumerate(doc['nodes'])}
    times = [0,.35,.75,1.35,1.8,2,2.35,3.1,3.6]
    # 床固定の台座、肩・肘・手首の各固有ピボットを保持する。
    tracks = {
      'element-a': ('rotation','y',[-35,-35,-35,35,35,35,35,-35,-35]),
      'element-b': ('rotation','z',[-60,-60,-25,-25,-60,-60,-25,-25,-60]),
      'element-d': ('rotation','z',[30,30,30,30,30,30,30,30,30]),
      'element-f': ('rotation','z',[210,210,175,175,210,210,175,175,210]),
      'claw-a': ('translation','x',[.175,.09,.09,.09,.09,.175,.175,.175,.175]),
      'claw-b': ('translation','x',[-.175,-.09,-.09,-.09,-.09,-.175,-.175,-.175,-.175]),
    }
    def accessor(values, kind):
        flat = [n for value in values for n in (value if isinstance(value,list) else [value])]
        binary.extend(b'\0'*(-len(binary)%4)); offset=len(binary)
        binary.extend(struct.pack('<'+'f'*len(flat),*flat))
        view=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(flat)*4})
        item={'bufferView':view,'componentType':5126,'count':len(values),'type':kind}
        if kind=='SCALAR': item.update(min=[min(flat)],max=[max(flat)])
        doc['accessors'].append(item);return len(doc['accessors'])-1
    timer=accessor(times,'SCALAR');samplers=[];channels=[]
    for name,(property,axis,values) in tracks.items():
        node=doc['nodes'][nodes[name]]; frames=[]
        for value in values:
            if property=='rotation':
                half=math.radians(value)/2; q=[0,0,0,math.cos(half)];q['xyz'.index(axis)]=math.sin(half);frames.append(q)
            else:
                v=list(node['translation']);v['xyz'.index(axis)]=value;frames.append(v)
        node[property]=frames[0]
        output=accessor(frames,'VEC4' if property=='rotation' else 'VEC3')
        channels.append({'sampler':len(samplers),'target':{'node':nodes[name],'path':property}})
        samplers.append({'input':timer,'output':output,'interpolation':'LINEAR'})
    doc['animations']=[{'name':'pick-and-place','channels':channels,'samplers':samplers,
        'extras':{'authorship':'Bluekite project-added joint animation; original Kenney geometry, not a source-supplied clip',
                 'duration':3.6,'phases':'grasp, lift, swing, lower, release, return'}}]
    doc['buffers'][0]['byteLength']=len(binary)
    doc['asset']['extras']['modifications']+='; project-added 3.6s pick-and-place joint clip, rest pose at first key'
    encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4);binary.extend(b'\0'*(-len(binary)%4))
    path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(encoded)+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--source',type=Path,default=Path.home()/'.codex/assets/Kenney-Factory-Kit-3.0/kenney_factory-kit_3.0.zip');args=ap.parse_args()
    packer=module('industrial','pack-industrial-assets.py');bounds=module('bounds','pack-game-assets.py').bounds
    packer.MODELS.update(NAMES)
    dest=ROOT/'public/assets/animated-industry';dest.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(args.source) as archive, tempfile.TemporaryDirectory(prefix='biz-animation-') as temporary:
        archive.extractall(temporary);base=Path(temporary);source=base/'Models/GLB format';models=[]
        for model in NAMES:
            original='robot-arm-a' if model=='robot-arm-pick' else model
            target=dest/(model+'.glb');entry=packer.pack(source/(original+'.glb'),target,bounds)
            if model=='robot-arm-pick':add_pick_clip(target)
            entry.update(url='/assets/animated-industry/'+target.name,bytes=target.stat().st_size,
                clipOrigin='project-added' if model=='robot-arm-pick' else 'Kenney original',
                animations=['pick-and-place'] if model=='robot-arm-pick' else entry['animations'])
            models.append(entry)
        shutil.copy2(base/'License.txt',dest/'Kenney-LICENSE.txt')
    manifest={'pack':'Kenney Factory Kit 3.0','license':'CC0-1.0','source':'https://kenney.nl/assets/factory-kit',
      'originalModelCount':143,'models':models,'note':'piston source clips preserved; robot source has no animation and project adds pick-and-place. No conveyor source clips exist.'}
    (dest/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'models':len(models),'bytes':sum(m['bytes'] for m in models)},ensure_ascii=False))
if __name__=='__main__':main()
