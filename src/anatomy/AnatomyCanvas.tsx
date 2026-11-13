import { useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
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
import type { AnatomyStructure } from "./types";
import { isStructureVisible, type StructureUiState } from "./structureState";

type Props = {
  assetUrl: string;
  structures: AnatomyStructure[];
  ui: StructureUiState;
  onSelect: (id: string) => void;
};

export default function AnatomyCanvas({
  assetUrl,
  structures,
  ui,
  onSelect,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const uiRef = useRef(ui);
  const onSelectRef = useRef(onSelect);
  const structuresRef = useRef(structures);
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
    structuresRef.current = structures;
  }, [structures]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    setLoadError(null);

    const scene = new Scene();
    scene.background = new Color(0xf0f0f0);

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
    const root = { current: null as Object3D | null };

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
      for (const s of structuresRef.current) {
        const obj = nodeMapRef.current.get(s.node);
        if (obj) obj.visible = isStructureVisible(state, s.id);
      }
    };
    applyVisibilityRef.current = applyVisibility;

    const resize = () => {
      const w = Math.max(1, Math.floor(host.clientWidth));
      const h = Math.max(1, Math.floor(host.clientHeight));
      // Cap buffer so a bad layout cannot explode the GPU canvas.
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
        const id = idByNodeRef.current.get(obj.name);
        if (id) {
          onSelectRef.current(id);
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
    loader.load(
      assetUrl,
      (gltf) => {
        if (disposed) return;
        const model = gltf.scene;
        root.current = model;
        scene.add(model);

        const map = new Map<string, Object3D>();
        const idByNode = new Map<string, string>();
        for (const s of structuresRef.current) {
          idByNode.set(s.node, s.id);
        }
        model.traverse((obj) => {
          if (idByNode.has(obj.name)) {
            map.set(obj.name, obj);
          }
        });
        nodeMapRef.current = map;
        idByNodeRef.current = idByNode;

        const box = new Box3().setFromObject(model);
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
        applyVisibility();
      },
      undefined,
      (err) => {
        console.error("Anatomy glTF load failed", err);
        if (!disposed) {
          setLoadError("Could not load the 3D model.");
        }
      },
    );

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
      if (root.current) scene.remove(root.current);
      nodeMapRef.current = new Map();
      idByNodeRef.current = new Map();
    };
  }, [assetUrl, retryToken]);

  useEffect(() => {
    applyVisibilityRef.current();
  }, [ui, structures]);

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
