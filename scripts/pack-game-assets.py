#!/usr/bin/env python3
"""Pack selected official KayKit glTF files as standalone mobile-sized GLBs.

Usage: python3 scripts/pack-game-assets.py --city /path/to/city-repo --hexagon /path/to/hexagon-repo
Only the public free-tier repositories are inputs; no paid-tier files are used.
"""
import argparse
import io
import itertools
import json
from pathlib import Path
import shutil
import struct
from PIL import Image


CITY = [*(f"building_{c}" for c in "ABCDEFGH"), "car_hatchback", "car_sedan", "car_stationwagon",
        "box_A", "box_B", "bush", "bench", "streetlight", "watertower", "base", "road_straight",
        "road_corner", "road_corner_curved", "road_junction", "road_straight_crossing", "road_tsplit"]
HEXAGON = ["trees_A_small", "trees_A_medium", "trees_B_small", "trees_B_medium", "crate_A_big", "pallet"]


def matrix(node):
    if "matrix" in node:
        return [node["matrix"][i::4] for i in range(4)]
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    s = node.get("scale", [1, 1, 1])
    t = node.get("translation", [0, 0, 0])
    m = [[1-2*y*y-2*z*z, 2*x*y-2*z*w, 2*x*z+2*y*w, t[0]],
         [2*x*y+2*z*w, 1-2*x*x-2*z*z, 2*y*z-2*x*w, t[1]],
         [2*x*z-2*y*w, 2*y*z+2*x*w, 1-2*x*x-2*y*y, t[2]], [0, 0, 0, 1]]
    return [[v*s[j] if j < 3 else v for j, v in enumerate(row)] for row in m]


def multiply(a, b):
    return [[sum(a[i][k]*b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def bounds(doc):
    points = []
    def visit(index, parent):
        node = doc["nodes"][index]
        m = multiply(parent, matrix(node))
        if "mesh" in node:
            for prim in doc["meshes"][node["mesh"]]["primitives"]:
                a = doc["accessors"][prim["attributes"]["POSITION"]]
                for p in itertools.product(*zip(a["min"], a["max"])):
                    points.append([sum(m[i][j]*[*p, 1][j] for j in range(4)) for i in range(3)])
        for child in node.get("children", []):
            visit(child, m)
    for root in doc["scenes"][doc.get("scene", 0)]["nodes"]:
        visit(root, matrix({}))
    return [min(p[i] for p in points) for i in range(3)], [max(p[i] for p in points) for i in range(3)]


def pack(source, dest, pack_name):
    doc = json.loads(source.read_text())
    lo, hi = bounds(doc)
    offset = [-(hi[0]+lo[0])/2, -lo[1], -(hi[2]+lo[2])/2]
    # Normalize the complete scene, including vehicle wheel node hierarchies.
    roots = doc["scenes"][doc.get("scene", 0)]["nodes"]
    doc["nodes"].append({"name": dest.stem, "children": roots[:], "translation": offset})
    doc["scenes"][doc.get("scene", 0)]["nodes"] = [len(doc["nodes"])-1]
    binary = bytearray()
    def append(data):
        while len(binary) % 4:
            binary.append(0)
        start = len(binary)
        binary.extend(data)
        return start
    for i, buffer in enumerate(doc["buffers"]):
        base = append((source.parent / buffer["uri"]).read_bytes())
        for view in doc["bufferViews"]:
            if view.get("buffer", 0) == i:
                view["byteOffset"] = view.get("byteOffset", 0) + base
                view["buffer"] = 0
    for image in doc.get("images", []):
        raw = Image.open(source.parent / image.pop("uri")).convert("RGBA")
        raw.thumbnail((256, 256), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        raw.save(out, format="PNG", optimize=True)
        data = out.getvalue()
        start = append(data)
        image["bufferView"] = len(doc["bufferViews"])
        image["mimeType"] = "image/png"
        doc["bufferViews"].append({"buffer": 0, "byteOffset": start, "byteLength": len(data)})
    for material in doc.get("materials", []):
        material.setdefault("pbrMetallicRoughness", {})["roughnessFactor"] = .82
    while len(binary) % 4:
        binary.append(0)
    doc["buffers"] = [{"byteLength": len(binary)}]
    doc["asset"]["extras"] = {"source": pack_name, "license": "CC0-1.0", "textureMaxSize": 256,
                                  "modifications": "256px atlas; roughness .82; centered XZ, grounded Y"}
    encoded = json.dumps(doc, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    data = struct.pack("<III", 0x46546C67, 2, 12+8+len(encoded)+8+len(binary))
    data += struct.pack("<II", len(encoded), 0x4E4F534A) + encoded
    data += struct.pack("<II", len(binary), 0x004E4942) + binary
    dest.write_bytes(data)
    triangles = sum(doc["accessors"][p["indices"]]["count"]//3 for mesh in doc["meshes"] for p in mesh["primitives"])
    return {"id": dest.stem, "url": f"/assets/game-v2/{dest.name}", "pack": pack_name,
            "size": [round(hi[i]-lo[i], 5) for i in range(3)], "triangles": triangles, "bytes": len(data),
            "meshes": len(doc["meshes"]), "origin": "XZ center; bottom Y=0", "up": "+Y"}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--city", required=True, type=Path)
    p.add_argument("--hexagon", required=True, type=Path)
    p.add_argument("--dest", default=Path("public/assets/game-v2"), type=Path)
    a = p.parse_args()
    a.dest.mkdir(parents=True, exist_ok=True)
    manifest = []
    for directory, names, label in [(a.city, CITY, "KayKit City Builder Bits 1.0"), (a.hexagon, HEXAGON, "KayKit Medieval Hexagon Pack 1.0")]:
        all_files = list(directory.rglob("*.gltf"))
        for name in names:
            matches = [f for f in all_files if f.stem == name]
            if len(matches) != 1:
                raise ValueError(f"Expected one source for {name}; found {len(matches)}")
            target = name.replace("_", "-").replace("trees-", "tree-")
            if name == "crate_A_big":
                target = "crate"
            manifest.append(pack(matches[0], a.dest / f"{target}.glb", label))
        source_license = next(directory.rglob("LICENSE.txt"))
        shutil.copyfile(source_license, a.dest / ("KayKit-City-LICENSE.txt" if directory == a.city else "KayKit-Hexagon-LICENSE.txt"))
    (a.dest / "manifest.json").write_text(json.dumps({"license": "CC0-1.0", "models": manifest}, indent=2)+"\n")
    print(json.dumps({"models": len(manifest), "bytes": sum(m["bytes"] for m in manifest),
                      "maxFileBytes": max(m["bytes"] for m in manifest), "triangles": sum(m["triangles"] for m in manifest)}))


if __name__ == "__main__":
    main()
