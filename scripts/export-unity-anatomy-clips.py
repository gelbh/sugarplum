#!/usr/bin/env python3
"""Export UnityFS anatomy AnimationClips to animated glTF (Approach A).

Source of truth: /tmp/rea-ivala/inner-raw/*_animations.unity3d only.
Never use /tmp/rea-ivala/glb/*_animations.glb (mesh-only) as clip sources.
Never route clip packs through scripts/split-anatomy-combined-glb.py.

Usage:
  python3 scripts/export-unity-anatomy-clips.py \\
    --pack=herniation \\
    --unity=/tmp/rea-ivala/inner-raw/herniation_types_animations.unity3d \\
    --out=/tmp/rea-ivala/drop/herniation-types-animations
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
from pathlib import Path

import numpy as np
import UnityPy

# Junk meshes in the herniation bundle (UI / camera helpers).
SKIP_MESH_NAMES = frozenset({"Cube", "TargetedCamera", "Object002"})

# Brain models: Unity mesh name → drop file stem + clip metadata.
# Labels match ContentLocalization_* Falcine / Caudal tentorial / Foramen magnum.
HERNIATION_BRAINS = (
    {
        "mesh": "Mesh.002",
        "file": "brain_falcine.glb",
        "clip": "BrainFalcineAnimation",
        "clip_id": "falcine",
        "label": "Falcine",
        "structure_id": "root-brain-falcine",
    },
    {
        "mesh": "Mesh.003",
        "file": "brain_caudal_tentorial.glb",
        "clip": "BrainCaudalTentorialAnimation",
        "clip_id": "caudal-tentorial",
        "label": "Caudal tentorial",
        "structure_id": "root-brain-caudal-tentorial",
    },
    {
        "mesh": "Mesh.001",
        "file": "brain_foramen_magnum.glb",
        "clip": "BrainForamenMagnumAnimation",
        "clip_id": "foramen-magnum",
        "label": "Foramen magnum",
        "structure_id": "root-brain-foramen-magnum",
    },
)

SKULL_STRUCTURE_ID = "root-skull-l"


def parse_obj(obj_text: str) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Parse UnityPy Mesh.export() OBJ into positions, normals, triangle indices."""
    positions: list[tuple[float, float, float]] = []
    normals: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int]] = []
    for line in obj_text.splitlines():
        if not line or line[0] == "#":
            continue
        if line.startswith("v "):
            _, x, y, z = line.split()[:4]
            positions.append((float(x), float(y), float(z)))
        elif line.startswith("vn "):
            _, x, y, z = line.split()[:4]
            normals.append((float(x), float(y), float(z)))
        elif line.startswith("f "):
            parts = line.split()[1:]
            idxs = []
            for p in parts:
                # v, v/vt, v/vt/vn, or v//vn
                vi = int(p.split("/")[0]) - 1
                idxs.append(vi)
            if len(idxs) < 3:
                continue
            for i in range(1, len(idxs) - 1):
                faces.append((idxs[0], idxs[i], idxs[i + 1]))
    pos = np.asarray(positions, dtype=np.float32)
    if not normals:
        nor = np.zeros_like(pos)
    else:
        nor = np.asarray(normals, dtype=np.float32)
        if len(nor) != len(pos):
            # Rare mismatch: fall back to zero normals rather than crash.
            nor = np.zeros_like(pos)
    idx = np.asarray(faces, dtype=np.uint32).reshape(-1)
    return pos, nor, idx


def _vec3(v) -> tuple[float, float, float]:
    # UnityPy Vector3f exposes .X/.Y/.Z (and sometimes lowercase).
    return (
        float(getattr(v, "X", getattr(v, "x"))),
        float(getattr(v, "Y", getattr(v, "y"))),
        float(getattr(v, "Z", getattr(v, "z"))),
    )


def morph_targets_from_mesh(mesh, n_verts: int) -> tuple[list[str], list[np.ndarray]]:
    """Channel names + dense POSITION deltas for each blend-shape channel."""
    shapes = mesh.m_Shapes
    names: list[str] = []
    deltas: list[np.ndarray] = []
    for ch in shapes.channels or []:
        names.append(ch.name)
        shape = shapes.shapes[ch.frameIndex]
        arr = np.zeros((n_verts, 3), dtype=np.float32)
        if shape.vertexCount:
            for j in range(shape.vertexCount):
                sv = shapes.vertices[shape.firstVertex + j]
                i = int(sv.index)
                if 0 <= i < n_verts:
                    arr[i] = _vec3(sv.vertex)
        deltas.append(arr)
    return names, deltas


def _accessor_minmax(data: np.ndarray) -> tuple[list[float], list[float]]:
    if data.ndim == 1:
        return [float(data.min())], [float(data.max())]
    return data.min(axis=0).astype(float).tolist(), data.max(axis=0).astype(float).tolist()


def write_glb(
    path: Path,
    *,
    positions: np.ndarray,
    normals: np.ndarray,
    indices: np.ndarray,
    morph_names: list[str],
    morph_deltas: list[np.ndarray],
    animation_name: str | None,
    sample_rate: float,
) -> None:
    """Write a single-mesh GLB with optional morph targets + weights animation."""
    bin_parts: list[bytes] = []
    buffer_views: list[dict] = []
    accessors: list[dict] = []

    def add_blob(
        raw: bytes,
        *,
        target: int | None = None,
        byte_stride: int | None = None,
    ) -> int:
        # Align to 4 bytes.
        pad = (4 - (len(raw) % 4)) % 4
        offset = sum(len(p) for p in bin_parts)
        bin_parts.append(raw + (b"\x00" * pad))
        bv: dict = {"buffer": 0, "byteOffset": offset, "byteLength": len(raw)}
        if target is not None:
            bv["target"] = target
        if byte_stride is not None:
            bv["byteStride"] = byte_stride
        buffer_views.append(bv)
        return len(buffer_views) - 1

    def add_accessor(
        data: np.ndarray,
        *,
        component_type: int,
        type_name: str,
        target: int | None = None,
        normalized: bool = False,
    ) -> int:
        raw = data.astype(data.dtype, copy=False).tobytes()
        stride = None
        if data.ndim == 2:
            stride = int(data.shape[1] * data.dtype.itemsize)
        bv = add_blob(raw, target=target, byte_stride=stride)
        acc: dict = {
            "bufferView": bv,
            "componentType": component_type,
            "count": int(data.shape[0]),
            "type": type_name,
        }
        if normalized:
            acc["normalized"] = True
        if component_type == 5126:  # FLOAT
            mn, mx = _accessor_minmax(data.reshape(data.shape[0], -1) if data.ndim > 1 else data)
            # For SCALAR min/max are single-element lists; for VEC3 length 3.
            if type_name == "SCALAR":
                acc["min"] = [mn[0]]
                acc["max"] = [mx[0]]
            else:
                acc["min"] = mn
                acc["max"] = mx
        accessors.append(acc)
        return len(accessors) - 1

    pos_acc = add_accessor(positions, component_type=5126, type_name="VEC3", target=34962)
    nor_acc = add_accessor(normals, component_type=5126, type_name="VEC3", target=34962)
    # Indices: use uint32.
    idx_acc = add_accessor(
        indices.astype(np.uint32, copy=False),
        component_type=5125,
        type_name="SCALAR",
        target=34963,
    )

    targets = []
    for delta in morph_deltas:
        targets.append(
            {
                "POSITION": add_accessor(
                    delta, component_type=5126, type_name="VEC3", target=34962
                )
            }
        )

    mesh: dict = {
        "name": path.stem,
        "primitives": [
            {
                "attributes": {"POSITION": pos_acc, "NORMAL": nor_acc},
                "indices": idx_acc,
                **({"targets": targets} if targets else {}),
            }
        ],
        "extras": {"targetNames": morph_names} if morph_names else {},
    }
    if morph_names:
        mesh["weights"] = [0.0] * len(morph_names)

    nodes = [{"name": path.stem, "mesh": 0}]
    scenes = [{"nodes": [0]}]
    gltf: dict = {
        "asset": {"version": "2.0", "generator": "sugarplum-export-unity-anatomy-clips"},
        "buffers": [{"byteLength": 0}],  # filled after
        "bufferViews": buffer_views,
        "accessors": accessors,
        "meshes": [mesh],
        "nodes": nodes,
        "scenes": scenes,
        "scene": 0,
    }

    if animation_name and morph_names:
        n = len(morph_names)
        # Sequential one-hot: t_i = i / sampleRate (matches Unity stop ≈ (n-1)/rate).
        times = np.arange(n, dtype=np.float32) / float(sample_rate)
        weights = np.zeros((n, n), dtype=np.float32)
        for i in range(n):
            weights[i, i] = 1.0
        time_acc = add_accessor(times, component_type=5126, type_name="SCALAR")
        # Flatten T*M weights as SCALAR count T*M (glTF morph weights output).
        weight_acc = add_accessor(
            weights.reshape(-1),
            component_type=5126,
            type_name="SCALAR",
        )
        # Fix weight accessor count semantics: glTF expects count = keyframes,
        # type SCALAR with output length = count * morph_count when path is weights.
        accessors[weight_acc]["count"] = n
        accessors[weight_acc]["type"] = "SCALAR"
        # byteLength already covers n*n floats; count=n means n keyframes of n weights.
        gltf["animations"] = [
            {
                "name": animation_name,
                "samplers": [
                    {
                        "input": time_acc,
                        "interpolation": "LINEAR",
                        "output": weight_acc,
                    }
                ],
                "channels": [
                    {
                        "sampler": 0,
                        "target": {"node": 0, "path": "weights"},
                    }
                ],
            }
        ]

    blob = b"".join(bin_parts)
    gltf["buffers"][0]["byteLength"] = len(blob)

    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    json_pad = (4 - (len(json_bytes) % 4)) % 4
    json_bytes = json_bytes + (b" " * json_pad)
    bin_pad = (4 - (len(blob) % 4)) % 4
    blob = blob + (b"\x00" * bin_pad)

    total = 12 + 8 + len(json_bytes) + 8 + len(blob)
    with path.open("wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(json_bytes), b"JSON"))
        f.write(json_bytes)
        f.write(struct.pack("<I4s", len(blob), b"BIN\x00"))
        f.write(blob)


def load_meshes_and_clips(unity_path: Path):
    env = UnityPy.load(str(unity_path))
    meshes = {}
    clips = {}
    for obj in env.objects:
        if obj.type.name == "Mesh":
            m = obj.read()
            meshes[m.m_Name] = m
        elif obj.type.name == "AnimationClip":
            c = obj.read()
            clips[c.m_Name] = c
    return meshes, clips


def export_herniation(unity_path: Path, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    meshes, clips = load_meshes_and_clips(unity_path)

    skull = meshes.get("skull_l")
    if skull is None:
        raise SystemExit("skull_l mesh missing from Unity bundle")
    pos, nor, idx = parse_obj(skull.export())
    write_glb(
        out_dir / "skull_l.glb",
        positions=pos,
        normals=nor,
        indices=idx,
        morph_names=[],
        morph_deltas=[],
        animation_name=None,
        sample_rate=30.0,
    )
    print(f"wrote {out_dir / 'skull_l.glb'} (static)")

    clips_json = []
    for spec in HERNIATION_BRAINS:
        mesh = meshes.get(spec["mesh"])
        if mesh is None:
            raise SystemExit(f"mesh {spec['mesh']} missing")
        clip = clips.get(spec["clip"])
        if clip is None:
            raise SystemExit(f"clip {spec['clip']} missing")
        if mesh.m_Name in SKIP_MESH_NAMES:
            continue

        pos, nor, idx = parse_obj(mesh.export())
        names, deltas = morph_targets_from_mesh(mesh, len(pos))
        rate = float(clip.m_SampleRate) or 30.0
        write_glb(
            out_dir / spec["file"],
            positions=pos,
            normals=nor,
            indices=idx,
            morph_names=names,
            morph_deltas=deltas,
            animation_name=spec["clip"],
            sample_rate=rate,
        )
        print(
            f"wrote {out_dir / spec['file']} morphs={len(names)} clip={spec['clip']}"
        )
        clips_json.append(
            {
                "id": spec["clip_id"],
                "label": spec["label"],
                "animation": spec["clip"],
                "loop": False,
                "reveal": [SKULL_STRUCTURE_ID, spec["structure_id"]],
            }
        )

    clips_path = out_dir / "clips.json"
    clips_path.write_text(json.dumps(clips_json, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {clips_path}")


def glb_animation_count(path: Path) -> int:
    data = path.read_bytes()
    if data[:4] != b"glTF":
        raise ValueError(f"not a GLB: {path}")
    json_len = struct.unpack_from("<I", data, 12)[0]
    chunk = data[20 : 20 + json_len]
    meta = json.loads(chunk)
    return len(meta.get("animations") or [])


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pack", required=True, choices=("herniation",))
    ap.add_argument("--unity", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()

    if not args.unity.is_file():
        raise SystemExit(f"Unity bundle missing: {args.unity}")

    if args.pack == "herniation":
        export_herniation(args.unity, args.out)
        # Smoke: brain GLBs must carry animations.
        for spec in HERNIATION_BRAINS:
            p = args.out / spec["file"]
            n = glb_animation_count(p)
            if n < 1:
                raise SystemExit(f"{p.name}: expected animations.length >= 1, got {n}")
            print(f"ok {p.name} animations={n}")
    else:
        raise SystemExit(f"unsupported pack: {args.pack}")


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        sys.exit(0)
