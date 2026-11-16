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
  Plane,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  type AnimationClip,
  type Camera,
  type Material,
  type Object3D,
  type Texture,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  buildBvhUnderRoot,
  disposeGeometryWithBvh,
  installAnatomyAcceleratedRaycast,
} from "./anatomyBvh";
import {
  SECTION_CLIP_NORMAL,
  attachSectionClipPlanes,
  parkedSectionClipConstant,
  sectionClipConstant,
} from "./anatomySectionClip";
import {
  anchorWorldPointFromObject,
  isNdcDepthInView,
  ndcToCanvasCss,
  shouldShowSelectedLabel,
} from "./anatomyScreenLabel";
import { configureAnatomyGltfLoader } from "./configureGltfLoader";
import { applyFit, applyFocus, orbitDistanceLimits } from "./cameraFit";
import {
  createClipController,
  type ClipController,
} from "./clipController";
import { LOADER_DELAY_MS } from "./delayedShow";
import {
  FADE_OTHERS_OPACITY,
  selectFadeIds,
  type FadeCandidate,
} from "./fadeOthers";
import {
  movementExceeded,
  pickThresholdForPointerType,
  shouldCommitPick,
} from "./pickGesture";
import {
  HOVER_EMISSIVE_HEX,
  HOVER_EMISSIVE_MIN_INTENSITY,
  SELECTION_EMISSIVE_HEX,
  SELECTION_EMISSIVE_INTENSITY,
  highlightModeFor,
} from "./structureHighlight";
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
  playClip: (name: string, opts?: { loop?: boolean }) => boolean;
  pauseClips: () => void;
  resumeClips: () => void;
  stopClips: () => void;
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
  /** Soft-fade non-selected visible structures. Default false. */
  fadeOthers?: boolean;
  /** Cross-section clip plane. Default false. */
  clipEnabled?: boolean;
  /** Clip depth along scene +X through root AABB, 0–1. Default 0.5. */
  clipDepth01?: number;
  /** Selected structure label (page applies Test Yourself masking). */
  selectedLabelText?: string | null;
};

type EmissiveMat = Material & {
  emissive?: Color;
  emissiveIntensity?: number;
};

const LOAD_CONCURRENCY = 6;

type LoadedGltf = { scene: Object3D; animations: AnimationClip[] };

function loadGltf(loader: GLTFLoader, url: string): Promise<LoadedGltf> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) =>
        resolve({
          scene: gltf.scene,
          animations: gltf.animations ?? [],
        }),
      undefined,
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
    );
  });
}

function composeClipControllers(
  bundles: { root: Object3D; animations: AnimationClip[] }[],
): ClipController | null {
  if (bundles.length === 0) return null;
  if (bundles.length === 1) {
    return createClipController(bundles[0].root, bundles[0].animations);
  }
  const controllers = bundles.map((b) =>
    createClipController(b.root, b.animations),
  );
  return {
    get playing() {
      return controllers.some((c) => c.playing);
    },
    play(name, opts) {
      for (const c of controllers) c.stop();
      for (const c of controllers) {
        if (c.play(name, opts)) return true;
      }
      return false;
    },
    pause() {
      for (const c of controllers) c.pause();
    },
    resume() {
      for (const c of controllers) c.resume();
    },
    stop() {
      for (const c of controllers) c.stop();
    },
    update(dt) {
      for (const c of controllers) c.update(dt);
    },
    dispose() {
      for (const c of controllers) c.dispose();
    },
  };
}

function disposeObjectTree(root: Object3D) {
  root.traverse((obj) => {
    const mesh = obj as Object3D & {
      geometry?: {
        dispose: () => void;
        disposeBoundsTree?: () => void;
        boundsTree?: unknown;
      };
      material?: Material | Material[];
    };
    if (mesh.geometry) disposeGeometryWithBvh(mesh.geometry);
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

type PresentableMat = EmissiveMat & {
  opacity?: number;
  transparent?: boolean;
};

type BaseMat = {
  mat: PresentableMat;
  emissive?: Color;
  intensity?: number;
  opacity?: number;
  transparent?: boolean;
};

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
      fadeOthers = false,
      clipEnabled = false,
      clipDepth01 = 0.5,
      selectedLabelText = null,
    },
    ref,
  ) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const labelElRef = useRef<HTMLDivElement | null>(null);
    const uiRef = useRef(ui);
    const onSelectRef = useRef(onSelect);
    const loadsRef = useRef(loads);
    const nodeMapRef = useRef<Map<string, Object3D>>(new Map());
    const idByNodeRef = useRef<Map<string, string>>(new Map());
    const applyVisibilityRef = useRef<() => void>(() => {});
    const syncPresentationRef = useRef<() => void>(() => {});
    const syncSectionClipRef = useRef<() => void>(() => {});
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
    const clipCtlRef = useRef<ClipController | null>(null);
    const startClipLoopRef = useRef<() => void>(() => {});
    const stopClipLoopRef = useRef<() => void>(() => {});
    const autoRotateRef = useRef(autoRotate);
    const wireframeRef = useRef(wireframe);
    const fadeOthersRef = useRef(fadeOthers);
    const clipEnabledRef = useRef(clipEnabled);
    const clipDepth01Ref = useRef(clipDepth01);
    const selectedLabelTextRef = useRef(selectedLabelText);
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
      fadeOthersRef.current = fadeOthers;
      syncPresentationRef.current();
    }, [fadeOthers]);
    useEffect(() => {
      clipEnabledRef.current = clipEnabled;
      syncSectionClipRef.current();
    }, [clipEnabled]);
    useEffect(() => {
      clipDepth01Ref.current = clipDepth01;
      syncSectionClipRef.current();
    }, [clipDepth01]);
    useEffect(() => {
      selectedLabelTextRef.current = selectedLabelText;
      requestRenderRef.current();
    }, [selectedLabelText]);
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
      playClip: (name, opts) => {
        const ok = clipCtlRef.current?.play(name, opts) ?? false;
        if (ok) startClipLoopRef.current();
        return ok;
      },
      pauseClips: () => {
        clipCtlRef.current?.pause();
        stopClipLoopRef.current();
        requestRenderRef.current();
      },
      resumeClips: () => {
        clipCtlRef.current?.resume();
        startClipLoopRef.current();
      },
      stopClips: () => {
        clipCtlRef.current?.stop();
        stopClipLoopRef.current();
        requestRenderRef.current();
      },
    }));

    const loadsKey = loads.map((l) => `${l.structureId}:${l.url}`).join("|");

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;

      installAnatomyAcceleratedRaycast();

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
      renderer.localClippingEnabled = false;
      applySceneBackground(scene, renderer, backgroundRef.current);
      rendererRef.current = renderer;
      const sectionPlane = new Plane();
      sectionPlane.normal.set(
        SECTION_CLIP_NORMAL.x,
        SECTION_CLIP_NORMAL.y,
        SECTION_CLIP_NORMAL.z,
      );
      const sectionClipPlanes = [sectionPlane];
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
      raycaster.firstHitOnly = true;
      const pointer = new Vector2();
      const baseByMat = new Map<object, BaseMat>();
      let hoveredId: string | null = null;

      let disposed = false;

      const ensureBase = (m: PresentableMat) => {
        if (baseByMat.has(m)) return;
        baseByMat.set(m, {
          mat: m,
          emissive: m.emissive?.clone(),
          intensity: m.emissiveIntensity,
          opacity: m.opacity,
          transparent: m.transparent,
        });
      };

      const restoreAllBases = () => {
        for (const entry of baseByMat.values()) {
          if (entry.emissive && entry.mat.emissive) {
            entry.mat.emissive.copy(entry.emissive);
          }
          if (entry.intensity != null && entry.mat.emissiveIntensity != null) {
            entry.mat.emissiveIntensity = entry.intensity;
          }
          if (entry.opacity != null && entry.mat.opacity != null) {
            entry.mat.opacity = entry.opacity;
          }
          if (entry.transparent != null && entry.mat.transparent != null) {
            entry.mat.transparent = entry.transparent;
          }
          entry.mat.needsUpdate = true;
        }
      };

      const applyEmissive = (
        root: Object3D,
        hex: number,
        intensity: number,
        intensify: boolean,
      ) => {
        root.traverse((obj) => {
          if (!(obj instanceof Mesh)) return;
          const list = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          for (const mat of list) {
            const m = mat as PresentableMat;
            if (!m?.emissive) continue;
            ensureBase(m);
            m.emissive.setHex(hex);
            m.emissiveIntensity = intensify
              ? Math.max(m.emissiveIntensity ?? 1, intensity)
              : intensity;
            m.needsUpdate = true;
          }
        });
      };

      const applyFadeOpacity = (root: Object3D, opacity: number) => {
        root.traverse((obj) => {
          if (!(obj instanceof Mesh)) return;
          const list = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          for (const mat of list) {
            const m = mat as PresentableMat;
            if (m?.opacity == null) continue;
            ensureBase(m);
            m.transparent = true;
            m.opacity = opacity;
            m.needsUpdate = true;
          }
        });
      };

      // ponytail: AABB distance scoring is O(visible); cache until selection /
      // visibility / fade toggle / nodeMap membership changes (not every hover).
      let lastFadeKey = "";
      let lastFadeIds: string[] = [];

      const fadeCacheKey = (
        state: StructureUiState,
        selectedId: string | null,
      ) => {
        if (!fadeOthersRef.current || !selectedId) return "off";
        const bits = ["on", selectedId];
        for (const id of nodeMapRef.current.keys()) {
          if (id === selectedId) continue;
          bits.push(id, isStructureVisible(state, id) ? "1" : "0");
        }
        return bits.join("|");
      };

      const resolveFadeIds = (
        state: StructureUiState,
        selectedId: string | null,
      ): string[] => {
        const key = fadeCacheKey(state, selectedId);
        if (key === lastFadeKey) return lastFadeIds;
        lastFadeKey = key;
        if (key === "off" || !selectedId) {
          lastFadeIds = [];
          return lastFadeIds;
        }
        const selectedRoot = nodeMapRef.current.get(selectedId);
        if (!selectedRoot) {
          lastFadeIds = [];
          return lastFadeIds;
        }
        const center = new Box3()
          .setFromObject(selectedRoot)
          .getCenter(new Vector3());
        const candidates: FadeCandidate[] = [];
        for (const [id, root] of nodeMapRef.current) {
          if (id === selectedId) continue;
          if (!isStructureVisible(state, id)) continue;
          const c = new Box3().setFromObject(root).getCenter(new Vector3());
          candidates.push({ id, distanceSq: c.distanceToSquared(center) });
        }
        lastFadeIds = selectFadeIds(candidates);
        return lastFadeIds;
      };

      const syncPresentation = () => {
        if (disposed) return;
        restoreAllBases();
        const state = uiRef.current;
        const selectedId = state.selectedId;
        for (const [id, root] of nodeMapRef.current) {
          const mode = highlightModeFor(id, selectedId, hoveredId);
          if (mode === "selected" || mode === "both") {
            applyEmissive(
              root,
              SELECTION_EMISSIVE_HEX,
              SELECTION_EMISSIVE_INTENSITY,
              false,
            );
          }
          if (mode === "hover" || mode === "both") {
            applyEmissive(
              root,
              HOVER_EMISSIVE_HEX,
              HOVER_EMISSIVE_MIN_INTENSITY,
              true,
            );
          }
        }
        for (const id of resolveFadeIds(state, selectedId)) {
          const root = nodeMapRef.current.get(id);
          if (root) applyFadeOpacity(root, FADE_OTHERS_OPACITY);
        }
        requestRenderRef.current();
      };
      syncPresentationRef.current = syncPresentation;

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
      let clipLoopOn = false;
      let lastClipFrameMs = performance.now();
      const labelScratchBox = new Box3();
      const labelScratchWorld = new Vector3();
      const syncSelectedLabelOverlay = () => {
        const el = labelElRef.current;
        const cam = cameraRef.current;
        if (!el || !cam || disposed) return;
        const selectedId = uiRef.current.selectedId;
        const root = selectedId
          ? nodeMapRef.current.get(selectedId)
          : undefined;
        const labelText = selectedLabelTextRef.current;
        const structureVisible = root ? isEffectivelyVisible(root) : false;
        const show = shouldShowSelectedLabel({
          selectedId,
          hasRoot: Boolean(root),
          structureVisible,
          labelText,
        });
        if (!show || !root) {
          el.style.display = "none";
          return;
        }
        cam.updateMatrixWorld();
        anchorWorldPointFromObject(root, labelScratchWorld, labelScratchBox);
        labelScratchWorld.project(cam);
        if (!isNdcDepthInView(labelScratchWorld.z)) {
          el.style.display = "none";
          return;
        }
        const { x, y } = ndcToCanvasCss(
          labelScratchWorld.x,
          labelScratchWorld.y,
          renderer.domElement.clientWidth,
          renderer.domElement.clientHeight,
        );
        el.style.display = "block";
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
      };
      const renderFrame = () => {
        renderRequested = false;
        if (disposed) return;
        controls.update();
        const cam = cameraRef.current;
        if (cam) renderer.render(scene, cam);
        syncSelectedLabelOverlay();
        if (controls.autoRotate) requestRender();
      };
      const requestRender = () => {
        if (disposed || renderRequested || clipLoopOn) return;
        renderRequested = true;
        requestAnimationFrame(renderFrame);
      };
      const stopClipLoop = () => {
        if (!clipLoopOn) return;
        clipLoopOn = false;
        renderer.setAnimationLoop(null);
      };
      const startClipLoop = () => {
        if (disposed) return;
        if (clipLoopOn) return;
        clipLoopOn = true;
        lastClipFrameMs = performance.now();
        renderer.setAnimationLoop(() => {
          if (disposed) return;
          const now = performance.now();
          const dt = Math.min(0.1, (now - lastClipFrameMs) / 1000);
          lastClipFrameMs = now;
          clipCtlRef.current?.update(dt);
          controls.update();
          const cam = cameraRef.current;
          if (cam) renderer.render(scene, cam);
          syncSelectedLabelOverlay();
          if (!clipCtlRef.current?.playing) {
            stopClipLoop();
            if (controls.autoRotate) requestRender();
          }
        });
      };
      startClipLoopRef.current = startClipLoop;
      stopClipLoopRef.current = stopClipLoop;
      requestRenderRef.current = requestRender;
      const syncSectionClip = () => {
        if (disposed) return;
        const hasStructures = nodeMapRef.current.size > 0;
        const enabled = clipEnabledRef.current && hasStructures;
        attachSectionClipPlanes(rootGroup, sectionClipPlanes);
        const box = new Box3().setFromObject(rootGroup);
        const minX = box.isEmpty() ? 0 : box.min.x;
        const maxX = box.isEmpty() ? 0 : box.max.x;
        sectionPlane.constant = enabled
          ? sectionClipConstant(minX, maxX, clipDepth01Ref.current)
          : parkedSectionClipConstant(minX, maxX);
        renderer.localClippingEnabled = enabled;
        requestRender();
      };
      syncSectionClipRef.current = syncSectionClip;
      controls.addEventListener("change", requestRender);

      const applyVisibility = () => {
        const state = uiRef.current;
        for (const [id, obj] of nodeMapRef.current) {
          obj.visible = isStructureVisible(state, id);
        }
        syncPresentation();
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
        syncPresentation();
      };

      const onPointerLeave = () => {
        activePointers.clear();
        pickGesture = null;
        hoveredId = null;
        canvas.style.cursor = "";
        syncPresentation();
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

      const loader = configureAnatomyGltfLoader(new GLTFLoader());
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

      /** One mixer per loaded asset so clip tracks bind to that model only. */
      const assetClipBundles: { root: Object3D; animations: AnimationClip[] }[] =
        [];

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
            const loaded = await loadGltf(loader, url);
            if (disposed) return;
            const model = loaded.scene;
            if (loaded.animations.length > 0) {
              assetClipBundles.push({
                root: model,
                animations: loaded.animations,
              });
            }
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
              buildBvhUnderRoot(root);
            }
            if (wireframeRef.current) setTreeWireframe(model, true);
            applyVisibility();
            syncSectionClip();
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
        stopClipLoop();
        clipCtlRef.current?.dispose();
        clipCtlRef.current = composeClipControllers(assetClipBundles);
        applyVisibility();
        syncSectionClip();
        fitCamera();
      })();

      return () => {
        disposed = true;
        if (loaderDelayTimer != null) clearTimeout(loaderDelayTimer);
        setLoaderVisible(false);
        applyVisibilityRef.current = () => {};
        syncPresentationRef.current = () => {};
        syncSectionClipRef.current = () => {};
        fitCameraRef.current = () => {};
        focusStructureRef.current = () => {};
        setCameraModeRef.current = () => {};
        requestRenderRef.current = () => {};
        startClipLoopRef.current = () => {};
        stopClipLoopRef.current = () => {};
        stopClipLoop();
        clipCtlRef.current?.dispose();
        clipCtlRef.current = null;
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
        restoreAllBases();
        baseByMat.clear();
        lastFadeKey = "";
        lastFadeIds = [];
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
        <Box
          ref={labelElRef}
          aria-hidden
          sx={{
            display: "none",
            position: "absolute",
            left: 0,
            top: 0,
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
            zIndex: 2,
            px: 0.75,
            py: 0.25,
            borderRadius: 1,
            bgcolor: "background.paper",
            boxShadow: 1,
            maxWidth: "70%",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          <Typography variant="caption" component="span">
            {selectedLabelText ?? ""}
          </Typography>
        </Box>
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
