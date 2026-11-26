import { describe, expect, it, vi } from "vitest";
import { configureAnatomyGltfLoader } from "../../../src/anatomy/viewer/configureGltfLoader";

describe("configureAnatomyGltfLoader", () => {
  it("sets MeshoptDecoder on the loader", () => {
    const setMeshoptDecoder = vi.fn();
    const loader = { setMeshoptDecoder } as unknown as {
      setMeshoptDecoder: (d: unknown) => void;
    };
    configureAnatomyGltfLoader(loader as never);
    expect(setMeshoptDecoder).toHaveBeenCalledTimes(1);
    const decoder = setMeshoptDecoder.mock.calls[0][0] as {
      ready?: unknown;
    };
    expect(decoder).toBeTruthy();
    expect(decoder.ready).toBeDefined();
  });
});
