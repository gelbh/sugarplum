export type AnatomyCatalogEntry = {
  id: string;
  title: string;
  standIn: boolean;
};

export const ANATOMY_CATALOG: AnatomyCatalogEntry[] = [
  { id: "canine", title: "Canine", standIn: false },
  { id: "equine", title: "Equine", standIn: false },
  { id: "bovine", title: "Bovine", standIn: false },
  { id: "daniel", title: "Daniel", standIn: false },
];
