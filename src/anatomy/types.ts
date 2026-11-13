export type AnatomyStructure = {
  id: string;
  label: string;
  node: string;
};

export type AnatomySceneManifest = {
  id: string;
  title: string;
  asset: string;
  structures: AnatomyStructure[];
};
