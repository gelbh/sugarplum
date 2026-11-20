import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  LoopOnce,
  LoopRepeat,
  type Object3D,
} from "three";

export function findAnimation(
  clips: AnimationClip[],
  name: string,
): AnimationClip | null {
  return clips.find((c) => c.name === name) ?? null;
}

export type ClipController = {
  readonly playing: boolean;
  play: (name: string, opts?: { loop?: boolean }) => boolean;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  update: (dt: number) => void;
  dispose: () => void;
};

export function createClipController(
  root: Object3D,
  clips: AnimationClip[],
): ClipController {
  const mixer = new AnimationMixer(root);
  let current: AnimationAction | null = null;

  const controller: ClipController = {
    get playing() {
      return current != null && current.isRunning();
    },
    play(name: string, opts?: { loop?: boolean }): boolean {
      const clip = findAnimation(clips, name);
      if (!clip) return false;
      if (current) {
        current.stop();
        current = null;
      }
      const action = mixer.clipAction(clip);
      const loop = opts?.loop !== false;
      action.reset();
      action.setLoop(loop ? LoopRepeat : LoopOnce, Infinity);
      action.clampWhenFinished = !loop;
      action.play();
      current = action;
      return true;
    },
    pause() {
      if (current) current.paused = true;
    },
    resume() {
      if (current) current.paused = false;
    },
    stop() {
      if (current) {
        current.stop();
        current = null;
      }
      mixer.stopAllAction();
    },
    update(dt: number) {
      mixer.update(dt);
    },
    dispose() {
      controller.stop();
      mixer.uncacheRoot(root);
    },
  };
  return controller;
}
