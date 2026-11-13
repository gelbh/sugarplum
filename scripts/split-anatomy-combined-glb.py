#!/usr/bin/env python3
"""Split a combined anatomy GLB into one GLB per named mesh (local drop helper).

Usage:
  python3 scripts/split-anatomy-combined-glb.py \\
    --glb=/tmp/rea-ivala/glb/canine_heart_surface_topology.glb \\
    --out=/tmp/rea-ivala/drop/canine-heart-surface-topology

Skips Unity junk: Cube, TargetedCamera, BezierCurve*.
Requires trimesh. Not run in CI; staging drops stay under /tmp.
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path


JUNK_EXACT = {"cube", "targetedcamera"}


def is_junk(name: str) -> bool:
    stem = name.rsplit(".", 1)[0]
    lower = stem.lower()
    if lower in JUNK_EXACT:
        return True
    if lower.startswith("beziercurve"):
        return True
    return False


def split_glb(glb_path: Path, out_dir: Path) -> tuple[int, int]:
    import trimesh

    scene = trimesh.load(str(glb_path), force="scene")
    if not isinstance(scene, trimesh.Scene):
        raise SystemExit(f"Expected Scene, got {type(scene).__name__}: {glb_path}")

    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)

    kept = 0
    skipped = 0
    # Prefer geometry names (mesh identities from REA export).
    for name, geom in scene.geometry.items():
        if is_junk(name):
            skipped += 1
            print(f"skip {name}")
            continue
        stem = Path(name).stem
        # URL-safe filename; THREE node name stays the geometry stem via Scene key.
        safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in stem)
        safe = safe.strip("_") or "mesh"
        out_path = out_dir / f"{safe}.glb"
        if out_path.exists():
            raise SystemExit(f"Duplicate mesh stem after filter: {safe}")
        single = trimesh.Scene({safe: geom})
        single.export(str(out_path))
        kept += 1
        print(f"keep {stem} -> {out_path.name}")

    return kept, skipped


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Split combined anatomy GLB into per-mesh drop GLBs",
    )
    parser.add_argument("--glb", required=True, help="Path to combined .glb")
    parser.add_argument("--out", required=True, help="Output drop directory")
    args = parser.parse_args()

    glb_path = Path(args.glb).resolve()
    out_dir = Path(args.out).resolve()
    if not glb_path.is_file():
        raise SystemExit(f"Missing GLB: {glb_path}")

    kept, skipped = split_glb(glb_path, out_dir)
    print(f"{glb_path.name}: kept={kept} skipped={skipped} -> {out_dir}")
    if kept == 0:
        raise SystemExit("No meshes kept")


if __name__ == "__main__":
    main()
