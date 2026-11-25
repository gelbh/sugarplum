import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  resetTestDb,
  seedSession,
  seedSubject,
  seedUser,
} from "./harness";
import { afterEach, describe, expect, it } from "vitest";
import type { ExecutionContext } from "hono";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

type StubPhoto = {
  id: string;
  downloads?: number;
  imageUrl: string;
  photographerName: string;
  photographerUrl: string;
  photoHtmlUrl: string;
  downloadLocation: string;
};

type FetchCall = { url: string; redirect?: RequestRedirect };

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function seedOwner(env: Bindings, withKey = true) {
  await seedUser(env, {
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSession(env, "sess-a", "user-a");
  await seedSubject(env, {
    id: "sub-1",
    user_id: "user-a",
    title: "Anatomy",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  if (withKey) env.UNSPLASH_ACCESS_KEY = "test-key";
}

function authHeaders(json = false): HeadersInit {
  return {
    cookie: `${SESSION_COOKIE}=sess-a`,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

function installUnsplash(
  photos: StubPhoto[],
  searchIds: string[],
): FetchCall[] {
  const calls: FetchCall[] = [];
  const byId = new Map(photos.map((photo) => [photo.id, photo]));
  globalThis.fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (!url.startsWith("https://api.unsplash.com/")) {
      return originalFetch(input, init);
    }
    calls.push({ url, redirect: init?.redirect });
    const headers = new Headers(init?.headers);
    if (
      headers.get("authorization") !== "Client-ID test-key" ||
      headers.get("accept-version") !== "v1"
    ) {
      return new Response("bad auth", { status: 401 });
    }
    if (url.startsWith("https://api.unsplash.com/search/photos?")) {
      return Response.json({
        results: searchIds.map((id) => ({ id })),
      });
    }
    const photoMatch = url.match(
      /^https:\/\/api\.unsplash\.com\/photos\/([^/]+)$/,
    );
    if (photoMatch) {
      const photo = byId.get(decodeURIComponent(photoMatch[1]));
      if (!photo) return new Response("missing", { status: 404 });
      const body: Record<string, unknown> = {
        id: photo.id,
        urls: { small: photo.imageUrl },
        user: {
          name: photo.photographerName,
          links: { html: photo.photographerUrl },
        },
        links: {
          html: photo.photoHtmlUrl,
          download_location: photo.downloadLocation,
        },
      };
      if (photo.downloads !== undefined) body.downloads = photo.downloads;
      return Response.json(body);
    }
    return new Response("missing", { status: 404 });
  };
  return calls;
}

function photo(
  id: string,
  downloads: number | undefined,
  imageUrl: string,
): StubPhoto {
  return {
    id,
    downloads,
    imageUrl,
    photographerName: "Ada",
    photographerUrl: "https://unsplash.com/@ada",
    photoHtmlUrl: `https://unsplash.com/photos/${id}`,
    downloadLocation: `https://api.unsplash.com/photos/${id}/download?ixid=secret-${id}`,
  };
}

describe("cover routes", () => {
  it("sorts Unsplash results by downloads and pages", async () => {
    const env = cfEnv;
    await seedOwner(env);
    const photos = [
      photo("p1", 1, "https://images.unsplash.com/p1?ixid=1"),
      photo("p2", 2, "https://images.unsplash.com/p2?ixid=1"),
      photo("p3", 3, "https://images.unsplash.com/p3?ixid=1"),
      photo("p4", 4, "https://images.unsplash.com/p4?ixid=1"),
      photo("p5", 5, "https://images.unsplash.com/p5?ixid=1"),
      photo("p0", undefined, "https://images.unsplash.com/p0?ixid=1"),
    ];
    const calls = installUnsplash(
      photos,
      photos.map((item) => item.id),
    );

    const res = await app.request(
      "/api/covers/search?q=heart&page=2",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      photos: Array<{
        photoId: string;
        imageUrl: string;
        downloadLocation?: string;
        source?: string;
      }>;
      page: number;
      totalPages: number;
    };
    expect(calls[0]?.url).toBe(
      "https://api.unsplash.com/search/photos?query=heart&page=2&order_by=relevant&content_filter=high&orientation=landscape&per_page=10",
    );
    expect(calls[0]?.url).not.toContain("stats");
    expect(body.page).toBe(2);
    expect(body.totalPages).toBeGreaterThanOrEqual(1);
    expect(body.photos.map((item) => item.photoId)).toEqual([
      "p5",
      "p4",
      "p3",
      "p2",
      "p1",
    ]);
    expect(body.photos[0]?.imageUrl).toBe(
      "https://images.unsplash.com/p5?ixid=1",
    );
    expect(
      body.photos.every((item) => item.downloadLocation === undefined),
    ).toBe(true);
    expect(body.photos.every((item) => item.source === "unsplash")).toBe(true);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("test-key");
    expect(raw).not.toContain("Client-ID");
    expect(raw).not.toContain("Authorization");
    expect(raw).not.toContain("secret-");
  });

  it("stores urls.small from the photo payload and ignores a body image url", async () => {
    const env = cfEnv;
    await seedOwner(env);
    const calls = installUnsplash(
      [photo("chosen", 12, "https://images.unsplash.com/chosen?ixid=keep-me")],
      [],
    );

    const res = await app.request(
      "/api/covers",
      {
        method: "PUT",
        headers: authHeaders(true),
        body: JSON.stringify({
          ownerKind: "subject",
          ownerId: "sub-1",
          photoId: "chosen",
          imageUrl: "https://evil.example/not-this.jpg",
        }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const saved = (await res.json()) as { imageUrl: string; photoId: string };
    expect(saved.photoId).toBe("chosen");
    expect(saved.imageUrl).toBe(
      "https://images.unsplash.com/chosen?ixid=keep-me",
    );
    const raw = JSON.stringify(saved);
    expect(raw).not.toContain("test-key");
    expect(raw).not.toContain("Client-ID");
    expect(raw).not.toContain("Authorization");
    expect(raw).not.toContain("secret-");
    expect(raw).not.toContain("evil.example");

    const download = calls.find((call) => call.url.includes("/download"));
    expect(download?.redirect).toBe("manual");

    const list = await app.request(
      "/api/covers",
      { headers: authHeaders() },
      env,
    );
    expect(list.status).toBe(200);
    const listed = (await list.json()) as {
      covers: Array<{ imageUrl: string; ownerKind: string; ownerId: string }>;
    };
    expect(listed.covers).toEqual([
      expect.objectContaining({
        ownerKind: "subject",
        ownerId: "sub-1",
        photoId: "chosen",
        imageUrl: "https://images.unsplash.com/chosen?ixid=keep-me",
        photographerName: "Ada",
        source: "unsplash",
      }),
    ]);
  });

  it("returns 404 when the photo id is unknown", async () => {
    const env = cfEnv;
    await seedOwner(env);
    installUnsplash([], []);

    const res = await app.request(
      "/api/covers",
      {
        method: "PUT",
        headers: authHeaders(true),
        body: JSON.stringify({
          ownerKind: "subject",
          ownerId: "sub-1",
          photoId: "missing",
        }),
      },
      env,
    );
    expect(res.status).toBe(404);
    const raw = await res.text();
    expect(raw).not.toContain("test-key");
    expect(raw).not.toContain("Authorization");
  });

  it("rejects an empty search query", async () => {
    const env = cfEnv;
    await seedOwner(env);
    const res = await app.request(
      "/api/covers/search?q=%20%20",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      detail: "Title required",
      title: "Title required",
      status: 400,
      type: "https://sugarplum.gelbhart.dev/problems/http-exception",
    });
  });

  it("returns 503 when Unsplash is not configured", async () => {
    const env = cfEnv;
    delete (env as { UNSPLASH_ACCESS_KEY?: string }).UNSPLASH_ACCESS_KEY;
    await seedOwner(env, false);
    const res = await app.request(
      "/api/covers/search?q=heart",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(503);
    expect(res.headers.get("content-type") ?? "").toMatch(
      /application\/problem\+json/,
    );
    expect(await res.json()).toMatchObject({
      type: "https://sugarplum.gelbhart.dev/problems/cover-search-not-configured",
      title: "Cover search is not configured",
      detail: "Cover search is not configured",
      status: 503,
    });
  });

  it("keeps the download ping alive without waiting on it", async () => {
    const env = cfEnv;
    await seedOwner(env);
    installUnsplash(
      [photo("chosen", 12, "https://images.unsplash.com/chosen?ixid=keep-me")],
      [],
    );
    const innerFetch = globalThis.fetch;
    let releaseDownload = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseDownload = resolve;
    });
    let markDownloadStarted = () => {};
    const downloadStarted = new Promise<void>((resolve) => {
      markDownloadStarted = resolve;
    });
    globalThis.fetch = async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.includes("/download")) {
        markDownloadStarted();
        await gate;
      }
      return innerFetch(input, init);
    };

    const waited: Promise<unknown>[] = [];
    const executionCtx: ExecutionContext = {
      waitUntil(promise) {
        waited.push(promise);
      },
      passThroughOnException() {},
      props: {},
    };

    let returned = false;
    const resPromise = app
      .request(
        "/api/covers",
        {
          method: "PUT",
          headers: authHeaders(true),
          body: JSON.stringify({
            ownerKind: "subject",
            ownerId: "sub-1",
            photoId: "chosen",
          }),
        },
        env,
        executionCtx,
      )
      .then((res) => {
        returned = true;
        return res;
      });

    try {
      await downloadStarted;
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(returned).toBe(true);
      expect(waited).toHaveLength(1);
      expect((await resPromise).status).toBe(200);
      let pingSettled = false;
      void waited[0]?.finally(() => {
        pingSettled = true;
      });
      await Promise.resolve();
      expect(pingSettled).toBe(false);
    } finally {
      releaseDownload();
      await waited[0];
    }
  });
});
