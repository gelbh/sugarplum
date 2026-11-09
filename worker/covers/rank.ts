export type CoverPhoto = {
  id: string;
  downloads: number;
  imageUrl: string;
  photographerName: string;
  photographerUrl: string;
  photoHtmlUrl: string;
  downloadLocation: string;
};

export type CoverSource = "unsplash" | "custom";

export type StoredCover = {
  photoId: string;
  imageUrl: string;
  photographerName: string;
  photographerUrl: string;
  photoHtmlUrl: string;
  source: CoverSource;
  r2Key?: string | null;
};

export function rankCoverPhotos(photos: CoverPhoto[]): CoverPhoto[] {
  // Keep Unsplash search relevance order; downloads sort fights relevance.
  return photos.slice(0, 6);
}

export function coverFieldsFromPhoto(
  photo: CoverPhoto,
  source: CoverSource = "unsplash",
): StoredCover {
  return {
    photoId: photo.id,
    imageUrl: photo.imageUrl,
    photographerName: photo.photographerName,
    photographerUrl: photo.photographerUrl,
    photoHtmlUrl: photo.photoHtmlUrl,
    source,
  };
}

export function resolveChosenPhoto(photoId: string, photos: CoverPhoto[]): CoverPhoto {
  const found = photos.find((photo) => photo.id === photoId);
  if (!found) throw new Error("unknown photo");
  return found;
}
