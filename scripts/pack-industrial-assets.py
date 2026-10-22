#!/usr/bin/env python3
"""선택한 공식 Kenney Factory Kit 3.0 GLB를 팔레트 내장·접지해 배치한다."""
import argparse, colorsys, importlib.util, io, json, shutil, struct
from pathlib import Path
from PIL import Image

MODELS = {
    'machine': '생산 설비', 'machine-window': '검사 설비',
    'robot-arm-a': '생산 로봇', 'scanner-high': '심사 스캐너',
    'conveyor-long': '생산 이송대', 'conveyor-corner': '이송대 회전부',
    'conveyor-sides': '출하 이송대', 'warning-traffic': '운영 상태등',
    'screen-wide': '설비 계기판', 'structure-wall': '창고 외벽',
    'door-wide-open': '열린 출하 도크', 'crane-lift': '적재 작업대',
    'cog-a': '가동 기어', 'pipe-large-valve': '공장 배관',
    'button-floor-round': '설비 스위치', 'hopper-round': '생산 투입구',
}

def pack(source, target, bounds):
    raw = source.read_bytes()
    size = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20+size])
    binary = bytearray(raw[28+size:])
    lo, hi = bounds(doc)
    roots = doc['scenes'][doc.get('scene', 0)]['nodes']
    doc['nodes'].append({'name': target.stem+'-grounded', 'children': roots[:],
        'translation': [-(hi[0]+lo[0])/2, -lo[1], -(hi[2]+lo[2])/2]})
    doc['scenes'][doc.get('scene', 0)]['nodes'] = [len(doc['nodes'])-1]
    for image in doc.get('images', []):
        uri = image.pop('uri', None)
        if not uri:
            continue
        palette = Image.open(source.parent/uri).convert('RGBA')
        pixels=[]
        for r,g,b,a in palette.getdata():
            h,s,v=colorsys.rgb_to_hsv(r/255,g/255,b/255)
            if .58 < h < .81 and s > .10:
                r,g,b=[round(c*255) for c in colorsys.hsv_to_rgb(.51, min(s*.55,.30), v)]
            pixels.append((r,g,b,a))
        palette.putdata(pixels)
        palette.thumbnail((256,256), Image.Resampling.LANCZOS)
        stream=io.BytesIO();palette.save(stream,format='PNG',optimize=True)
        data=stream.getvalue()
        binary.extend(b'\0'*(-len(binary)%4))
        image.update({'bufferView':len(doc.setdefault('bufferViews',[])),'mimeType':'image/png'})
        doc['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(data)})
        binary.extend(data)
    for material in doc.get('materials',[]):
        material.setdefault('pbrMetallicRoughness',{})['roughnessFactor']=.76
    doc['buffers']=[{'byteLength':len(binary)}]
    doc['asset']['extras']={'source':'Kenney Factory Kit 3.0','license':'CC0-1.0',
        'modifications':'산업 청록 팔레트, 256px 내장, XZ 중심·Y 접지, roughness .76'}
    encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4)
    binary.extend(b'\0'*(-len(binary)%4))
    output=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(binary))
    output+=struct.pack('<II',len(encoded),0x4e4f534a)+encoded
    output+=struct.pack('<II',len(binary),0x004e4942)+binary
    target.write_bytes(output)
    tris=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
    return {'id':target.stem,'url':'/assets/industrial/'+target.name,'role':MODELS[target.stem],
        'size':[round(hi[i]-lo[i],5) for i in range(3)], 'bytes':len(output),'triangles':tris,
        'nodes':[n.get('name') for n in doc['nodes']], 'animations':[a.get('name') for a in doc.get('animations',[])]}

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('source',type=Path)
    ap.add_argument('--dest',type=Path,default=Path('public/assets/industrial'));args=ap.parse_args()
    spec=importlib.util.spec_from_file_location('kaykit_pack',Path(__file__).with_name('pack-game-assets.py'))
    helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
    source=args.source/'Models'/'GLB format';args.dest.mkdir(parents=True,exist_ok=True)
    models=[pack(source/(name+'.glb'),args.dest/(name+'.glb'),helper.bounds) for name in MODELS]
    shutil.copy2(args.source/'License.txt',args.dest/'Kenney-Factory-LICENSE.txt')
    manifest={'pack':'Kenney Factory Kit 3.0','license':'CC0-1.0','source':'https://kenney.nl/assets/factory-kit',
        'sourceModelCount':len(list(source.glob('*.glb'))),'models':models,
        'reuse':[{'id':n,'url':u} for n,u in [('truck','/assets/models/truck.glb'),('delivery','/assets/models/delivery.glb'),('crate','/assets/game-v2/crate.glb'),('pallet','/assets/game-v2/pallet.glb')]]}
    (args.dest/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'selected':len(models),'bytes':sum(m['bytes'] for m in models),'triangles':sum(m['triangles'] for m in models)}))
