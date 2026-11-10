import { describe, expect, it, vi } from "vitest";
import {
  DIY_OCCLUSION_FREE_PATH_NOTICE,
  openDiyOcclusionFromImageKey,
} from "../../src/deckHub/openDiyOcclusion";

describe("openDiyOcclusionFromImageKey", () => {
  it("returns false for empty or whitespace keys without side effects", () => {
    for (const imageKey of ["", "   ", "\t\n"]) {
      const prepare = vi.fn();
      const goDiy = vi.fn();
      const setNotice = vi.fn();

      expect(
        openDiyOcclusionFromImageKey({
          imageKey,
          prepare,
          goDiy,
          setNotice,
        }),
      ).toBe(false);

      expect(prepare).not.toHaveBeenCalled();
      expect(goDiy).not.toHaveBeenCalled();
      expect(setNotice).not.toHaveBeenCalled();
    }
  });

  it("trims the key, opens DIY, and sets the free-path notice", () => {
    const prepare = vi.fn();
    const goDiy = vi.fn();
    const setNotice = vi.fn();

    expect(
      openDiyOcclusionFromImageKey({
        imageKey: "  materials/abc.png  ",
        prepare,
        goDiy,
        setNotice,
      }),
    ).toBe(true);

    expect(prepare).toHaveBeenCalledExactlyOnceWith("materials/abc.png");
    expect(goDiy).toHaveBeenCalledOnce();
    expect(setNotice).toHaveBeenCalledExactlyOnceWith(
      DIY_OCCLUSION_FREE_PATH_NOTICE,
    );
    expect(prepare.mock.invocationCallOrder[0]).toBeLessThan(
      goDiy.mock.invocationCallOrder[0]!,
    );
    expect(goDiy.mock.invocationCallOrder[0]).toBeLessThan(
      setNotice.mock.invocationCallOrder[0]!,
    );
  });
});
