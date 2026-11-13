export type AnatomyCatalogEntry = {
  id: string;
  title: string;
  standIn: boolean;
};

export const ANATOMY_CATALOG: AnatomyCatalogEntry[] = [
  {
    id: "spike-limb",
    title: "Spike limb (stand-in)",
    standIn: true,
  },
];
