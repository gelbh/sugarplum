export type AnatomyStructure = {
  id: string;
  label: string;
  /** Preferred THREE object name after load; canvas falls back to the asset root. */
  node: string;
  /** Relative .glb/.gltf path when using multi-asset scenes. */
  asset?: string;
};

export type AnatomySceneManifest = {
  id: string;
  title: string;
  /** Single-file scenes only. Omit when every structure has `asset`. */
  asset?: string;
  structures: AnatomyStructure[];
};
