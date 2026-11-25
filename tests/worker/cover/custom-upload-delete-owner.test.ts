import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getR2,
  resetTestDb,
  seedR2,
  seedSession,
  seedSubject,
  seedUser,
} from "../harness";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";

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
  it("deletes the signed-in user's cover", async () => {
    const env = cfEnv;
    await seedOwner(env);
    installUnsplash(
      [photo("chosen", 3, "https://images.unsplash.com/chosen?ixid=1")],
      [],
    );
    const put = await app.request(
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
    );
    expect(put.status).toBe(200);

    const del = await app.request(
      "/api/covers",
      {
        method: "DELETE",
        headers: authHeaders(true),
        body: JSON.stringify({ ownerKind: "subject", ownerId: "sub-1" }),
      },
      env,
    );
    expect(del.status).toBe(204);

    const list = await app.request(
      "/api/covers",
      { headers: authHeaders() },
      env,
    );
    const listed = (await list.json()) as { covers: unknown[] };
    expect(listed.covers).toEqual([]);
  });

  it("uploads a custom cover and serves it only to the owner", async () => {
    const env = cfEnv;
    await seedOwner(env);
    const uploadRes = await app.request(
      "/api/covers/upload-url",
      {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          ownerKind: "subject",
          ownerId: "sub-1",
          contentType: "image/jpeg",
          size: 12,
        }),
      },
      env,
    );
    expect(uploadRes.status).toBe(200);
    const upload = (await uploadRes.json()) as {
      imageId: string;
      uploadUrl: string;
      r2Key: string;
    };
    expect(upload.r2Key).toContain("covers/user-a/subject/sub-1/");
    expect(upload.uploadUrl).toContain(upload.r2Key);

    await seedR2(env, upload.r2Key, "fake-bytes");

    const put = await app.request(
      "/api/covers/custom",
      {
        method: "PUT",
        headers: authHeaders(true),
        body: JSON.stringify({
          ownerKind: "subject",
          ownerId: "sub-1",
          r2Key: upload.r2Key,
          photoId: upload.imageId,
        }),
      },
      env,
    );
    expect(put.status).toBe(200);
    const saved = (await put.json()) as {
      source: string;
      imageUrl: string;
      r2Key: string;
      photographerName?: string;
    };
    expect(saved.source).toBe("custom");
    expect(saved.photographerName).toBeUndefined();
    expect(saved.imageUrl).toBe(
      `/api/covers/media?key=${encodeURIComponent(upload.r2Key)}`,
    );
    expect(saved.r2Key).toBe(upload.r2Key);

    const media = await app.request(
      saved.imageUrl,
      { headers: authHeaders() },
      env,
    );
    expect(media.status).toBe(200);
    expect(media.headers.get("content-type")).toBe("image/jpeg");

    await seedUser(env, {
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-b", "user-b");
    const foreign = await app.request(
      saved.imageUrl,
      { headers: { cookie: `${SESSION_COOKIE}=sess-b` } },
      env,
    );
    expect(foreign.status).toBe(404);

    const del = await app.request(
      "/api/covers",
      {
        method: "DELETE",
        headers: authHeaders(true),
        body: JSON.stringify({ ownerKind: "subject", ownerId: "sub-1" }),
      },
      env,
    );
    expect(del.status).toBe(204);
    expect(await getR2(env, upload.r2Key)).toBeUndefined();
  });

  it("rejects foreign cover keys and keeps same-key custom PUT idempotent", async () => {
    const env = cfEnv;
    await seedOwner(env);
    const r2Key = "covers/user-a/subject/sub-1/img-1.jpg";
    await seedR2(env, r2Key, "bytes");

    const bad = await app.request(
      "/api/covers/custom",
      {
        method: "PUT",
        headers: authHeaders(true),
        body: JSON.stringify({
          ownerKind: "subject",
          ownerId: "sub-1",
          r2Key: "covers/user-b/subject/sub-1/evil.jpg",
        }),
      },
      env,
    );
    expect(bad.status).toBe(400);

    const put = await app.request(
      "/api/covers/custom",
      {
        method: "PUT",
        headers: authHeaders(true),
        body: JSON.stringify({
          ownerKind: "subject",
          ownerId: "sub-1",
          r2Key,
          photoId: "img-1",
        }),
      },
      env,
    );
    expect(put.status).toBe(200);

    const again = await app.request(
      "/api/covers/custom",
      {
        method: "PUT",
        headers: authHeaders(true),
        body: JSON.stringify({
          ownerKind: "subject",
          ownerId: "sub-1",
          r2Key,
          photoId: "img-1",
        }),
      },
      env,
    );
    expect(again.status).toBe(200);
    expect(await getR2(env, r2Key)).toBe("bytes");

    const media = await app.request(
      `/api/covers/media?key=${encodeURIComponent(r2Key)}`,
      {},
      env,
    );
    expect(media.status).toBe(401);
  });
});
