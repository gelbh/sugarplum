#!/usr/bin/env python3
"""Post-MeshRenderer seating fixes for canine-internal-organs.

MeshRenderer `--align-ref=b_rib_cage` seats most soft tissue, but IVALA still
needs three authored corrections (see memo 2026-11-14):

1. Lungs share one Unity GO → whole L+R assembly sits off the sagittal midline.
   Center-shift lung GLBs so L/R straddle X=0 (heart/ribs midline).
2. Kidney/adrenal/ureter labels are opposed to lung laterality → swap L↔R files.
3. Pelvic cluster (bladder/uterus/descending colon/medial iliac LNs) authored
   near the ribs → caudal Z shift to the cranial pelvis.

Run on the leaf after MeshRenderer re-ingest, then recompose canine-ivala.

Usage:
  python3 scripts/seat-canine-organs-postbake.py
  python3 scripts/seat-canine-organs-postbake.py --leaf=public/anatomy/canine-internal-organs
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

import numpy as np
import trimesh

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LEAF = ROOT / "public" / "anatomy" / "canine-internal-organs"
DEFAULT_SKEL = ROOT / "public" / "anatomy" / "canine-skeleton"

PELVIC = [
    "bladder_LP",
    "uterus_ovaries_LP",
    "colon_descending_LP",
    "nodes_lymph_medial_iliac_LP",
]
SWAP_PAIRS = [
    ("kidney_L_LP", "kidney_R_LP"),
    ("adrenal_L_LP", "adrenal_R_LP"),
    ("Ureter_L_LP", "Ureter_R_LP"),
]


def load_mesh(path: Path) -> trimesh.Trimesh:
    m = trimesh.load(str(path), force="mesh")
    if isinstance(m, trimesh.Scene):
        geoms = [g for g in m.geometry.values() if len(getattr(g, "vertices", []))]
        if not geoms:
            raise RuntimeError(f"empty scene: {path}")
        m = trimesh.util.concatenate(geoms)
    return m


def shift_glbs(paths: list[Path], delta: np.ndarray) -> None:
    for path in paths:
        scene = trimesh.load(str(path), force="scene")
        for geom in scene.geometry.values():
            geom.vertices = np.asarray(geom.vertices) + delta
            if hasattr(geom, "_cache"):
                geom._cache.clear()
        scene.export(str(path))


def center_lungs(leaf: Path) -> float:
    L = trimesh.util.concatenate(
        [load_mesh(p) for p in sorted(leaf.glob("L_lung*.glb"))]
    )
    R = trimesh.util.concatenate(
        [load_mesh(p) for p in sorted(leaf.glob("R_lung*.glb"))]
    )
    mid = float(0.5 * (L.centroid[0] + R.centroid[0]))
    shift = np.array([-mid, 0.0, 0.0], dtype=float)
    paths = sorted(leaf.glob("*lung*.glb"))
    if not paths:
        raise RuntimeError(f"no lung GLBs under {leaf}")
    shift_glbs(paths, shift)
    print(f"lungs: mid_x={mid:.6f} → shift {shift.tolist()} ({len(paths)} files)")
    return mid


def swap_lr(leaf: Path) -> None:
    for a, b in SWAP_PAIRS:
        pa, pb = leaf / f"{a}.glb", leaf / f"{b}.glb"
        if not pa.exists() or not pb.exists():
            print(f"swap skip missing {a}/{b}")
            continue
        tmp = leaf / f"{a}.glb.swap"
        shutil.move(pa, tmp)
        shutil.move(pb, pa)
        shutil.move(tmp, pb)
        print(f"swapped {a} ↔ {b}")


def shift_pelvic(leaf: Path, skel: Path) -> None:
    pelvis = load_mesh(skel / "Pelvis.glb")
    bladder_path = leaf / "bladder_LP.glb"
    if not bladder_path.exists():
        print("pelvic skip: no bladder_LP.glb")
        return
    bladder = load_mesh(bladder_path)
    # Just inside cranial pelvis edge (Z unflipped by mega rotZ 180).
    target_z = float(pelvis.bounds[1, 2] - 0.001)
    dz = target_z - float(bladder.centroid[2])
    delta = np.array([0.0, 0.0, dz], dtype=float)
    paths = []
    for name in PELVIC:
        p = leaf / f"{name}.glb"
        if p.exists():
            paths.append(p)
        else:
            print(f"pelvic skip missing {name}")
    if not paths:
        return
    shift_glbs(paths, delta)
    print(f"pelvic: dz={dz:.6f} → {[p.name for p in paths]}")


def verify(leaf: Path, skel: Path) -> None:
    ribs = load_mesh(skel / "Ribs.glb")
    smin, smax = ribs.bounds

    def frac_in(mesh: trimesh.Trimesh) -> float:
        v = mesh.vertices
        return float(((v >= smin) & (v <= smax)).all(1).mean())

    L = trimesh.util.concatenate(
        [load_mesh(p) for p in sorted(leaf.glob("L_lung*.glb"))]
    )
    R = trimesh.util.concatenate(
        [load_mesh(p) for p in sorted(leaf.glob("R_lung*.glb"))]
    )
    mid = 0.5 * (L.centroid[0] + R.centroid[0])
    print(
        f"verify lungs: mid_x={mid:.6f} L_x={L.centroid[0]:+.5f} "
        f"R_x={R.centroid[0]:+.5f} in_ribs L={frac_in(L):.3f} R={frac_in(R):.3f}"
    )
    if (leaf / "kidney_L_LP.glb").exists():
        kL = load_mesh(leaf / "kidney_L_LP.glb")
        kR = load_mesh(leaf / "kidney_R_LP.glb")
        print(f"verify kidneys: L_x={kL.centroid[0]:+.5f} R_x={kR.centroid[0]:+.5f}")
    if (leaf / "bladder_LP.glb").exists():
        bladder = load_mesh(leaf / "bladder_LP.glb")
        pelvis = load_mesh(skel / "Pelvis.glb")
        print(
            f"verify bladder z={bladder.centroid[2]:.5f} "
            f"pelvis z=[{pelvis.bounds[0, 2]:.5f},{pelvis.bounds[1, 2]:.5f}]"
        )


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--leaf", type=Path, default=DEFAULT_LEAF)
    p.add_argument("--skeleton", type=Path, default=DEFAULT_SKEL)
    p.add_argument("--skip-swap", action="store_true")
    p.add_argument("--skip-pelvic", action="store_true")
    args = p.parse_args()
    if not args.leaf.is_dir():
        print(f"missing leaf: {args.leaf}", file=sys.stderr)
        sys.exit(1)
    center_lungs(args.leaf)
    if not args.skip_swap:
        swap_lr(args.leaf)
    if not args.skip_pelvic:
        shift_pelvic(args.leaf, args.skeleton)
    verify(args.leaf, args.skeleton)


if __name__ == "__main__":
    main()
