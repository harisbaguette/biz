"""공식 팩의 외부 팔레트를 GLB에 넣어 모델별 텍스처 충돌을 막는다."""
import argparse
import json
import struct
from pathlib import Path


def pack(source, target):
    raw=source.read_bytes()
    length=struct.unpack_from('<I',raw,12)[0]
    doc=json.loads(raw[20:20+length])
    offset=20+length
    binary=bytearray(raw[offset+8:]) if offset<len(raw) else bytearray()
    for image in doc.get('images',[]):
        if not image.get('uri') or image['uri'].startswith('data:'):
            continue
        image_path=source.parent/image.pop('uri')
        content=image_path.read_bytes()
        while len(binary)%4:binary.append(0)
        view={'buffer':0,'byteOffset':len(binary),'byteLength':len(content)}
        image['bufferView']=len(doc.setdefault('bufferViews',[]))
        image['mimeType']='image/png' if image_path.suffix=='.png' else 'image/jpeg'
        doc['bufferViews'].append(view);binary.extend(content)
    doc['buffers'][0]['byteLength']=len(binary)
    while len(binary)%4:binary.append(0)
    data=json.dumps(doc,separators=(',',':')).encode()
    while len(data)%4:data+=b' '
    result=struct.pack('<III',0x46546C67,2,12+8+len(data)+8+len(binary))+struct.pack('<II',len(data),0x4E4F534A)+data+struct.pack('<II',len(binary),0x004E4942)+binary
    target.write_bytes(result)


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('target',type=Path);args=p.parse_args();pack(args.source,args.target)
