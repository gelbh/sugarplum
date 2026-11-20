import type { AnimationClip, Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  createClipController,
  type ClipController,
} from "./clipController";

export type LoadedGltf = { scene: Object3D; animations: AnimationClip[] };

export function loadGltf(loader: GLTFLoader, url: string): Promise<LoadedGltf> {
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

export function composeClipControllers(
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

export async function mapPoolSettled<T, R>(
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
