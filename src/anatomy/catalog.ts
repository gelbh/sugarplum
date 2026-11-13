export type AnatomyCatalogEntry = {
  id: string;
  title: string;
  standIn: boolean;
  /** Hub card blurb; defaults to osteology copy when omitted. */
  blurb?: string;
};

const OSTEOLOGY_BLURB = "Region-staged whole-animal osteology";

export const ANATOMY_CATALOG: AnatomyCatalogEntry[] = [
  { id: "canine", title: "Canine", standIn: false, blurb: OSTEOLOGY_BLURB },
  { id: "equine", title: "Equine", standIn: false, blurb: OSTEOLOGY_BLURB },
  { id: "bovine", title: "Bovine", standIn: false, blurb: OSTEOLOGY_BLURB },
  { id: "daniel", title: "Daniel", standIn: false, blurb: OSTEOLOGY_BLURB },
  {
    id: "canine-heart-surface-topology",
    title: "Canine heart surface",
    standIn: false,
    blurb: "IVALA teaching pack · surface topology pickables",
  },
  {
    id: "canine-heart-right-ventricle-removed",
    title: "Canine heart (RV removed)",
    standIn: false,
    blurb: "IVALA teaching pack · internal cardiac landmarks",
  },
  {
    id: "canine-hemithorax",
    title: "Canine hemithorax",
    standIn: false,
    blurb: "IVALA teaching pack · thoracic cavity",
  },
  {
    id: "canine-eye-schematic",
    title: "Canine eye schematic",
    standIn: false,
    blurb: "IVALA teaching pack · globe layers",
  },
  {
    id: "canine-eye-muscles",
    title: "Canine eye muscles",
    standIn: false,
    blurb: "IVALA teaching pack · extraocular muscles",
  },
];
