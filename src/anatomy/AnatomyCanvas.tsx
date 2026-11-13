import { useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { isStructureVisible, type StructureUiState } from "./structureState";

export type AnatomyLoadSpec = {
  structureId: string;
  url: string;
  node: string;
};

type Props = {
  loads: AnatomyLoadSpec[];
  ui: StructureUiState;
  onSelect: (id: string) => void;
};

function loadGltf(loader: GLTFLoader, url: string): Promise<Object3D> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => resolve(gltf.scene),
      undefined,
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
    );
  });
}

export default function AnatomyCanvas({ loads, ui, onSelect }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const uiRef = useRef(ui);
  const onSelectRef = useRef(onSelect);
  const loadsRef = useRef(loads);
  const nodeMapRef = useRef<Map<string, Object3D>>(new Map());
  const idByNodeRef = useRef<Map<string, string>>(new Map());
  const applyVisibilityRef = useRef<() => void>(() => {});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    uiRef.current = ui;
  }, [ui]);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    loadsRef.current = loads;
  }, [loads]);

  const loadsKey = loads.map((l) => `${l.structureId}:${l.url}`).join("|");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    setLoadError(null);

    const scene = new Scene();
    scene.background = new Color(0xf0f0f0);
    const rootGroup = new Group();
    scene.add(rootGroup);

    const camera = new PerspectiveCamera(45, 1, 0.01, 100);
    camera.position.set(2.2, 1.6, 2.8);

    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const canvas = renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    host.appendChild(canvas);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;

    scene.add(new AmbientLight(0xffffff, 0.7));
    const key = new DirectionalLight(0xffffff, 0.9);
    key.position.set(3, 5, 2);
    scene.add(key);

    const raycaster = new Raycaster();
    const pointer = new Vector2();

    let disposed = false;

    const isEffectivelyVisible = (obj: Object3D) => {
      let cur: Object3D | null = obj;
      while (cur) {
        if (!cur.visible) return false;
        cur = cur.parent;
      }
      return true;
    };

    const applyVisibility = () => {
      const state = uiRef.current;
      for (const [id, obj] of nodeMapRef.current) {
        obj.visible = isStructureVisible(state, id);
      }
    };
    applyVisibilityRef.current = applyVisibility;

    const fitCamera = () => {
      if (nodeMapRef.current.size === 0) return;
      const box = new Box3();
      for (const obj of nodeMapRef.current.values()) {
        box.expandByObject(obj);
      }
      if (box.isEmpty()) return;
      const size = box.getSize(new Vector3()).length() || 1;
      const center = box.getCenter(new Vector3());
      controls.target.copy(center);
      camera.position
        .copy(center)
        .add(new Vector3(size * 0.7, size * 0.45, size * 0.9));
      camera.near = size / 100;
      camera.far = size * 10;
      camera.updateProjectionMatrix();
      controls.update();
    };

    const resize = () => {
      const w = Math.max(1, Math.floor(host.clientWidth));
      const h = Math.max(1, Math.floor(host.clientHeight));
      const maxEdge = 4096;
      const bw = Math.min(w, maxEdge);
      const bh = Math.min(h, maxEdge);
      camera.aspect = bw / bh;
      camera.updateProjectionMatrix();
      renderer.setSize(bw, bh, true);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
    };

    const onPointerDown = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const targets = [...nodeMapRef.current.values()].filter(
        isEffectivelyVisible,
      );
      const hits = raycaster
        .intersectObjects(targets, true)
        .filter((hit) => isEffectivelyVisible(hit.object));
      if (hits.length === 0) return;
      let obj: Object3D | null = hits[0].object;
      while (obj) {
        const id = idByNodeRef.current.get(obj.uuid);
        if (id) {
          onSelectRef.current(id);
          return;
        }
        const byName = idByNodeRef.current.get(obj.name);
        if (byName) {
          onSelectRef.current(byName);
          return;
        }
        obj = obj.parent;
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    renderer.setAnimationLoop(() => {
      if (disposed) return;
      controls.update();
      renderer.render(scene, camera);
    });

    const loader = new GLTFLoader();
    const specs = loadsRef.current;
    const byUrl = new Map<string, AnatomyLoadSpec[]>();
    for (const spec of specs) {
      const list = byUrl.get(spec.url) ?? [];
      list.push(spec);
      byUrl.set(spec.url, list);
    }

    void (async () => {
      const results = await Promise.allSettled(
        [...byUrl.entries()].map(async ([url, urlSpecs]) => {
          const model = await loadGltf(loader, url);
          if (disposed) return;
          rootGroup.add(model);
          for (const spec of urlSpecs) {
            let root: Object3D = model;
            let found: Object3D | null = null;
            model.traverse((obj) => {
              if (!found && obj.name === spec.node) found = obj;
            });
            if (found) root = found;
            else if (urlSpecs.length === 1) {
              model.name = spec.node || spec.structureId;
              root = model;
            } else {
              throw new Error(`Missing node ${spec.node} in ${url}`);
            }
            nodeMapRef.current.set(spec.structureId, root);
            idByNodeRef.current.set(root.uuid, spec.structureId);
            if (root.name) {
              idByNodeRef.current.set(root.name, spec.structureId);
            }
          }
          applyVisibility();
        }),
      );
      if (disposed) return;
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        setLoadError(
          failed === results.length
            ? "Could not load the 3D models."
            : `Loaded with ${failed} missing part${failed === 1 ? "" : "s"}.`,
        );
      }
      applyVisibility();
      fitCamera();
    })();

    return () => {
      disposed = true;
      applyVisibilityRef.current = () => {};
      renderer.setAnimationLoop(null);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      controls.dispose();
      renderer.dispose();
      if (canvas.parentElement === host) {
        host.removeChild(canvas);
      }
      scene.remove(rootGroup);
      nodeMapRef.current = new Map();
      idByNodeRef.current = new Map();
    };
  }, [loadsKey, retryToken]);

  useEffect(() => {
    applyVisibilityRef.current();
  }, [ui, loadsKey]);

  return (
    <Box
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 360,
        minWidth: 0,
      }}
    >
      <div
        ref={hostRef}
        style={{
          width: "100%",
          height: "100%",
          minHeight: 360,
          borderRadius: 8,
          overflow: "hidden",
          background: "#f0f0f0",
        }}
      />
      {loadError ? (
        <Alert
          severity="error"
          sx={{ position: "absolute", left: 12, right: 12, bottom: 12 }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => setRetryToken((n) => n + 1)}
            >
              Retry
            </Button>
          }
        >
          {loadError}
        </Alert>
      ) : null}
    </Box>
  );
}
