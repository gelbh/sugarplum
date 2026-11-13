export type AnatomyCatalogEntry = {
  id: string;
  title: string;
  standIn: boolean;
};

export const ANATOMY_CATALOG: AnatomyCatalogEntry[] = [
  {
    id: "canine-limb",
    title: "Canine pelvic limb (right)",
    standIn: false,
  },
];
