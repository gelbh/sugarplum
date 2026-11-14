#!/usr/bin/env python3
"""Export UnityFS anatomy AnimationClips to animated glTF (Approach A).

Source of truth: /tmp/rea-ivala/inner-raw/*_animations.unity3d only.
Never use /tmp/rea-ivala/glb/*_animations.glb (mesh-only) as clip sources.
Never route clip packs through scripts/split-anatomy-combined-glb.py.

Herniation: morph targets + weight tracks from blend-shape meshes.
Gait (canine / equine): skinned mesh + StreamedClip/ConstantClip → node TRS.

If muscle-clip → TRS decode is blocked for a gait pack, stop and ask before
changing packaging or the player contract. Fallback for that pack only:
AssetRipper → Blender → animated GLB, then Path A ingest. Do not invent a
different clip contract.

Usage:
  python3 scripts/export-unity-anatomy-clips.py \\
    --pack=herniation \\
    --unity=/tmp/rea-ivala/inner-raw/herniation_types_animations.unity3d \\
    --out=/tmp/rea-ivala/drop/herniation-types-animations

  python3 scripts/export-unity-anatomy-clips.py \\
    --pack=canine-gait \\
    --unity=/tmp/rea-ivala/inner-raw/canine_gait_animations.unity3d \\
    --out=/tmp/rea-ivala/drop/canine-gait-animations

  python3 scripts/export-unity-anatomy-clips.py \\
    --pack=equine-gait \\
    --unity=/tmp/rea-ivala/inner-raw/equine_gait_animations.unity3d \\
    --out=/tmp/rea-ivala/drop/equine-gait-animations
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
import zlib
from collections import defaultdict
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

# Gait packs: primary SMR mesh names + optional extras sharing the same skin.
GAIT_PACKS = {
    "canine-gait": {
        "meshes": ("canine_surface_LO_UVd",),
        "glb": "canine_gait.glb",
        "credits_title": "Canine gait animations",
        "unity_hint": "canine_gait_animations.unity3d",
    },
    "equine-gait": {
        # BODY + HOOVES only (skip hair / eyes / tears: cosmetics, large).
        "meshes": ("horse_BODY", "horse_HOOVES"),
        "glb": "equine_gait.glb",
        "credits_title": "Equine gait animations",
        "unity_hint": "equine_gait_animations.unity3d",
    },
}

# Core locomotion (+ idle). Fidgets / lameness included when present in the bundle.
GAIT_CORE_CLIP_IDS = frozenset(
    {
        "walk",
        "trot",
        "canter",
        "canter-left-lead",
        "canter-right-lead",
        "gallop",
        "amble",
        "pace",
        "idle",
    }
)


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


def _quat(q) -> tuple[float, float, float, float]:
    return (
        float(getattr(q, "X", getattr(q, "x"))),
        float(getattr(q, "Y", getattr(q, "y"))),
        float(getattr(q, "Z", getattr(q, "z"))),
        float(getattr(q, "W", getattr(q, "w"))),
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


class GlbBuilder:
    """Minimal glTF-2 GLB writer (buffers grow as accessors are added)."""

    def __init__(self) -> None:
        self.bin_parts: list[bytes] = []
        self.buffer_views: list[dict] = []
        self.accessors: list[dict] = []
        self.meshes: list[dict] = []
        self.nodes: list[dict] = []
        self.skins: list[dict] = []
        self.animations: list[dict] = []

    def add_blob(
        self,
        raw: bytes,
        *,
        target: int | None = None,
        byte_stride: int | None = None,
    ) -> int:
        pad = (4 - (len(raw) % 4)) % 4
        offset = sum(len(p) for p in self.bin_parts)
        self.bin_parts.append(raw + (b"\x00" * pad))
        bv: dict = {"buffer": 0, "byteOffset": offset, "byteLength": len(raw)}
        if target is not None:
            bv["target"] = target
        if byte_stride is not None:
            bv["byteStride"] = byte_stride
        self.buffer_views.append(bv)
        return len(self.buffer_views) - 1

    def add_accessor(
        self,
        data: np.ndarray,
        *,
        component_type: int,
        type_name: str,
        target: int | None = None,
        normalized: bool = False,
        count_override: int | None = None,
    ) -> int:
        raw = np.ascontiguousarray(data).tobytes()
        stride = None
        if data.ndim == 2 and component_type == 5126:
            stride = int(data.shape[1] * data.dtype.itemsize)
        elif data.ndim == 2 and component_type in (5121, 5123):
            stride = int(data.shape[1] * data.dtype.itemsize)
        bv = self.add_blob(raw, target=target, byte_stride=stride)
        count = int(count_override if count_override is not None else data.shape[0])
        acc: dict = {
            "bufferView": bv,
            "componentType": component_type,
            "count": count,
            "type": type_name,
        }
        if normalized:
            acc["normalized"] = True
        if component_type == 5126:
            shaped = data.reshape(data.shape[0], -1) if data.ndim > 1 else data
            mn, mx = _accessor_minmax(shaped)
            if type_name == "SCALAR":
                acc["min"] = [mn[0]]
                acc["max"] = [mx[0]]
            else:
                acc["min"] = mn
                acc["max"] = mx
        self.accessors.append(acc)
        return len(self.accessors) - 1

    def write(self, path: Path) -> None:
        blob = b"".join(self.bin_parts)
        gltf: dict = {
            "asset": {
                "version": "2.0",
                "generator": "sugarplum-export-unity-anatomy-clips",
            },
            "buffers": [{"byteLength": len(blob)}],
            "bufferViews": self.buffer_views,
            "accessors": self.accessors,
            "meshes": self.meshes,
            "nodes": self.nodes,
            "scenes": [{"nodes": [0]}],
            "scene": 0,
        }
        if self.skins:
            gltf["skins"] = self.skins
        if self.animations:
            gltf["animations"] = self.animations

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
    b = GlbBuilder()
    pos_acc = b.add_accessor(positions, component_type=5126, type_name="VEC3", target=34962)
    nor_acc = b.add_accessor(normals, component_type=5126, type_name="VEC3", target=34962)
    idx_acc = b.add_accessor(
        indices.astype(np.uint32, copy=False),
        component_type=5125,
        type_name="SCALAR",
        target=34963,
    )
    targets = []
    for delta in morph_deltas:
        targets.append(
            {
                "POSITION": b.add_accessor(
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
    b.meshes.append(mesh)
    b.nodes.append({"name": path.stem, "mesh": 0})

    if animation_name and morph_names:
        n = len(morph_names)
        times = np.arange(n, dtype=np.float32) / float(sample_rate)
        weights = np.zeros((n, n), dtype=np.float32)
        for i in range(n):
            weights[i, i] = 1.0
        time_acc = b.add_accessor(times, component_type=5126, type_name="SCALAR")
        weight_acc = b.add_accessor(
            weights.reshape(-1),
            component_type=5126,
            type_name="SCALAR",
            count_override=n,
        )
        b.animations.append(
            {
                "name": animation_name,
                "samplers": [
                    {"input": time_acc, "interpolation": "LINEAR", "output": weight_acc}
                ],
                "channels": [{"sampler": 0, "target": {"node": 0, "path": "weights"}}],
            }
        )
    b.write(path)


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


def _crc32_path(path: str) -> int:
    return zlib.crc32(path.encode("utf-8")) & 0xFFFFFFFF


def _u32_to_f32(u: int) -> float:
    return struct.unpack("<f", struct.pack("<I", u & 0xFFFFFFFF))[0]


def _binding_width(binding) -> int:
    tid = 4 if binding.typeID is None else int(binding.typeID)
    if tid == 4:
        if binding.attribute == 2:
            return 4
        if binding.attribute in (1, 3, 4):
            return 3
    return 1


def _parse_streamed_frames(data_u32: list[int]) -> list[tuple[float, list[tuple[int, float]]]]:
    """Parse Unity StreamedClip uint32 payload into (time, [(curveIndex, value)])."""
    frames: list[tuple[float, list[tuple[int, float]]]] = []
    i = 0
    n = len(data_u32)
    while i + 2 <= n:
        time = _u32_to_f32(data_u32[i])
        count = int(data_u32[i + 1])
        i += 2
        keys: list[tuple[int, float]] = []
        for _ in range(count):
            if i + 5 > n:
                break
            idx = int(data_u32[i])
            # AssetStudio StreamedCurveKey: value = coeff[3]
            value = _u32_to_f32(data_u32[i + 4])
            keys.append((idx, value))
            i += 5
        frames.append((time, keys))
        if time > 1e30:
            break
    return frames


def _matrix4_to_column_major(m) -> list[float]:
    """Unity Matrix4x4f e_row_col → glTF column-major float16."""
    return [
        float(m.e00),
        float(m.e10),
        float(m.e20),
        float(m.e30),
        float(m.e01),
        float(m.e11),
        float(m.e21),
        float(m.e31),
        float(m.e02),
        float(m.e12),
        float(m.e22),
        float(m.e32),
        float(m.e03),
        float(m.e13),
        float(m.e23),
        float(m.e33),
    ]


def _read_skinned_attribs(mesh) -> tuple[np.ndarray, np.ndarray]:
    """JOINTS_0 (ushort4) + WEIGHTS_0 (float4) from Unity VertexData streams."""
    vd = mesh.m_VertexData
    n = int(vd.m_VertexCount)
    channels = vd.m_Channels
    data = vd.m_DataSize
    if not isinstance(data, (bytes, bytearray)):
        data = bytes(data)

    # Channel layout observed on IVALA gait packs:
    # stream0 stride 40 (pos/nor/tan), stream1 stride 8 (uv),
    # stream2 stride 32 (float4 weights + uint32x4 indices).
    by_stream: dict[int, list] = defaultdict(list)
    for ch in channels:
        if ch.dimension == 0:
            continue
        by_stream[int(ch.stream)].append(ch)

    FORMAT_SIZE = {
        0: 4,
        1: 2,
        2: 1,
        3: 1,
        4: 2,
        5: 2,
        6: 1,
        7: 1,
        8: 4,
        9: 4,
        10: 4,
        11: 4,
    }

    stream_meta: dict[int, tuple[int, int]] = {}  # stream → (offset, stride)
    offset = 0
    for s in sorted(by_stream):
        stride = 0
        for ch in by_stream[s]:
            sz = FORMAT_SIZE.get(int(ch.format), 4) * int(ch.dimension)
            stride = max(stride, int(ch.offset) + sz)
        # 16-byte align between streams (Unity VertexData).
        align = (16 - (offset % 16)) % 16
        offset += align
        stream_meta[s] = (offset, stride)
        offset += n * stride

    # Prefer float4 weights + uint32x4 indices (canine / horse_BODY).
    weight_ch = None
    index_ch = None
    for ch in channels:
        if int(ch.dimension) != 4:
            continue
        if int(ch.format) == 0 and weight_ch is None:
            weight_ch = ch
        if int(ch.format) == 10 and index_ch is None:
            index_ch = ch

    weights = np.zeros((n, 4), dtype=np.float32)
    joints = np.zeros((n, 4), dtype=np.uint16)

    if weight_ch is not None and index_ch is not None:
        w_off, w_stride = stream_meta[int(weight_ch.stream)]
        i_off, i_stride = stream_meta[int(index_ch.stream)]
        for vi in range(n):
            wb = w_off + vi * w_stride + int(weight_ch.offset)
            ib = i_off + vi * i_stride + int(index_ch.offset)
            weights[vi] = struct.unpack_from("<4f", data, wb)
            joints[vi] = struct.unpack_from("<4I", data, ib)
        sums = weights.sum(axis=1, keepdims=True)
        sums[sums <= 0] = 1.0
        weights = weights / sums
        return joints, weights.astype(np.float32)

    # horse_HOOVES: single uint32 bone index per vertex (rigid weight 1).
    rigid_ch = None
    for ch in channels:
        if int(ch.format) == 10 and int(ch.dimension) == 1:
            rigid_ch = ch
            break
    if rigid_ch is None:
        raise SystemExit(
            f"mesh {mesh.m_Name}: missing blend weight/index vertex channels "
            "(muscle-clip skeletal export needs skinned mesh attributes)"
        )
    i_off, i_stride = stream_meta[int(rigid_ch.stream)]
    for vi in range(n):
        ib = i_off + vi * i_stride + int(rigid_ch.offset)
        joints[vi, 0] = struct.unpack_from("<I", data, ib)[0]
        weights[vi, 0] = 1.0
    return joints, weights.astype(np.float32)


def _load_gait_scene(env):
    transforms = {}
    for obj in env.objects:
        if obj.type.name == "Transform":
            transforms[obj.path_id] = obj.read()

    children: dict[int, list[int]] = defaultdict(list)
    for pid, tr in transforms.items():
        father = tr.m_Father
        if father and father.path_id:
            children[father.path_id].append(pid)

    def go_name(tr) -> str:
        return tr.m_GameObject.read().m_Name

    animator = None
    for obj in env.objects:
        if obj.type.name == "Animator":
            animator = obj.read()
            break
    if animator is None:
        raise SystemExit("Animator missing from gait Unity bundle")

    anim_go = animator.m_GameObject.path_id
    anim_tr = next(
        pid for pid, tr in transforms.items() if tr.m_GameObject.path_id == anim_go
    )

    paths: dict[int, str] = {}

    def walk(pid: int, prefix: str) -> None:
        paths[pid] = prefix
        for child in children.get(pid, []):
            name = go_name(transforms[child])
            child_path = f"{prefix}/{name}" if prefix else name
            walk(child, child_path)

    walk(anim_tr, "")
    crc_to_path = {_crc32_path(p): p for p in paths.values() if p}

    smrs = []
    for obj in env.objects:
        if obj.type.name == "SkinnedMeshRenderer":
            smrs.append(obj.read())

    labels: dict[str, str] = {}
    for obj in env.objects:
        if obj.type.name != "TextAsset":
            continue
        ta = obj.read()
        if "ContentLocalization" not in (ta.m_Name or ""):
            continue
        raw = ta.m_Script
        text = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else str(raw)
        for line in text.splitlines():
            if "PlayButton." not in line:
                continue
            parts = line.split(",")
            if len(parts) < 2:
                continue
            key = parts[0].strip()
            label = parts[1].strip().strip('"')
            # PlayButton.* short name, or full clip name on AnimationPanel2 keys.
            short = key.rsplit(".", 1)[-1]
            labels[short] = label

    return {
        "transforms": transforms,
        "children": children,
        "paths": paths,
        "crc_to_path": crc_to_path,
        "anim_tr": anim_tr,
        "smrs": smrs,
        "go_name": go_name,
        "labels": labels,
    }


def _clip_id_from_name(name: str) -> str:
    stem = name[:-6] if name.endswith("_baked") else name
    if stem.startswith("1_"):
        stem = stem[2:]
    if stem.startswith("A_"):
        stem = stem[2:]
    out = []
    for i, ch in enumerate(stem):
        if ch == "_":
            out.append("-")
        elif ch.isupper() and i > 0 and stem[i - 1] != "_":
            out.append("-")
            out.append(ch.lower())
        else:
            out.append(ch.lower())
    return "".join(out).replace("--", "-")


def _label_for_clip(name: str, labels: dict[str, str]) -> str:
    stem = name[:-6] if name.endswith("_baked") else name
    for prefix in ("1_", "A_"):
        if stem.startswith(prefix):
            stem = stem[len(prefix) :]
    for key in (stem, stem.replace("_", ""), name, name.replace("_", "")):
        if key in labels:
            return labels[key]
    head = stem.split("_")[0]
    if head in labels and "_" not in stem:
        return labels[head]
    return stem.replace("_", " ")


def _decode_clip_bone_tracks(clip, crc_to_path: dict[int, str]):
    """Return {bone_path: {translation|rotation|scale: (times, values)}}."""
    bindings = clip.m_ClipBindingConstant.genericBindings
    curve_bindings = []
    for b in bindings:
        curve_bindings.extend([b] * _binding_width(b))

    muscle = clip.m_MuscleClip
    clip_data = muscle.m_Clip.data
    streamed = clip_data.m_StreamedClip
    const = list(clip_data.m_ConstantClip.data)
    values = [0.0] * len(curve_bindings)
    base = int(streamed.curveCount)
    for i, v in enumerate(const):
        if base + i < len(values):
            values[base + i] = float(v)

    frames = _parse_streamed_frames(list(streamed.data))
    curve_meta: list[tuple[str, int, int] | None] = [None] * len(curve_bindings)
    component_cursor: dict[tuple[int, int], int] = defaultdict(int)
    for ci, b in enumerate(curve_bindings):
        path = crc_to_path.get(int(b.path))
        if path is None:
            continue
        attr = int(b.attribute)
        if attr not in (1, 2, 3):
            continue
        key = (int(b.path), attr)
        comp = component_cursor[key]
        component_cursor[key] = comp + 1
        curve_meta[ci] = (path, attr, comp)

    track_times: dict[tuple[str, int], list[float]] = defaultdict(list)
    track_vals: dict[tuple[str, int], list[list[float]]] = defaultdict(list)

    def snapshot(t: float) -> None:
        scratch: dict[tuple[str, int], list[float]] = {}
        for ci, meta in enumerate(curve_meta):
            if meta is None:
                continue
            path, attr, comp = meta
            key = (path, attr)
            width = 4 if attr == 2 else 3
            if key not in scratch:
                scratch[key] = [0.0] * width
            if comp < width:
                scratch[key][comp] = values[ci]
        for key, vec in scratch.items():
            track_times[key].append(t)
            track_vals[key].append(list(vec))

    for fi, (t, keys) in enumerate(frames):
        for idx, val in keys:
            if 0 <= idx < len(values):
                values[idx] = val
        if fi == 0 or t < -1e30 or t > 1e30:
            continue
        snapshot(float(t))

    # Avoid 180° quaternion flips between consecutive keys.
    for (path, attr), series in list(track_vals.items()):
        if attr != 2 or len(series) < 2:
            continue
        prev = np.asarray(series[0], dtype=np.float64)
        fixed = [series[0]]
        for q in series[1:]:
            cur = np.asarray(q, dtype=np.float64)
            if float(np.dot(prev, cur)) < 0.0:
                cur = -cur
            fixed.append(cur.astype(float).tolist())
            prev = cur
        track_vals[(path, attr)] = fixed

    out: dict[str, dict[str, tuple[np.ndarray, np.ndarray]]] = defaultdict(dict)
    attr_name = {1: "translation", 2: "rotation", 3: "scale"}
    for (path, attr), times in track_times.items():
        name = attr_name.get(attr)
        if not name:
            continue
        t_arr = np.asarray(times, dtype=np.float32)
        v_arr = np.asarray(track_vals[(path, attr)], dtype=np.float32)
        out[path][name] = (t_arr, v_arr)
    return out, float(muscle.m_StopTime)


def export_gait(pack: str, unity_path: Path, out_dir: Path) -> None:
    cfg = GAIT_PACKS[pack]
    out_dir.mkdir(parents=True, exist_ok=True)
    env = UnityPy.load(str(unity_path))
    scene = _load_gait_scene(env)
    transforms = scene["transforms"]
    paths = scene["paths"]
    crc_to_path = scene["crc_to_path"]
    go_name = scene["go_name"]
    labels = scene["labels"]
    smrs = scene["smrs"]

    wanted = list(cfg["meshes"])
    chosen = []
    for mesh_name in wanted:
        hit = None
        for smr in smrs:
            mesh = smr.m_Mesh.read() if smr.m_Mesh and smr.m_Mesh.path_id else None
            if mesh and mesh.m_Name == mesh_name:
                hit = (smr, mesh)
                break
        if hit is None:
            raise SystemExit(f"{pack}: SkinnedMeshRenderer for {mesh_name} missing")
        chosen.append(hit)

    primary_smr, _ = chosen[0]
    bone_pids = [b.path_id for b in primary_smr.m_Bones]
    if not bone_pids:
        raise SystemExit(f"{pack}: empty bone list on primary SMR")

    for smr, mesh in chosen[1:]:
        other = [b.path_id for b in smr.m_Bones]
        if other != bone_pids:
            raise SystemExit(
                f"{pack}: {mesh.m_Name} bone list differs from primary "
                f"({len(other)} vs {len(bone_pids)})"
            )

    # Include bone ancestors so local TRS parents stay intact under the Animator.
    needed = set(bone_pids)
    for pid in list(needed):
        cur = pid
        while True:
            father = transforms[cur].m_Father
            if not father or not father.path_id:
                break
            if father.path_id == scene["anim_tr"]:
                break
            needed.add(father.path_id)
            cur = father.path_id

    ordered: list[int] = []

    def order_walk(pid: int) -> None:
        if pid in needed:
            ordered.append(pid)
        for child in scene["children"].get(pid, []):
            order_walk(child)

    order_walk(scene["anim_tr"])
    pid_to_node = {pid: i for i, pid in enumerate(ordered)}

    b = GlbBuilder()
    # Skeleton first (0..N-1), then shift +1 under a scene root for ingest node lookup.
    skel_nodes: list[dict] = []
    for pid in ordered:
        tr = transforms[pid]
        node: dict = {
            "name": go_name(tr),
            "translation": list(_vec3(tr.m_LocalPosition)),
            "rotation": list(_quat(tr.m_LocalRotation)),
            "scale": list(_vec3(tr.m_LocalScale)),
        }
        kids = [
            pid_to_node[c]
            for c in scene["children"].get(pid, [])
            if c in pid_to_node
        ]
        if kids:
            node["children"] = kids
        skel_nodes.append(node)

    scene_node_name = Path(cfg["glb"]).stem
    b.nodes = [{"name": scene_node_name, "children": []}]
    for node in skel_nodes:
        if "children" in node:
            node = {**node, "children": [c + 1 for c in node["children"]]}
        b.nodes.append(node)
    pid_to_node = {pid: i + 1 for pid, i in pid_to_node.items()}
    top: list[int] = []
    for pid in ordered:
        father = transforms[pid].m_Father
        if not father or father.path_id not in pid_to_node:
            top.append(pid_to_node[pid])
    b.nodes[0]["children"] = list(top)

    joint_indices = [pid_to_node[pid] for pid in bone_pids]
    primary_mesh = chosen[0][1]
    ibm = np.asarray(
        [_matrix4_to_column_major(m) for m in primary_mesh.m_BindPose],
        dtype=np.float32,
    )
    if len(ibm) != len(bone_pids):
        raise SystemExit(
            f"{pack}: bindPose count {len(ibm)} != bones {len(bone_pids)}"
        )
    ibm_acc = b.add_accessor(ibm, component_type=5126, type_name="MAT4")
    skin_index = len(b.skins)
    b.skins.append(
        {
            "name": "Armature",
            "joints": joint_indices,
            "inverseBindMatrices": ibm_acc,
        }
    )

    mesh_node_indices = []
    for smr, mesh in chosen:
        pos, nor, idx = parse_obj(mesh.export())
        joints, weights = _read_skinned_attribs(mesh)
        if len(pos) != len(joints):
            raise SystemExit(
                f"{mesh.m_Name}: OBJ verts {len(pos)} != skin verts {len(joints)}"
            )
        pos_acc = b.add_accessor(pos, component_type=5126, type_name="VEC3", target=34962)
        nor_acc = b.add_accessor(nor, component_type=5126, type_name="VEC3", target=34962)
        j_acc = b.add_accessor(
            joints.astype(np.uint16), component_type=5123, type_name="VEC4", target=34962
        )
        w_acc = b.add_accessor(weights, component_type=5126, type_name="VEC4", target=34962)
        idx_acc = b.add_accessor(
            idx.astype(np.uint32), component_type=5125, type_name="SCALAR", target=34963
        )
        mesh_index = len(b.meshes)
        b.meshes.append(
            {
                "name": mesh.m_Name,
                "primitives": [
                    {
                        "attributes": {
                            "POSITION": pos_acc,
                            "NORMAL": nor_acc,
                            "JOINTS_0": j_acc,
                            "WEIGHTS_0": w_acc,
                        },
                        "indices": idx_acc,
                    }
                ],
            }
        )
        node_index = len(b.nodes)
        b.nodes.append({"name": mesh.m_Name, "mesh": mesh_index, "skin": skin_index})
        mesh_node_indices.append(node_index)
        print(
            f"mesh {mesh.m_Name} verts={len(pos)} tris={len(idx)//3} joints={len(bone_pids)}"
        )

    b.nodes[0]["children"] = list(b.nodes[0].get("children") or []) + mesh_node_indices

    node_path = {pid_to_node[pid]: paths[pid] for pid in bone_pids if pid in paths}
    for pid, node_i in pid_to_node.items():
        if pid in paths and paths[pid]:
            node_path[node_i] = paths[pid]
    path_to_node = {p: i for i, p in node_path.items()}

    clips_meta = []
    clip_objs = []
    for obj in env.objects:
        if obj.type.name == "AnimationClip":
            clip_objs.append(obj.read())
    clip_objs.sort(key=lambda c: c.m_Name)

    exported = 0
    for clip in clip_objs:
        name = clip.m_Name
        if name.endswith("NeutralPose") or name.startswith("1_Neutral") or name.startswith("A_Neutral"):
            continue
        try:
            tracks, _stop = _decode_clip_bone_tracks(clip, crc_to_path)
        except Exception as exc:  # noqa: BLE001 - surface decode failures clearly
            raise SystemExit(
                f"muscle-clip decode failed for {name}: {exc}\n"
                "Fallback (stop-and-ask): AssetRipper → Blender → animated GLB; "
                "do not change the player contract."
            ) from exc

        samplers = []
        channels = []
        for bone_path, channels_map in tracks.items():
            node_i = path_to_node.get(bone_path)
            if node_i is None:
                continue
            for path_name, (times, vals) in channels_map.items():
                if len(times) == 0:
                    continue
                t_acc = b.add_accessor(times, component_type=5126, type_name="SCALAR")
                type_name = "VEC4" if path_name == "rotation" else "VEC3"
                v_acc = b.add_accessor(vals, component_type=5126, type_name=type_name)
                s_i = len(samplers)
                samplers.append(
                    {"input": t_acc, "interpolation": "LINEAR", "output": v_acc}
                )
                channels.append(
                    {"sampler": s_i, "target": {"node": node_i, "path": path_name}}
                )
        if not channels:
            print(f"skip {name}: no TRS channels after decode")
            continue
        b.animations.append({"name": name, "samplers": samplers, "channels": channels})
        exported += 1
        clip_id = _clip_id_from_name(name)
        clips_meta.append(
            {
                "id": clip_id,
                "label": _label_for_clip(name, labels),
                "animation": name,
                "loop": True,
            }
        )
        print(f"clip {name} channels={len(channels)}")

    if exported < 1:
        raise SystemExit(
            f"{pack}: no animations exported (muscle-clip decode produced empty tracks).\n"
            "Fallback (stop-and-ask): AssetRipper → Blender → animated GLB; "
            "do not change the player contract."
        )

    # Core locomotion first in clips.json; fidgets / lameness after.
    def sort_key(row: dict) -> tuple[int, str]:
        cid = row["id"]
        core = 0 if cid in GAIT_CORE_CLIP_IDS or any(
            cid.startswith(c) for c in ("walk", "trot", "canter", "gallop", "amble", "pace", "idle")
        ) else 1
        return (core, row["label"])

    clips_meta.sort(key=sort_key)

    glb_path = out_dir / cfg["glb"]
    b.write(glb_path)
    n_anim = glb_animation_count(glb_path)
    print(f"wrote {glb_path} animations={n_anim}")
    if n_anim < 1:
        raise SystemExit(f"{glb_path.name}: expected animations.length >= 1, got {n_anim}")

    clips_path = out_dir / "clips.json"
    clips_path.write_text(json.dumps(clips_meta, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {clips_path} clips={len(clips_meta)}")

    credits = f"""# {cfg['credits_title']}: credits

Mesh and animation source: Ivala GmbH / IVALA Learn ({cfg['credits_title'].lower()}).

## License

Commercial use and redistribution in Sugarplum under letter ref
**IVALA/SPL/2026-001** (dated 14 November 2026), confirmed for this pack and
the wider listed catalog by email 2026-11-13. Same-origin hosting; Sugarplum
scene manifests; redistribute asset files to end users as part of the app.
Royalty-free, worldwide, perpetual, non-exclusive. Attribution optional;
“Powered by IVALA” appreciated.

Rights memo: `.superpowers/memos/2026-11-13-ivala-redistribution-rights.md`
(letterhead under `.superpowers/memos/ivala/`).

Export: `scripts/export-unity-anatomy-clips.py` from
`inner-raw/{cfg['unity_hint']}` (Approach A; skinned StreamedClip → TRS;
not mesh-only GLBs).

Ingest: `scripts/ingest-anatomy-pack.mjs` (local drop only; Path A).
"""
    (out_dir / "CREDITS.md").write_text(credits, encoding="utf-8")
    print(f"wrote {out_dir / 'CREDITS.md'}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--pack",
        required=True,
        choices=("herniation", "canine-gait", "equine-gait"),
    )
    ap.add_argument("--unity", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()

    if not args.unity.is_file():
        raise SystemExit(f"Unity bundle missing: {args.unity}")

    if args.pack == "herniation":
        export_herniation(args.unity, args.out)
        for spec in HERNIATION_BRAINS:
            p = args.out / spec["file"]
            n = glb_animation_count(p)
            if n < 1:
                raise SystemExit(f"{p.name}: expected animations.length >= 1, got {n}")
            print(f"ok {p.name} animations={n}")
    elif args.pack in GAIT_PACKS:
        export_gait(args.pack, args.unity, args.out)
    else:
        raise SystemExit(f"unsupported pack: {args.pack}")


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        sys.exit(0)
