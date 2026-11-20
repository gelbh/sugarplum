import { describe, expect, it } from "vitest";
import {
  AnimationClip,
  NumberKeyframeTrack,
  Object3D,
} from "three";
import {
  createClipController,
  findAnimation,
} from "../../src/anatomy/viewer/clipController";

function makeClip(name: string, duration = 1): AnimationClip {
  const track = new NumberKeyframeTrack(
    ".morphTargetInfluences[0]",
    [0, duration],
    [0, 1],
  );
  return new AnimationClip(name, duration, [track]);
}

describe("findAnimation", () => {
  it("matches by exact name", () => {
    const clips = [makeClip("Walk_baked"), makeClip("Trot_baked")];
    expect(findAnimation(clips, "Trot_baked")?.name).toBe("Trot_baked");
    expect(findAnimation(clips, "missing")).toBeNull();
  });
});

describe("createClipController", () => {
  it("play returns false for unknown clip", () => {
    const root = new Object3D();
    const ctl = createClipController(root, [makeClip("Walk_baked")]);
    expect(ctl.play("Nope")).toBe(false);
    ctl.dispose();
  });

  it("play then stop clears playing", () => {
    const root = new Object3D();
    const ctl = createClipController(root, [makeClip("Walk_baked")]);
    expect(ctl.play("Walk_baked", { loop: true })).toBe(true);
    expect(ctl.playing).toBe(true);
    ctl.stop();
    expect(ctl.playing).toBe(false);
    ctl.dispose();
  });
});
