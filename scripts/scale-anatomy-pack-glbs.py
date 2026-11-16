#!/usr/bin/env python3
"""Uniform-scale / rotate / translate all .glb files under a directory (trimesh).

Transforms are about the origin unless --translate is set (applied last).
Order: scale → rotate-z → translate.

Usage:
  python3 scripts/scale-anatomy-pack-glbs.py --dir=/path --scale=0.01
  python3 scripts/scale-anatomy-pack-glbs.py --dir=/path --scale=1 --rotate-z=180
  python3 scripts/scale-anatomy-pack-glbs.py --dir=/path --scale=1 --translate=0,0.01,0
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import numpy as np
import trimesh


def transform_dir(
    dir_path: Path,
    scale: float,
    rotate_z_deg: float,
    translate: tuple[float, float, float] | None,
) -> int:
    if scale <= 0:
        raise SystemExit(f"scale must be > 0, got {scale}")
    if (
        scale == 1
        and rotate_z_deg == 0
        and (translate is None or translate == (0.0, 0.0, 0.0))
    ):
        return 0
    rad = math.radians(rotate_z_deg)
    rot = (
        trimesh.transformations.rotation_matrix(rad, [0, 0, 1])
        if rotate_z_deg
        else None
    )
    n = 0
    for glb in sorted(dir_path.rglob("*.glb")):
        scene = trimesh.load(glb, force="scene")
        if scale != 1:
            scene.apply_scale(scale)
        if rot is not None:
            scene.apply_transform(rot)
        if translate and translate != (0.0, 0.0, 0.0):
            scene.apply_translation(translate)
        # Bake graph transforms into verts. trimesh apply_* leaves scale/rot on
        # the node matrix; Three.js then depends on that matrix, and export
        # names like `foo.obj` miss scene.json `foo` lookups.
        meshes = []
        for node_name in scene.graph.nodes_geometry:
            T, geom_name = scene.graph[node_name]
            g = scene.geometry[geom_name].copy()
            g.apply_transform(T)
            meshes.append(g)
        if not meshes:
            continue
        baked = (
            trimesh.util.concatenate(meshes) if len(meshes) > 1 else meshes[0]
        )
        out = trimesh.Scene()
        name = glb.stem
        out.add_geometry(baked, node_name=name, geom_name=name)
        out.export(glb)
        n += 1
    return n


def parse_translate(raw: str | None) -> tuple[float, float, float] | None:
    if raw is None or raw == "":
        return None
    parts = raw.split(",")
    if len(parts) != 3:
        raise SystemExit(f"Bad --translate={raw}; expected x,y,z")
    vals = tuple(float(p) for p in parts)
    return (vals[0], vals[1], vals[2])


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--dir", required=True)
    p.add_argument("--scale", type=float, default=1.0)
    p.add_argument(
        "--rotate-z",
        type=float,
        default=0.0,
        help="Degrees about world +Z after scale (IVALA canine: 180 → head-up)",
    )
    p.add_argument(
        "--translate",
        default=None,
        help="x,y,z translation after scale/rotate",
    )
    args = p.parse_args()
    d = Path(args.dir)
    if not d.is_dir():
        print(f"missing dir: {d}", file=sys.stderr)
        sys.exit(1)
    translate = parse_translate(args.translate)
    n = transform_dir(d, args.scale, args.rotate_z, translate)
    parts = [f"touched {n} glb(s)"]
    if args.scale != 1:
        parts.append(f"scale={args.scale}")
    if args.rotate_z:
        parts.append(f"rotate_z={args.rotate_z}")
    if translate and translate != (0.0, 0.0, 0.0):
        parts.append(f"translate={translate}")
    print(", ".join(parts))


if __name__ == "__main__":
    main()
