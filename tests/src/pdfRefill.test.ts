import { afterEach, describe, expect, it, vi } from "vitest";
import { refillPdfOcr } from "../../src/api/client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("refillPdfOcr", () => {
  it("does not download when the worker says refill is false", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ refill: false }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const recognize = vi.fn();
    await refillPdfOcr("mat-1", recognize);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(recognize).not.toHaveBeenCalled();
  });

  it("posts recognized pages", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/ocr-refetch")) {
        return new Response(
          JSON.stringify({
            refill: true,
            downloadUrl: "https://example.test/file.pdf",
            expiresIn: 900,
            startPage: 1,
            windowEnd: 120,
            coveredPages: [1],
          }),
          { status: 200 },
        );
      }
      if (url === "https://example.test/file.pdf") {
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }
      return new Response(JSON.stringify({ stored: 2 }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await refillPdfOcr("mat-1", async () => [{ page: 9, text: "later" }]);
    const append = fetchMock.mock.calls.find((call) =>
      String(call[0]).endsWith("/ocr-pages"),
    );
    expect(append?.[1]?.body).toBe(
      JSON.stringify({ pages: [{ page: 9, text: "later" }] }),
    );
  });
});
