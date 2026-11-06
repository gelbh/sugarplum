export type CoverPhoto = {
  id: string;
  downloads: number;
  imageUrl: string;
  photographerName: string;
  photographerUrl: string;
  photoHtmlUrl: string;
  downloadLocation: string;
};

export type StoredCover = {
  photoId: string;
  imageUrl: string;
  photographerName: string;
  photographerUrl: string;
  photoHtmlUrl: string;
};

export function rankCoverPhotos(photos: CoverPhoto[]): CoverPhoto[] {
  return [...photos].sort((a, b) => b.downloads - a.downloads).slice(0, 6);
}

export function coverFieldsFromPhoto(photo: CoverPhoto): StoredCover {
  return {
    photoId: photo.id,
    imageUrl: photo.imageUrl,
    photographerName: photo.photographerName,
    photographerUrl: photo.photographerUrl,
    photoHtmlUrl: photo.photoHtmlUrl,
  };
}

export function resolveChosenPhoto(photoId: string, photos: CoverPhoto[]): CoverPhoto {
  const found = photos.find((photo) => photo.id === photoId);
  if (!found) throw new Error("unknown photo");
  return found;
}
