export type AnatomyRegion = {
  id: string;
  label: string;
  /** When true, region loads on scene open. If none set, first region wins. */
  defaultActive?: boolean;
};

export type AnatomyStructureInfo = {
  summary?: string;
  alsoKnownAs?: string[];
};

export type AnatomyStructure = {
  id: string;
  label: string;
  /** Preferred THREE object name after load; canvas falls back to the asset root. */
  node: string;
  /** Relative .glb/.gltf path when using multi-asset scenes. */
  asset?: string;
  /** Required when the manifest lists `regions`. */
  region?: string;
  /** Optional textbook-safe facts for the info panel / Test Yourself synonyms. */
  info?: AnatomyStructureInfo;
};

export type AnatomyClip = {
  id: string;
  label: string;
  /** Exact glTF animation.name after load. */
  animation: string;
  /** Structure ids forced visible while this clip is active. */
  reveal?: string[];
  /** Default true when omitted. Herniation clips set false (play-once). */
  loop?: boolean;
};

export type AnatomySceneManifest = {
  id: string;
  title: string;
  /** Single-file scenes only. Omit when every structure has `asset`. */
  asset?: string;
  /** Optional body-region groups for staged load. */
  regions?: AnatomyRegion[];
  structures: AnatomyStructure[];
  /** Optional named glTF animations for the clip bar. */
  clips?: AnatomyClip[];
};
