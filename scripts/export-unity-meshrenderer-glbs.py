#!/usr/bin/env python3
"""Export Unity MeshRenderer meshes with albedo/normal textures to per-mesh GLBs.

Works around UnityPy MeshRenderer.export bugs on this IVALA content:
- m_SubsetIndices is None (stock exporter calls min(None))
- ColorRGBA uses .r/.g/.b/.a (stock exporter expects .R/.G/.B/.A)

Bakes each GameObject's world transform into mesh verts, expressed in a
reference bone frame (`--align-ref`, default b_rib_cage). That keeps bone
stubs in the same local frame as `canine-skeleton` while seating soft tissue
anatomically (organs were scale-100 vs bones scale-300 in Unity).

Usage:
  python3 scripts/export-unity-meshrenderer-glbs.py \\
    --unity3d=/tmp/rea-ivala/inner-raw/canine_internal_organs.unity3d \\
    --out=/tmp/rea-ivala/meshrenderer-organs \\
    --align-ref=b_rib_cage \\
    --max-tex-edge=2048
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path
from typing import Optional

import numpy as np
import UnityPy
from PIL import Image
from UnityPy.export.MeshExporter import export_mesh_obj

# IVALA Custom/Anatomy shaders use _DiffuseTexture / _NormalTexture; stock
# URP/Lit uses _MainTex / _BaseMap / _BumpMap.
ALBEDO_KEYS = (
    "_DiffuseTexture",
    "_MainTex",
    "_EmissiveTex",
    "_BaseMap",
    "_BaseColorMap",
)
NORMAL_KEYS = ("_NormalTexture", "_NormalMap", "_NormalTex", "_BumpMap")
# Prefer authored teaching tint over Unity white stubs.
COLOR_KEYS = ("_DiffuseBaseColor", "_Color", "_BaseColor")


def write_text(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf8")


def color_rgba(c) -> tuple[float, float, float, float]:
    if c is None:
        return (0.8, 0.8, 0.8, 1.0)
    if isinstance(c, tuple):
        return c  # type: ignore[return-value]
    r = getattr(c, "r", getattr(c, "R", 0.8))
    g = getattr(c, "g", getattr(c, "G", 0.8))
    b = getattr(c, "b", getattr(c, "B", 0.8))
    a = getattr(c, "a", getattr(c, "A", 1.0))
    return (float(r), float(g), float(b), float(a))


def tonemap_hdr_rgba(rgba: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    """Fit Unity HDR material colors into LDR glTF baseColorFactor.

    IVALA nerves ship `_DiffuseBaseColor≈(2.33,1.54,0.75)`. Clamping washes
    them to near-white; divide-by-max keeps hue for teaching yellows/reds.
    """
    r, g, b, a = rgba
    mx = max(r, g, b, 1e-6)
    if mx > 1.0:
        r, g, b = r / mx, g / mx, b / mx
    return (
        max(0.0, min(1.0, r)),
        max(0.0, min(1.0, g)),
        max(0.0, min(1.0, b)),
        max(0.0, min(1.0, a)),
    )


def material_kd(cols: dict) -> tuple[float, float, float, float]:
    for key in COLOR_KEYS:
        if key in cols and cols[key] is not None:
            return tonemap_hdr_rgba(color_rgba(cols[key]))
    return (0.8, 0.8, 0.8, 1.0)


def quat_to_matrix(q) -> np.ndarray:
    x, y, z, w = q.x, q.y, q.z, q.w
    return np.array(
        [
            [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y), 0],
            [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x), 0],
            [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y), 0],
            [0, 0, 0, 1],
        ],
        dtype=float,
    )


def local_matrix(t) -> np.ndarray:
    p, r, s = t.m_LocalPosition, t.m_LocalRotation, t.m_LocalScale
    if s is None:
        sx = sy = sz = 1.0
    else:
        sx, sy, sz = s.x, s.y, s.z
    S = np.diag([sx, sy, sz, 1.0])
    M = quat_to_matrix(r) @ S
    M[0, 3] = p.x
    M[1, 3] = p.y
    M[2, 3] = p.z
    return M


def world_matrix(t_obj, transforms: dict) -> np.ndarray:
    mats = []
    cur = t_obj
    seen: set[int] = set()
    while cur is not None and cur.path_id not in seen:
        seen.add(cur.path_id)
        t = cur.read()
        mats.append(local_matrix(t))
        if t.m_Father and t.m_Father.path_id:
            cur = transforms.get(t.m_Father.path_id)
        else:
            break
    W = np.eye(4)
    for M in reversed(mats):
        W = W @ M
    return W


def get_mesh_and_transform(renderer):
    go = renderer.m_GameObject.read()
    mesh = None
    transform_obj = None
    # SkinnedMeshRenderer carries m_Mesh on the renderer itself.
    skinned_mesh = getattr(renderer, "m_Mesh", None)
    if skinned_mesh is not None:
        try:
            mesh = skinned_mesh.read()
        except Exception:
            mesh = None
    for pair in go.m_Component:
        pptr = pair.component if hasattr(pair, "component") else pair[1]
        obj = pptr.deref()
        if not obj:
            continue
        if obj.type.name == "Transform":
            transform_obj = obj
        if obj.type.name == "MeshFilter":
            try:
                mf = pptr.read()
                if mf.m_Mesh:
                    mesh = mf.m_Mesh.read()
            except FileNotFoundError:
                # Some filters point at "unity default resources" outside the CSB.
                pass
    return go, mesh, transform_obj


def texenvs(mat) -> dict:
    out = {}
    for key, env in mat.m_SavedProperties.m_TexEnvs:
        if not isinstance(key, str):
            key = key.name
        out[key] = env
    return out


def colors(mat) -> dict:
    out = {}
    for key, val in mat.m_SavedProperties.m_Colors:
        if not isinstance(key, str):
            key = key.name
        out[key] = val
    return out


def save_tex(env_ptr, dest: Path, max_edge: int) -> Optional[str]:
    if not env_ptr or not env_ptr.m_Texture:
        return None
    try:
        if not env_ptr.m_Texture.path_id:
            return None
        tex = env_ptr.m_Texture.read()
    except Exception:
        return None
    img = tex.image
    if img is None:
        return None
    if max(img.size) > max_edge:
        img = img.resize((max_edge, max_edge), Image.Resampling.LANCZOS)
    name = f"{tex.m_Name or 'tex'}.png".replace("/", "_")
    img.save(dest / name, format="PNG")
    return name


def bake_obj_verts(obj_text: str, matrix: np.ndarray) -> str:
    """Rewrite OBJ `v`/`vn` by 4x4 bake; leave vt/faces alone."""
    nmat = np.linalg.inv(matrix[:3, :3]).T
    out_lines = []
    for line in obj_text.splitlines():
        if line.startswith("v "):
            parts = line.split()
            x, y, z = float(parts[1]), float(parts[2]), float(parts[3])
            p = matrix @ np.array([x, y, z, 1.0])
            out_lines.append(f"v {p[0]:.8f} {p[1]:.8f} {p[2]:.8f}")
        elif line.startswith("vn "):
            parts = line.split()
            n = nmat @ np.array(
                [float(parts[1]), float(parts[2]), float(parts[3])],
                dtype=float,
            )
            n_norm = np.linalg.norm(n)
            if n_norm > 0:
                n = n / n_norm
            out_lines.append(f"vn {n[0]:.8f} {n[1]:.8f} {n[2]:.8f}")
        else:
            out_lines.append(line)
    return "\n".join(out_lines) + "\n"


def export_one(
    renderer,
    dest: Path,
    glb_dir: Path,
    max_edge: int,
    bake: Optional[np.ndarray],
) -> dict:
    import trimesh

    dest.mkdir(parents=True, exist_ok=True)
    go, mesh, _transform_obj = get_mesh_and_transform(renderer)
    if not mesh:
        return {"ok": False, "error": "no mesh"}
    mats = renderer.m_Materials or []
    if not mats:
        return {"ok": False, "error": "no materials"}
    mat = mats[0].read()
    envs = texenvs(mat)
    cols = colors(mat)
    kd = material_kd(cols)

    albedo_name = None
    for k in ALBEDO_KEYS:
        if k in envs:
            albedo_name = save_tex(envs[k], dest, max_edge)
            if albedo_name:
                break
    normal_name = None
    for k in NORMAL_KEYS:
        if k in envs:
            normal_name = save_tex(envs[k], dest, max_edge)
            if normal_name:
                break

    mat_name = mat.m_Name or "material"
    obj_text = export_mesh_obj(mesh, [mat_name])
    if bake is not None:
        obj_text = bake_obj_verts(obj_text, bake)
    if "mtllib" not in obj_text:
        obj_text = f"mtllib {mesh.m_Name}.mtl\n" + obj_text
    write_text(dest / f"{mesh.m_Name}.obj", obj_text)

    mtl_lines = [
        f"newmtl {mat_name}",
        f"Kd {kd[0]:.4f} {kd[1]:.4f} {kd[2]:.4f}",
        "Ka 0.2000 0.2000 0.2000",
        "Ks 0.2000 0.2000 0.2000",
        "Ns 20.0000",
        "d 1.0000",
    ]
    if albedo_name:
        mtl_lines.append(f"map_Kd {albedo_name}")
    if normal_name:
        mtl_lines.append(f"map_Bump {normal_name}")
        mtl_lines.append(f"bump {normal_name}")
    write_text(dest / f"{mesh.m_Name}.mtl", "\n".join(mtl_lines) + "\n")

    scene = trimesh.load(str(dest / f"{mesh.m_Name}.obj"), force="scene")
    # Tissue albedos must be dielectric; glTF metallicFactor default is 1.
    for geom in scene.geometry.values():
        mat = getattr(getattr(geom, "visual", None), "material", None)
        if mat is not None and hasattr(mat, "metallicFactor"):
            mat.metallicFactor = 0.0
    # Prefer GameObject name for file identity (mesh name can differ).
    out_name = go.m_Name or mesh.m_Name
    glb_path = glb_dir / f"{out_name}.glb"
    scene.export(str(glb_path))
    return {
        "ok": True,
        "glb": str(glb_path),
        "glb_mb": round(glb_path.stat().st_size / 1e6, 2),
        "albedo": albedo_name,
        "normal": normal_name,
        "material": mat_name,
        "baked": bake is not None,
    }


def resolve_align_ref(env, transforms: dict, align_ref: str):
    """Return world matrix of align-ref GameObject transform."""
    for obj in env.objects:
        if obj.type.name != "GameObject":
            continue
        go = obj.read()
        if go.m_Name != align_ref:
            continue
        for pair in go.m_Component:
            o = pair.component.deref()
            if o and o.type.name == "Transform":
                return world_matrix(o, transforms)
    return None


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--unity3d", required=True)
    p.add_argument("--out", required=True)
    p.add_argument(
        "--only",
        default="",
        help="Comma-separated GameObject names; empty = all MeshRenderers",
    )
    p.add_argument("--max-tex-edge", type=int, default=2048)
    p.add_argument(
        "--align-ref",
        default="b_rib_cage",
        help="Bone GameObject for local-frame bake; 'world' = bake W_go only; "
        "empty = mesh-local (no bake)",
    )
    p.add_argument(
        "--include-skinned",
        action="store_true",
        help="Also export SkinnedMeshRenderer meshes (bind pose / current)",
    )
    args = p.parse_args()

    src = Path(args.unity3d)
    if not src.is_file():
        print(f"missing unity3d: {src}", file=sys.stderr)
        sys.exit(1)
    out = Path(args.out)
    obj_dir = out / "obj"
    glb_dir = out / "glb"
    if out.exists():
        shutil.rmtree(out)
    obj_dir.mkdir(parents=True)
    glb_dir.mkdir(parents=True)

    only = {s.strip() for s in args.only.split(",") if s.strip()} or None
    env = UnityPy.load(str(src))
    transforms = {
        obj.path_id: obj for obj in env.objects if obj.type.name == "Transform"
    }

    # bake_mode: none | world | bone
    bake_mode = "none"
    W_ref_inv = None
    if args.align_ref == "world":
        bake_mode = "world"
        print("align-ref=world (W_go bake on)")
    elif args.align_ref:
        W_ref = resolve_align_ref(env, transforms, args.align_ref)
        if W_ref is None:
            print(f"align-ref not found: {args.align_ref}", file=sys.stderr)
            sys.exit(1)
        W_ref_inv = np.linalg.inv(W_ref)
        bake_mode = "bone"
        print(f"align-ref={args.align_ref} (bone-local bake on)")

    renderer_types = {"MeshRenderer"}
    if args.include_skinned:
        renderer_types.add("SkinnedMeshRenderer")

    results = {}
    for obj in env.objects:
        if obj.type.name not in renderer_types:
            continue
        r = obj.read()
        go, mesh, transform_obj = get_mesh_and_transform(r)
        name = getattr(go, "m_Name", None)
        if not name:
            continue
        if only is not None and name not in only:
            continue
        bake = None
        if transform_obj is not None and bake_mode == "world":
            bake = world_matrix(transform_obj, transforms)
        elif transform_obj is not None and bake_mode == "bone" and W_ref_inv is not None:
            bake = W_ref_inv @ world_matrix(transform_obj, transforms)
        try:
            info = export_one(r, obj_dir / name, glb_dir, args.max_tex_edge, bake)
            results[name] = info
            status = "OK" if info.get("ok") else "FAIL"
            print(status, name, info)
        except Exception as e:
            results[name] = {"ok": False, "error": repr(e)}
            print("FAIL", name, repr(e))

    (out / "export-results.json").write_text(json.dumps(results, indent=2))
    ok = sum(1 for v in results.values() if v.get("ok"))
    print(f"{ok}/{len(results)} ok → {glb_dir}")


if __name__ == "__main__":
    main()
