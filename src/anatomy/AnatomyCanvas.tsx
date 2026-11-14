import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  WebGLRenderer,
  type Camera,
  type Material,
  type Object3D,
  type Texture,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { applyFit, applyFocus, orbitDistanceLimits } from "./cameraFit";
import { LOADER_DELAY_MS } from "./delayedShow";
import {
  movementExceeded,
  pickThresholdForPointerType,
  shouldCommitPick,
} from "./pickGesture";
import { isStructureVisible, type StructureUiState } from "./structureState";

export type AnatomyLoadSpec = {
  structureId: string;
  url: string;
  node: string;
};

export type AnatomyCameraMode = "perspective" | "orthographic";

export type AnatomyCanvasHandle = {
  resetView: () => void;
  zoomBy: (factor: number) => void;
  focusStructure: (id: string) => void;
};

/** CSS hex (`#rrggbb`) or `null` for transparent (page shows through). */
export type AnatomyCanvasBackground = string | null;

type Props = {
  loads: AnatomyLoadSpec[];
  ui: StructureUiState;
  onSelect: (id: string) => void;
  /** Default `null`: transparent clear so the page background shows. */
  background?: AnatomyCanvasBackground;
  autoRotate?: boolean;
  wireframe?: boolean;
  /** When true, selection recenters the orbit target. Default true. */
  autoFocus?: boolean;
  cameraMode?: AnatomyCameraMode;
};

type EmissiveMat = Material & {
  emissive?: Color;
  emissiveIntensity?: number;
};

const LOAD_CONCURRENCY = 6;

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

function disposeObjectTree(root: Object3D) {
  root.traverse((obj) => {
    const mesh = obj as Object3D & {
      geometry?: { dispose: () => void };
      material?: Material | Material[];
    };
    mesh.geometry?.dispose();
    const mats = mesh.material
      ? Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]
      : [];
    for (const mat of mats) {
      for (const value of Object.values(mat)) {
        const tex = value as Texture | undefined;
        if (
          tex &&
          typeof tex === "object" &&
          "isTexture" in tex &&
          tex.isTexture
        ) {
          tex.dispose();
        }
      }
      mat.dispose();
    }
  });
}

async function mapPoolSettled<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  onItemDone: () => void,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next;
      next += 1;
      try {
        results[idx] = { status: "fulfilled", value: await fn(items[idx]) };
      } catch (reason) {
        results[idx] = { status: "rejected", reason };
      }
      onItemDone();
    }
  }
  const n = Math.min(Math.max(1, limit), Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

function setTreeWireframe(root: Object3D, wireframe: boolean) {
  root.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (mat && "wireframe" in mat) {
        (mat as Material & { wireframe: boolean }).wireframe = wireframe;
        mat.needsUpdate = true;
      }
    }
  });
}

function applySceneBackground(
  scene: Scene,
  renderer: WebGLRenderer,
  background: AnatomyCanvasBackground,
) {
  if (background == null) {
    scene.background = null;
    renderer.setClearColor(0x000000, 0);
    return;
  }
  const color = new Color(background);
  scene.background = color;
  renderer.setClearColor(color, 1);
}

function clearHoverHighlight(
  mats: EmissiveMat[],
  saved: { mat: EmissiveMat; color: Color; intensity: number }[],
) {
  for (const entry of saved) {
    if (entry.mat.emissive) entry.mat.emissive.copy(entry.color);
    if (entry.mat.emissiveIntensity != null) {
      entry.mat.emissiveIntensity = entry.intensity;
    }
    entry.mat.needsUpdate = true;
  }
  mats.length = 0;
  saved.length = 0;
}

function applyHoverHighlight(
  root: Object3D,
  mats: EmissiveMat[],
  saved: { mat: EmissiveMat; color: Color; intensity: number }[],
) {
  clearHoverHighlight(mats, saved);
  const seen = new Set<EmissiveMat>();
  root.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of list) {
      const m = mat as EmissiveMat;
      if (!m?.emissive || seen.has(m)) continue;
      seen.add(m);
      saved.push({
        mat: m,
        color: m.emissive.clone(),
        intensity: m.emissiveIntensity ?? 1,
      });
      m.emissive.setHex(0xffffff);
      m.emissiveIntensity = Math.max(m.emissiveIntensity ?? 1, 0.55);
      m.needsUpdate = true;
      mats.push(m);
    }
  });
}

function fitCameraToUnion(
  camera: Camera,
  controls: OrbitControls,
  nodeMap: Map<string, Object3D>,
  aspect: number,
): number {
  if (nodeMap.size === 0) return 0;
  const box = new Box3();
  for (const obj of nodeMap.values()) box.expandByObject(obj);
  if (box.isEmpty()) return 0;
  return applyFit(camera, controls, box, aspect).fitDistance;
}

function focusObject(
  camera: Camera,
  controls: OrbitControls,
  obj: Object3D,
  aspect: number,
  /** Keep zoom-out able to reach the last union framing. */
  unionFitDistance: number,
) {
  const box = new Box3().setFromObject(obj);
  if (box.isEmpty()) return;
  applyFocus(camera, controls, box, aspect);
  if (unionFitDistance > 0) {
    const floor = orbitDistanceLimits(unionFitDistance);
    controls.maxDistance = Math.max(controls.maxDistance, floor.maxDistance);
    if (camera instanceof PerspectiveCamera) {
      camera.far = Math.max(camera.far, controls.maxDistance * 1.25);
      camera.updateProjectionMatrix();
    } else if (camera instanceof OrthographicCamera) {
      camera.far = Math.max(camera.far, controls.maxDistance * 1.25);
      camera.updateProjectionMatrix();
    }
  }
}

const AnatomyCanvas = forwardRef<AnatomyCanvasHandle, Props>(
  function AnatomyCanvas(
    {
      loads,
      ui,
      onSelect,
      background = null,
      autoRotate = false,
      wireframe = false,
      autoFocus = true,
      cameraMode = "perspective",
    },
    ref,
  ) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const uiRef = useRef(ui);
    const onSelectRef = useRef(onSelect);
    const loadsRef = useRef(loads);
    const nodeMapRef = useRef<Map<string, Object3D>>(new Map());
    const idByNodeRef = useRef<Map<string, string>>(new Map());
    const applyVisibilityRef = useRef<() => void>(() => {});
    const fitCameraRef = useRef<() => void>(() => {});
    const focusStructureRef = useRef<(id: string) => void>(() => {});
    const setCameraModeRef = useRef<(mode: AnatomyCameraMode) => void>(
      () => {},
    );
    const controlsRef = useRef<OrbitControls | null>(null);
    const cameraRef = useRef<Camera | null>(null);
    const sceneRef = useRef<Scene | null>(null);
    const rendererRef = useRef<WebGLRenderer | null>(null);
    const rootGroupRef = useRef<Group | null>(null);
    const autoRotateRef = useRef(autoRotate);
    const wireframeRef = useRef(wireframe);
    const backgroundRef = useRef(background);
    const autoFocusRef = useRef(autoFocus);
    const cameraModeRef = useRef(cameraMode);
    const aspectRef = useRef(1);
    const unionFitDistanceRef = useRef(0);
    const requestRenderRef = useRef<() => void>(() => {});
    const [loadError, setLoadError] = useState<string | null>(null);
    const [retryToken, setRetryToken] = useState(0);
    const [progress, setProgress] = useState<{ loaded: number; total: number }>(
      {
        loaded: 0,
        total: 0,
      },
    );
    const [loaderVisible, setLoaderVisible] = useState(false);

    useEffect(() => {
      uiRef.current = ui;
    }, [ui]);
    useEffect(() => {
      onSelectRef.current = onSelect;
    }, [onSelect]);
    useEffect(() => {
      loadsRef.current = loads;
    }, [loads]);
    useEffect(() => {
      autoFocusRef.current = autoFocus;
    }, [autoFocus]);
    useEffect(() => {
      backgroundRef.current = background;
      const scene = sceneRef.current;
      const renderer = rendererRef.current;
      if (scene && renderer) {
        applySceneBackground(scene, renderer, background);
        requestRenderRef.current();
      }
    }, [background]);

    useEffect(() => {
      autoRotateRef.current = autoRotate;
      const controls = controlsRef.current;
      if (!controls) return;
      controls.autoRotate = autoRotate;
      controls.autoRotateSpeed = 1.2;
      requestRenderRef.current();
    }, [autoRotate]);

    useEffect(() => {
      wireframeRef.current = wireframe;
      const root = rootGroupRef.current;
      if (root) {
        setTreeWireframe(root, wireframe);
        requestRenderRef.current();
      }
    }, [wireframe]);
    useEffect(() => {
      cameraModeRef.current = cameraMode;
      setCameraModeRef.current(cameraMode);
    }, [cameraMode]);

    useImperativeHandle(ref, () => ({
      resetView: () => fitCameraRef.current(),
      zoomBy: (factor: number) => {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (!camera || !controls) return;
        if (camera instanceof OrthographicCamera) {
          camera.zoom = Math.min(
            8,
            Math.max(0.2, camera.zoom / factor),
          );
          camera.updateProjectionMatrix();
          controls.update();
          requestRenderRef.current();
          return;
        }
        const offset = camera.position.clone().sub(controls.target);
        offset.multiplyScalar(factor);
        const minD = controls.minDistance || 0.35;
        const maxD = controls.maxDistance || 80;
        const len = offset.length();
        if (len < minD) offset.setLength(minD);
        else if (len > maxD) offset.setLength(maxD);
        camera.position.copy(controls.target).add(offset);
        controls.update();
        requestRenderRef.current();
      },
      focusStructure: (id: string) => focusStructureRef.current(id),
    }));

    const loadsKey = loads.map((l) => `${l.structureId}:${l.url}`).join("|");

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;

      setLoadError(null);
      setProgress({ loaded: 0, total: 0 });
      setLoaderVisible(false);

      const scene = new Scene();
      sceneRef.current = scene;
      const rootGroup = new Group();
      rootGroupRef.current = rootGroup;
      scene.add(rootGroup);

      let camera: Camera =
        cameraModeRef.current === "orthographic"
          ? new OrthographicCamera(-1, 1, 1, -1, 0.01, 100)
          : new PerspectiveCamera(45, 1, 0.01, 100);
      camera.position.set(2.2, 1.6, 2.8);
      cameraRef.current = camera;

      const renderer = new WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      applySceneBackground(scene, renderer, backgroundRef.current);
      rendererRef.current = renderer;
      const canvas = renderer.domElement;
      canvas.style.display = "block";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.background = "transparent";
      host.appendChild(canvas);

      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.autoRotate = autoRotateRef.current;
      controls.autoRotateSpeed = 1.2;
      const provisional = orbitDistanceLimits(1);
      controls.minDistance = provisional.minDistance;
      controls.maxDistance = provisional.maxDistance;
      controlsRef.current = controls;

      scene.add(new AmbientLight(0xffffff, 0.7));
      const key = new DirectionalLight(0xffffff, 0.9);
      key.position.set(3, 5, 2);
      scene.add(key);

      const raycaster = new Raycaster();
      const pointer = new Vector2();
      const hoverMats: EmissiveMat[] = [];
      const hoverSaved: { mat: EmissiveMat; color: Color; intensity: number }[] =
        [];
      let hoveredId: string | null = null;

      let disposed = false;

      const isEffectivelyVisible = (obj: Object3D) => {
        let cur: Object3D | null = obj;
        while (cur) {
          if (!cur.visible) return false;
          cur = cur.parent;
        }
        return true;
      };

      const resolveHitId = (hitObj: Object3D): string | null => {
        let obj: Object3D | null = hitObj;
        while (obj) {
          const id = idByNodeRef.current.get(obj.uuid);
          if (id) return id;
          const byName = idByNodeRef.current.get(obj.name);
          if (byName) return byName;
          obj = obj.parent;
        }
        return null;
      };

      let renderRequested = false;
      const renderFrame = () => {
        renderRequested = false;
        if (disposed) return;
        controls.update();
        const cam = cameraRef.current;
        if (cam) renderer.render(scene, cam);
        if (controls.autoRotate) requestRender();
      };
      const requestRender = () => {
        if (disposed || renderRequested) return;
        renderRequested = true;
        requestAnimationFrame(renderFrame);
      };
      requestRenderRef.current = requestRender;
      controls.addEventListener("change", requestRender);

      const applyVisibility = () => {
        const state = uiRef.current;
        for (const [id, obj] of nodeMapRef.current) {
          obj.visible = isStructureVisible(state, id);
        }
        requestRender();
      };
      applyVisibilityRef.current = applyVisibility;

      const fitCamera = () => {
        const cam = cameraRef.current;
        if (!cam) return;
        const d = fitCameraToUnion(
          cam,
          controls,
          nodeMapRef.current,
          aspectRef.current,
        );
        if (d > 0) unionFitDistanceRef.current = d;
        requestRender();
      };
      fitCameraRef.current = fitCamera;

      focusStructureRef.current = (id: string) => {
        const cam = cameraRef.current;
        const obj = nodeMapRef.current.get(id);
        if (!cam || !obj) return;
        focusObject(
          cam,
          controls,
          obj,
          aspectRef.current,
          unionFitDistanceRef.current,
        );
        requestRender();
      };

      setCameraModeRef.current = (mode: AnatomyCameraMode) => {
        cameraModeRef.current = mode;
        const prev = cameraRef.current;
        if (!prev) return;
        const alreadyOrtho = prev instanceof OrthographicCamera;
        if (
          (mode === "orthographic" && alreadyOrtho) ||
          (mode === "perspective" && !alreadyOrtho)
        ) {
          return;
        }
        const pos = prev.position.clone();
        const target = controls.target.clone();
        const next: Camera =
          mode === "orthographic"
            ? new OrthographicCamera(-1, 1, 1, -1, 0.01, 100)
            : new PerspectiveCamera(45, aspectRef.current, 0.01, 100);
        next.position.copy(pos);
        cameraRef.current = next;
        camera = next;
        controls.object = next;
        fitCamera();
        controls.target.copy(target);
        controls.update();
        requestRender();
      };

      const resize = () => {
        const w = Math.max(1, Math.floor(host.clientWidth));
        const h = Math.max(1, Math.floor(host.clientHeight));
        const maxEdge = 4096;
        const bw = Math.min(w, maxEdge);
        const bh = Math.min(h, maxEdge);
        const aspect = bw / Math.max(bh, 1);
        aspectRef.current = aspect;
        const cam = cameraRef.current;
        if (cam instanceof PerspectiveCamera) {
          cam.aspect = aspect;
          cam.updateProjectionMatrix();
        } else if (cam instanceof OrthographicCamera) {
          const half = (cam.top - cam.bottom) / 2 || 1;
          cam.left = -half * aspect;
          cam.right = half * aspect;
          cam.updateProjectionMatrix();
        }
        renderer.setSize(bw, bh, true);
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        requestRender();
      };

      const pickIdAtEvent = (ev: PointerEvent): string | null => {
        const cam = cameraRef.current;
        if (!cam) return null;
        const rect = canvas.getBoundingClientRect();
        pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, cam);
        const targets = [...nodeMapRef.current.values()].filter(
          isEffectivelyVisible,
        );
        const hits = raycaster
          .intersectObjects(targets, true)
          .filter((hit) => isEffectivelyVisible(hit.object));
        if (hits.length === 0) return null;
        return resolveHitId(hits[0].object);
      };

      type PickGesture = {
        pointerId: number;
        x: number;
        y: number;
        exceeded: boolean;
        multi: boolean;
        thresholdPx: number;
      };
      let pickGesture: PickGesture | null = null;
      const activePointers = new Set<number>();

      const onPointerDown = (ev: PointerEvent) => {
        if (ev.button !== 0 && ev.pointerType === "mouse") return;
        activePointers.add(ev.pointerId);
        if (activePointers.size > 1) {
          if (pickGesture) pickGesture.multi = true;
          return;
        }
        pickGesture = {
          pointerId: ev.pointerId,
          x: ev.clientX,
          y: ev.clientY,
          exceeded: false,
          multi: false,
          thresholdPx: pickThresholdForPointerType(ev.pointerType),
        };
      };
      const onPointerUp = (ev: PointerEvent) => {
        activePointers.delete(ev.pointerId);
        const gesture = pickGesture;
        if (!gesture || ev.pointerId !== gesture.pointerId) {
          if (activePointers.size === 0) pickGesture = null;
          return;
        }
        pickGesture = null;
        if (
          !shouldCommitPick({
            exceededDuring: gesture.exceeded,
            multiPointer: gesture.multi || activePointers.size > 0,
            endDx: ev.clientX - gesture.x,
            endDy: ev.clientY - gesture.y,
            thresholdPx: gesture.thresholdPx,
          })
        ) {
          return;
        }
        const id = pickIdAtEvent(ev);
        if (id) onSelectRef.current(id);
      };
      const onPointerCancel = (ev: PointerEvent) => {
        activePointers.delete(ev.pointerId);
        if (pickGesture?.pointerId === ev.pointerId) pickGesture = null;
        if (activePointers.size === 0) pickGesture = null;
      };

      const onPointerMove = (ev: PointerEvent) => {
        if (
          pickGesture &&
          ev.pointerId === pickGesture.pointerId &&
          !pickGesture.exceeded &&
          movementExceeded(
            ev.clientX - pickGesture.x,
            ev.clientY - pickGesture.y,
            pickGesture.thresholdPx,
          )
        ) {
          pickGesture.exceeded = true;
        }
        const id = pickIdAtEvent(ev);
        canvas.style.cursor = id ? "pointer" : "";
        if (id === hoveredId) return;
        hoveredId = id;
        clearHoverHighlight(hoverMats, hoverSaved);
        if (id) {
          const root = nodeMapRef.current.get(id);
          if (root) applyHoverHighlight(root, hoverMats, hoverSaved);
        }
        requestRender();
      };

      const onPointerLeave = () => {
        activePointers.clear();
        pickGesture = null;
        hoveredId = null;
        canvas.style.cursor = "";
        clearHoverHighlight(hoverMats, hoverSaved);
        requestRender();
      };

      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointercancel", onPointerCancel);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerleave", onPointerLeave);
      const ro = new ResizeObserver(resize);
      ro.observe(host);
      resize();
      requestRender();

      const loader = new GLTFLoader();
      const specs = loadsRef.current;
      const byUrl = new Map<string, AnatomyLoadSpec[]>();
      for (const spec of specs) {
        const list = byUrl.get(spec.url) ?? [];
        list.push(spec);
        byUrl.set(spec.url, list);
      }
      const urlEntries = [...byUrl.entries()];
      const total = urlEntries.length;
      let loadedCount = 0;
      setProgress({ loaded: 0, total });
      setLoaderVisible(false);
      let loaderDelayTimer: ReturnType<typeof setTimeout> | null = null;
      if (total > 0) {
        loaderDelayTimer = setTimeout(() => {
          if (!disposed) setLoaderVisible(true);
        }, LOADER_DELAY_MS);
      }

      void (async () => {
        if (total === 0) {
          setProgress({ loaded: 0, total: 0 });
          setLoaderVisible(false);
          return;
        }
        const results = await mapPoolSettled(
          urlEntries,
          LOAD_CONCURRENCY,
          async ([url, urlSpecs]) => {
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
            if (wireframeRef.current) setTreeWireframe(model, true);
            applyVisibility();
            requestRender();
          },
          () => {
            if (disposed) return;
            loadedCount += 1;
            setProgress({ loaded: loadedCount, total });
          },
        );
        if (disposed) return;
        if (loaderDelayTimer != null) {
          clearTimeout(loaderDelayTimer);
          loaderDelayTimer = null;
        }
        setLoaderVisible(false);
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
        if (loaderDelayTimer != null) clearTimeout(loaderDelayTimer);
        setLoaderVisible(false);
        applyVisibilityRef.current = () => {};
        fitCameraRef.current = () => {};
        focusStructureRef.current = () => {};
        setCameraModeRef.current = () => {};
        requestRenderRef.current = () => {};
        controlsRef.current = null;
        cameraRef.current = null;
        sceneRef.current = null;
        rendererRef.current = null;
        rootGroupRef.current = null;
        controls.removeEventListener("change", requestRender);
        renderer.setAnimationLoop(null);
        ro.disconnect();
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("pointercancel", onPointerCancel);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerleave", onPointerLeave);
        clearHoverHighlight(hoverMats, hoverSaved);
        controls.dispose();
        disposeObjectTree(rootGroup);
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

    useEffect(() => {
      if (!autoFocus || !ui.selectedId) return;
      if (!nodeMapRef.current.has(ui.selectedId)) return;
      focusStructureRef.current(ui.selectedId);
    }, [ui.selectedId, autoFocus, loadsKey, progress.loaded, progress.total]);

    const showProgress =
      loaderVisible && progress.total > 0 && progress.loaded < progress.total;

    return (
      <Box
        sx={{
          position: "relative",
          width: "100%",
          height: "100%",
          minHeight: 0,
          minWidth: 0,
        }}
      >
        <div
          ref={hostRef}
          style={{
            width: "100%",
            height: "100%",
            minHeight: 0,
            borderRadius: 0,
            overflow: "hidden",
            background: background ?? "transparent",
          }}
        />
        {showProgress ? (
          <Box
            sx={{
              position: "absolute",
              left: 12,
              right: 12,
              top: 12,
              bgcolor: "background.paper",
              borderRadius: 1,
              p: 1,
              boxShadow: 1,
            }}
          >
            <Typography variant="caption" color="text.secondary">
              Loading models {progress.loaded}/{progress.total}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={(progress.loaded / progress.total) * 100}
              sx={{ mt: 0.5 }}
            />
          </Box>
        ) : null}
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
  },
);

export default AnatomyCanvas;
