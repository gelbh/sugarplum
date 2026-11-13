export type AnatomyRegion = {
  id: string;
  label: string;
  /** When true, region loads on scene open. If none set, first region wins. */
  defaultActive?: boolean;
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
};

export type AnatomySceneManifest = {
  id: string;
  title: string;
  /** Single-file scenes only. Omit when every structure has `asset`. */
  asset?: string;
  /** Optional body-region groups for staged load. */
  regions?: AnatomyRegion[];
  structures: AnatomyStructure[];
};
