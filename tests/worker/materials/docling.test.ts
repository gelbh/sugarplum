import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractFiguresViaDocling,
  MAX_FIGURES_PER_PDF,
} from "../../../worker/materials/docling";
import { MAX_IMAGE_BYTES } from "../../../worker/materials/limits";

/** 1×1 PNG */
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

function doclingSuccessBody(pictures: unknown[]) {
  return {
    document: {
      json_content: {
        pictures,
        texts: [
          {
            self_ref: "#/texts/0",
            text: "A sample caption",
          },
        ],
      },
    },
    status: "success",
  };
}

function onePicture(pageNo = 2) {
  return {
    prov: [{ page_no: pageNo }],
    captions: [{ cref: "#/texts/0" }],
    image: {
      mimetype: "image/png",
      uri: `data:image/png;base64,${TINY_PNG_B64}`,
    },
  };
}

describe("extractFiguresViaDocling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty crops when DOCLING_URL is unset", async () => {
    const fetchFn = vi.fn();
    const result = await extractFiguresViaDocling(
      {},
      new ArrayBuffer(0),
      { fetchFn },
    );
    expect(result).toEqual({ crops: [] });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("maps a successful Docling picture to one crop", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json(doclingSuccessBody([onePicture(3)])),
    );
    const result = await extractFiguresViaDocling(
      {
        DOCLING_URL: "http://127.0.0.1:5001",
        DOCLING_API_KEY: "test-key",
      },
      new ArrayBuffer(8),
      { fetchFn },
    );
    expect(result.warning).toBeUndefined();
    expect(result.crops).toHaveLength(1);
    expect(result.crops[0]).toMatchObject({
      page: 3,
      index: 0,
      caption: "A sample caption",
      mimeType: "image/png",
    });
    expect(result.crops[0].bytes.byteLength).toBeGreaterThan(0);

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:5001/v1/convert/file");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("soft-fails on HTTP 500 with a warning", async () => {
    const fetchFn = vi.fn(async () => new Response("boom", { status: 500 }));
    const result = await extractFiguresViaDocling(
      {
        DOCLING_URL: "http://127.0.0.1:5001/",
        DOCLING_API_KEY: "test-key",
      },
      new ArrayBuffer(0),
      { fetchFn },
    );
    expect(result.crops).toEqual([]);
    expect(result.warning).toMatch(/500|docling|unavailable/i);
  });

  it(`truncates to ${MAX_FIGURES_PER_PDF} figures`, async () => {
    const pictures = Array.from({ length: 25 }, (_, i) => onePicture(i + 1));
    const fetchFn = vi.fn(async () =>
      Response.json(doclingSuccessBody(pictures)),
    );
    const result = await extractFiguresViaDocling(
      {
        DOCLING_URL: "http://127.0.0.1:5001",
        DOCLING_API_KEY: "test-key",
      },
      new ArrayBuffer(0),
      { fetchFn },
    );
    expect(result.crops).toHaveLength(MAX_FIGURES_PER_PDF);
    expect(result.crops[0].page).toBe(1);
    expect(result.crops[MAX_FIGURES_PER_PDF - 1].page).toBe(
      MAX_FIGURES_PER_PDF,
    );
  });

  it("skips crops larger than MAX_IMAGE_BYTES", async () => {
    const oversized = new Uint8Array(MAX_IMAGE_BYTES + 1);
    const oversizedB64 = Buffer.from(oversized).toString("base64");
    const fetchFn = vi.fn(async () =>
      Response.json(
        doclingSuccessBody([
          {
            prov: [{ page_no: 1 }],
            captions: [],
            image: {
              mimetype: "image/png",
              uri: `data:image/png;base64,${oversizedB64}`,
            },
          },
          onePicture(2),
        ]),
      ),
    );
    const result = await extractFiguresViaDocling(
      {
        DOCLING_URL: "http://127.0.0.1:5001",
        DOCLING_API_KEY: "test-key",
      },
      new ArrayBuffer(0),
      { fetchFn },
    );
    expect(result.crops).toHaveLength(1);
    expect(result.crops[0].page).toBe(2);
  });

  it("sends DOCLING_API_KEY as X-Api-Key when set", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json(doclingSuccessBody([])),
    );
    await extractFiguresViaDocling(
      {
        DOCLING_URL: "http://127.0.0.1:5001",
        DOCLING_API_KEY: "secret",
      },
      new ArrayBuffer(0),
      { fetchFn },
    );
    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("x-api-key")).toBe("secret");
    expect(headers.get("authorization")).toBeNull();
  });

  it("does not POST when DOCLING_URL is set but API key is missing", async () => {
    const fetchFn = vi.fn();
    const result = await extractFiguresViaDocling(
      { DOCLING_URL: "https://docling.example.com" },
      new ArrayBuffer(8),
      { fetchFn },
    );
    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.crops).toEqual([]);
    expect(result.warning).toMatch(/api key|DOCLING_API_KEY/i);
  });

  it("does not POST when DOCLING_URL is set but API key is whitespace", async () => {
    const fetchFn = vi.fn();
    const result = await extractFiguresViaDocling(
      { DOCLING_URL: "https://docling.example.com", DOCLING_API_KEY: "  " },
      new ArrayBuffer(8),
      { fetchFn },
    );
    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.crops).toEqual([]);
    expect(result.warning).toMatch(/api key|DOCLING_API_KEY/i);
  });

  it("preserves JPEG MIME from the data URL", async () => {
    // Minimal JPEG SOI/EOI markers (not a full image; decoding only needs bytes).
    const jpegB64 = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64");
    const fetchFn = vi.fn(async () =>
      Response.json(
        doclingSuccessBody([
          {
            prov: [{ page_no: 1 }],
            captions: [],
            image: {
              mimetype: "image/jpeg",
              uri: `data:image/jpeg;base64,${jpegB64}`,
            },
          },
        ]),
      ),
    );
    const result = await extractFiguresViaDocling(
      {
        DOCLING_URL: "http://127.0.0.1:5001",
        DOCLING_API_KEY: "test-key",
      },
      new ArrayBuffer(0),
      { fetchFn },
    );
    expect(result.crops).toHaveLength(1);
    expect(result.crops[0].mimeType).toBe("image/jpeg");
  });

  it("drops pictures with unsupported MIME types", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json(
        doclingSuccessBody([
          {
            prov: [{ page_no: 1 }],
            captions: [],
            image: {
              mimetype: "image/gif",
              uri: `data:image/gif;base64,${TINY_PNG_B64}`,
            },
          },
          onePicture(2),
        ]),
      ),
    );
    const result = await extractFiguresViaDocling(
      {
        DOCLING_URL: "http://127.0.0.1:5001",
        DOCLING_API_KEY: "test-key",
      },
      new ArrayBuffer(0),
      { fetchFn },
    );
    expect(result.crops).toHaveLength(1);
    expect(result.crops[0].page).toBe(2);
    expect(result.crops[0].mimeType).toBe("image/png");
  });
});
