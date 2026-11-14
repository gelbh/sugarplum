/**
 * One-off: write public/anatomy/clip-fixture/model.glb with a named Pulse animation.
 * Run: node scripts/make-clip-fixture.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AnimationClip,
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  Scene,
  VectorKeyframeTrack,
} from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

// three GLTFExporter (binary) uses FileReader; Node 24 has no DOM FileReader.
if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class FileReader {
    result = null;
    onloadend = null;
    onerror = null;
    readAsArrayBuffer(blob) {
      Promise.resolve(blob.arrayBuffer())
        .then((buf) => {
          this.result = buf;
          this.onloadend?.({ target: this });
        })
        .catch((err) => {
          this.onerror?.({ target: this, error: err });
        });
    }
  };
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public", "anatomy", "clip-fixture");

const mesh = new Mesh(
  new BoxGeometry(1, 1, 1),
  new MeshStandardMaterial({ color: 0x6c8cff }),
);
mesh.name = "Root";
const scene = new Scene();
scene.add(mesh);

const track = new VectorKeyframeTrack(
  "Root.scale",
  [0, 0.5, 1],
  [1, 1, 1, 1.35, 1.35, 1.35, 1, 1, 1],
);
const clip = new AnimationClip("Pulse", 1, [track]);

mkdirSync(OUT_DIR, { recursive: true });

const exporter = new GLTFExporter();
const glb = await new Promise((resolve, reject) => {
  exporter.parse(
    scene,
    (result) => {
      if (result instanceof ArrayBuffer) resolve(Buffer.from(result));
      else reject(new Error("Expected binary GLB ArrayBuffer"));
    },
    (err) => reject(err instanceof Error ? err : new Error(String(err))),
    { binary: true, animations: [clip] },
  );
});

writeFileSync(join(OUT_DIR, "model.glb"), glb);
writeFileSync(
  join(OUT_DIR, "scene.json"),
  `${JSON.stringify(
    {
      id: "clip-fixture",
      title: "Clip player fixture",
      asset: "./model.glb",
      structures: [{ id: "root", label: "Root", node: "Root" }],
      clips: [
        { id: "pulse", label: "Pulse", animation: "Pulse", loop: true },
      ],
    },
    null,
    2,
  )}\n`,
);
console.log(`Wrote ${OUT_DIR}/model.glb and scene.json`);
