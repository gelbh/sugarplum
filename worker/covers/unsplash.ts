import type { CoverPhoto } from "./model";

function unsplashHeaders(accessKey: string): HeadersInit {
  return {
    Authorization: `Client-ID ${accessKey}`,
    "Accept-Version": "v1",
  };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function coverPhotoFromDetail(body: unknown, fallbackId: string): CoverPhoto | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const photo = body as {
    id?: unknown;
    downloads?: unknown;
    urls?: { small?: unknown };
    user?: { name?: unknown; links?: { html?: unknown } };
    links?: { html?: unknown; download_location?: unknown };
  };
  const id = asString(photo.id) || fallbackId;
  if (!id) return null;
  const downloads =
    typeof photo.downloads === "number" && Number.isFinite(photo.downloads)
      ? photo.downloads
      : 0;
  return {
    id,
    downloads,
    imageUrl: asString(photo.urls?.small),
    photographerName: asString(photo.user?.name),
    photographerUrl: asString(photo.user?.links?.html),
    photoHtmlUrl: asString(photo.links?.html),
    downloadLocation: asString(photo.links?.download_location),
  };
}

async function discardBody(res: Response): Promise<void> {
  await res.arrayBuffer().catch(() => undefined);
}

export async function fetchCoverPhoto(
  accessKey: string,
  photoId: string,
  fetchImpl?: typeof fetch,
): Promise<CoverPhoto | null> {
  const doFetch = fetchImpl ?? globalThis.fetch;
  const res = await doFetch(
    `https://api.unsplash.com/photos/${encodeURIComponent(photoId)}`,
    { headers: unsplashHeaders(accessKey) },
  );
  if (!res.ok) {
    await discardBody(res);
    return null;
  }
  try {
    return coverPhotoFromDetail(await res.json(), photoId);
  } catch {
    return null;
  }
}

export async function searchCoverPhotos(
  accessKey: string,
  query: string,
  fetchImpl?: typeof fetch,
): Promise<CoverPhoto[]> {
  const doFetch = fetchImpl ?? globalThis.fetch;
  const url =
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}` +
    "&order_by=relevant&content_filter=high&orientation=landscape&per_page=10";
  const searchRes = await doFetch(url, { headers: unsplashHeaders(accessKey) });
  if (!searchRes.ok) {
    await discardBody(searchRes);
    throw new Error(`Unsplash search failed (${searchRes.status})`);
  }
  const payload = (await searchRes.json()) as { results?: { id?: unknown }[] };
  const ids = (payload.results ?? []).flatMap((row) => {
    const id = asString(row?.id);
    return id ? [id] : [];
  });
  const details = await Promise.all(
    ids.map(async (id) => {
      try {
        return await fetchCoverPhoto(accessKey, id, doFetch);
      } catch {
        return null;
      }
    }),
  );
  const photos = details.filter((photo): photo is CoverPhoto => photo != null);
  // Keep Unsplash search relevance order; take first six only.
  return photos.slice(0, 6);
}

export async function trackDownload(
  accessKey: string,
  downloadLocation: string,
  fetchImpl?: typeof fetch,
): Promise<void> {
  const doFetch = fetchImpl ?? globalThis.fetch;
  try {
    const res = await doFetch(downloadLocation, {
      headers: unsplashHeaders(accessKey),
      redirect: "manual",
    });
    await discardBody(res);
  } catch {
    return;
  }
}
