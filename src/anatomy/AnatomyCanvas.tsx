import { useEffect, useRef } from "react";
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
import {
  isStructureVisible,
  type StructureUiState,
} from "./structureState";

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

  uiRef.current = ui;
  onSelectRef.current = onSelect;
  structuresRef.current = structures;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new Scene();
    scene.background = new Color(0xf0f0f0);

    const camera = new PerspectiveCamera(45, 1, 0.01, 100);
    camera.position.set(2.2, 1.6, 2.8);

    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new AmbientLight(0xffffff, 0.7));
    const key = new DirectionalLight(0xffffff, 0.9);
    key.position.set(3, 5, 2);
    scene.add(key);

    const raycaster = new Raycaster();
    const pointer = new Vector2();

    let frame = 0;
    let disposed = false;
    const root = { current: null as Object3D | null };

    const applyVisibility = () => {
      const state = uiRef.current;
      for (const s of structuresRef.current) {
        const obj = nodeMapRef.current.get(s.node);
        if (obj) obj.visible = isStructureVisible(state, s.id);
      }
    };

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };

    const onPointerDown = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(
        [...nodeMapRef.current.values()],
        true,
      );
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

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    const tick = () => {
      if (disposed) return;
      frame = requestAnimationFrame(tick);
      applyVisibility();
      controls.update();
      renderer.render(scene, camera);
    };

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
        camera.position.copy(center).add(new Vector3(size * 0.7, size * 0.45, size * 0.9));
        camera.near = size / 100;
        camera.far = size * 10;
        camera.updateProjectionMatrix();
        controls.update();
        applyVisibility();
      },
      undefined,
      (err) => {
        console.error("Anatomy glTF load failed", err);
      },
    );

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === host) {
        host.removeChild(renderer.domElement);
      }
      if (root.current) scene.remove(root.current);
      nodeMapRef.current = new Map();
      idByNodeRef.current = new Map();
    };
  }, [assetUrl]);

  return (
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
  );
}
