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

export type StoredCover =
  | {
      source: "unsplash";
      photoId: string;
      imageUrl: string;
      photographerName: string;
      photographerUrl: string;
      photoHtmlUrl: string;
    }
  | {
      source: "custom";
      photoId: string;
      imageUrl: string;
      r2Key: string;
    };

export function coverFieldsFromPhoto(photo: CoverPhoto): StoredCover {
  return {
    source: "unsplash",
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
