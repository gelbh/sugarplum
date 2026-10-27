import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const labelsFixture = {
  labels: [
    "paragraph_title",
    "image",
    "text",
    "number",
    "abstract",
    "content",
    "figure_title",
    "formula",
    "table",
    "table_title",
    "reference",
    "doc_title",
    "footnote",
    "header",
    "algorithm",
    "footer",
    "seal",
    "chart_title",
    "chart",
    "formula_number",
    "header_image",
    "footer_image",
    "aside_text",
  ],
  size: [640, 640] as [number, number],
  threshold: 0.5,
};

type RunResult = Record<string, { data: Float32Array | Int32Array; dims: number[] }>;

let mockRun: ReturnType<typeof vi.fn<(feeds: unknown) => Promise<RunResult>>>;
let createShouldFail = false;

vi.mock("onnxruntime-web/wasm", () => {
  class Tensor {
    dims: number[];
    type: string;
    data: Float32Array | Int32Array;
    constructor(type: string, data: Float32Array | Int32Array, dims: number[]) {
      this.type = type;
      this.data = data;
      this.dims = dims;
    }
  }

  return {
    env: { wasm: { wasmPaths: "" } },
    Tensor,
    InferenceSession: {
      create: async () => {
        if (createShouldFail) {
          throw new Error("session create failed");
        }
        return {
          inputNames: ["im_shape", "image", "scale_factor"],
          outputNames: ["fetch_name_0", "fetch_name_1"],
          run: (feeds: unknown) => mockRun(feeds),
        };
      },
    },
  };
});

import {
  detectFigureBoxesOnCanvas,
  ensureLayoutSession,
  letterboxRgbaToChw,
  mapLetterboxBoxToCss,
  parseLayoutDetections,
  resetLayoutSessionForTests,
} from "../../src/lib/layoutOnnx";

function mockCanvas(opts: {
  width: number;
  height: number;
  clientWidth: number;
  clientHeight: number;
  rgba?: Uint8ClampedArray;
}): HTMLCanvasElement {
  const { width, height, clientWidth, clientHeight } = opts;
  const rgba = opts.rgba ?? new Uint8ClampedArray(width * height * 4).fill(255);
  return {
    width,
    height,
    clientWidth,
    clientHeight,
    getContext: () => ({
      getImageData: () => ({ data: rgba, width, height }),
    }),
  } as unknown as HTMLCanvasElement;
}

/** Build Nx6 layout output: [class_id, score, x1, y1, x2, y2] in 640-space. */
function detectionsTensor(
  rows: Array<[number, number, number, number, number, number]>,
): RunResult {
  const data = new Float32Array(rows.length * 6);
  rows.forEach((row, i) => {
    data.set(row, i * 6);
  });
  return {
    fetch_name_0: { data, dims: [rows.length, 6] },
    fetch_name_1: { data: Int32Array.from([rows.length]), dims: [1] },
  };
}

describe("letterboxRgbaToChw", () => {
  it("letterboxes into CHW float /255 with pad offsets", () => {
    const srcW = 100;
    const srcH = 50;
    const rgba = new Uint8ClampedArray(srcW * srcH * 4);
    for (let i = 0; i < srcW * srcH; i++) {
      rgba[i * 4] = 255;
      rgba[i * 4 + 1] = 0;
      rgba[i * 4 + 2] = 0;
      rgba[i * 4 + 3] = 255;
    }

    const { chw, scale, padX, padY, target } = letterboxRgbaToChw(
      rgba,
      srcW,
      srcH,
      640,
    );

    expect(target).toBe(640);
    expect(chw.length).toBe(3 * 640 * 640);
    expect(scale).toBeCloseTo(Math.min(640 / 100, 640 / 50));
    // 100x50 → scale 6.4 → 640x320 content; pad on Y
    expect(padX).toBe(0);
    expect(padY).toBeGreaterThan(0);
    // Center pixel of content should be red channel ~1
    const newW = Math.round(srcW * scale);
    const newH = Math.round(srcH * scale);
    const cx = Math.floor(padX + newW / 2);
    const cy = Math.floor(padY + newH / 2);
    const di = cy * 640 + cx;
    expect(chw[di]).toBeCloseTo(1, 1);
    expect(chw[640 * 640 + di]).toBeCloseTo(0, 1);
  });
});

describe("mapLetterboxBoxToCss", () => {
  it("maps 640-space box through letterbox meta into CSS pixels", () => {
    // 800x400 bitmap shown at 400x200 CSS (scale 2). Letterbox scale = 640/800 = 0.8
    const scale = 0.8;
    const padX = 0;
    const padY = (640 - 400 * 0.8) / 2; // 160
    // Bitmap box (100,50)-(300,200) → 640: (80, 160+40)=(80,200) to (240, 160+160)=(240,320)
    const css = mapLetterboxBoxToCss(
      { x1: 80, y1: 200, x2: 240, y2: 320 },
      { scale, padX, padY, srcW: 800, srcH: 400, cssW: 400, cssH: 200 },
    );
    expect(css.x).toBeCloseTo(50);
    expect(css.y).toBeCloseTo(25);
    expect(css.w).toBeCloseTo(100);
    expect(css.h).toBeCloseTo(75);
  });
});

describe("parseLayoutDetections", () => {
  it("maps class ids via labels and drops below threshold", () => {
    const raw = new Float32Array([
      // image, high score, large box in 640 space
      1, 0.9, 64, 64, 320, 320,
      // text — will be filtered by FIGURE_LABELS later, but parse keeps by threshold
      2, 0.95, 10, 10, 100, 100,
      // chart, below labels threshold 0.5
      18, 0.4, 64, 64, 320, 320,
      // chart, above threshold
      18, 0.7, 100, 100, 400, 400,
    ]);
    const parsed = parseLayoutDetections(raw, 4, labelsFixture.labels, 0.5);
    expect(parsed).toHaveLength(3);
    expect(parsed.map((p) => p.label)).toEqual(["image", "text", "chart"]);
    expect(parsed[0]!.score).toBeCloseTo(0.9);
    expect(parsed[1]!.score).toBeCloseTo(0.95);
    expect(parsed[2]!.score).toBeCloseTo(0.7);
    expect(parsed[0]).toMatchObject({ x1: 64, y1: 64, x2: 320, y2: 320 });
  });
});

describe("ensureLayoutSession / detectFigureBoxesOnCanvas", () => {
  beforeEach(() => {
    resetLayoutSessionForTests();
    createShouldFail = false;
    mockRun = vi.fn(async () =>
      detectionsTensor([
        // image covering ~25% of 640 — maps to a large CSS figure
        [1, 0.92, 80, 80, 400, 400],
        // text (non-figure)
        [2, 0.99, 10, 10, 200, 200],
        // tiny image (filtered by area)
        [1, 0.9, 0, 0, 5, 5],
        // chart
        [18, 0.8, 100, 100, 500, 500],
      ]),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("labels.json")) {
          return {
            ok: true,
            json: async () => labelsFixture,
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      }),
    );
  });

  afterEach(() => {
    resetLayoutSessionForTests();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("ensureLayoutSession soft-fails when session create throws", async () => {
    createShouldFail = true;
    const result = await ensureLayoutSession();
    expect(result).toEqual({ ok: false, reason: expect.stringMatching(/session create/i) });
  });

  it("detectFigureBoxesOnCanvas returns CSS PageBox[] through filterFigureBoxes", async () => {
    // Square canvas: letterbox pad=0, scale=640/400=1.6; CSS is half bitmap (scale 2)
    const canvas = mockCanvas({
      width: 400,
      height: 400,
      clientWidth: 200,
      clientHeight: 200,
    });

    const result = await detectFigureBoxesOnCanvas(canvas, 3);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const boxes = result.boxes;
    expect(mockRun).toHaveBeenCalled();
    // Only image + chart survive FIGURE_LABELS + area; scores desc
    expect(boxes.every((b) => b.pageIndex === 3)).toBe(true);
    expect(boxes.map((b) => b.label).sort()).toEqual(["chart", "image"]);
    expect(boxes[0]!.score).toBeGreaterThanOrEqual(boxes[1]!.score);

    const image = boxes.find((b) => b.label === "image")!;
    // 640-space (80,80)-(400,400); scale=1.6, pad=0 → bitmap (50,50)-(250,250)
    // CSS = bitmap / 2 → (25,25,100,100)
    expect(image.x).toBeCloseTo(25, 0);
    expect(image.y).toBeCloseTo(25, 0);
    expect(image.w).toBeCloseTo(100, 0);
    expect(image.h).toBeCloseTo(100, 0);
  });

  it("detectFigureBoxesOnCanvas returns ok:false on inference error", async () => {
    mockRun = vi.fn(async () => {
      throw new Error("run boom");
    });
    const canvas = mockCanvas({
      width: 64,
      height: 64,
      clientWidth: 64,
      clientHeight: 64,
    });
    await expect(detectFigureBoxesOnCanvas(canvas, 0)).resolves.toEqual({
      ok: false,
      reason: expect.stringMatching(/run boom/i),
    });
  });

  it("detectFigureBoxesOnCanvas returns empty boxes when only non-figures", async () => {
    mockRun = vi.fn(async () =>
      detectionsTensor([
        [2, 0.99, 10, 10, 200, 200], // text
      ]),
    );
    const canvas = mockCanvas({
      width: 64,
      height: 64,
      clientWidth: 64,
      clientHeight: 64,
    });
    await expect(detectFigureBoxesOnCanvas(canvas, 0)).resolves.toEqual({
      ok: true,
      boxes: [],
    });
  });

  it("does not override ort.env.wasm.wasmPaths", async () => {
    const ort = await import("onnxruntime-web/wasm");
    await ensureLayoutSession();
    expect(ort.env.wasm.wasmPaths).toBe("");
  });
});
