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
  {
    id: "feline-skull-foramina",
    title: "Feline skull foramina",
    standIn: false,
    blurb: "IVALA breadth pack · feline skull",
  },
  {
    id: "feline-skull-landmarks",
    title: "Feline skull landmarks",
    standIn: false,
    blurb: "IVALA breadth pack · feline skull",
  },
  {
    id: "feline-skull-teeth",
    title: "Feline skull teeth",
    standIn: false,
    blurb: "IVALA breadth pack · feline dentition",
  },
  {
    id: "chinchilla-skull",
    title: "Chinchilla skull",
    standIn: false,
    blurb: "IVALA breadth pack · small mammal",
  },
  {
    id: "guinea-pig-skull",
    title: "Guinea pig skull",
    standIn: false,
    blurb: "IVALA breadth pack · small mammal",
  },
  {
    id: "rabbit-skull",
    title: "Rabbit skull",
    standIn: false,
    blurb: "IVALA breadth pack · small mammal",
  },
  {
    id: "canine-heart-internal-topology",
    title: "Canine heart internal topology",
    standIn: false,
    blurb: "IVALA teaching pack · internal chambers",
  },
  {
    id: "canine-heart-vasculature",
    title: "Canine heart vasculature",
    standIn: false,
    blurb: "IVALA teaching pack · great vessels",
  },
  {
    id: "canine-skull-bones",
    title: "Canine skull bones",
    standIn: false,
    blurb: "IVALA teaching pack · cranial osteology",
  },
  {
    id: "canine-skull-canals",
    title: "Canine skull canals",
    standIn: false,
    blurb: "IVALA teaching pack · skull canals",
  },
  {
    id: "canine-skull-landmarks",
    title: "Canine skull landmarks",
    standIn: false,
    blurb: "IVALA teaching pack · hyoid and landmarks",
  },
  {
    id: "canine-skull-muscles",
    title: "Canine skull muscles",
    standIn: false,
    blurb: "IVALA teaching pack · head musculature",
  },
  {
    id: "canine-skull-scan-landmarks",
    title: "Canine skull scan landmarks",
    standIn: false,
    blurb: "IVALA teaching pack · scan landmarks",
  },
  {
    id: "canine-skull-sinuses",
    title: "Canine skull sinuses",
    standIn: false,
    blurb: "IVALA teaching pack · paranasal sinuses",
  },
  {
    id: "canine-foramina-and-teeth",
    title: "Canine foramina and teeth",
    standIn: false,
    blurb: "IVALA teaching pack · foramina and dentition",
  },
  {
    id: "canine-larynx",
    title: "Canine larynx",
    standIn: false,
    blurb: "IVALA teaching pack · larynx",
  },
  {
    id: "canine-middle-and-inner-ear",
    title: "Canine middle and inner ear",
    standIn: false,
    blurb: "IVALA teaching pack · ear",
  },
  {
    id: "canine-cranial-nerves",
    title: "Canine cranial nerves",
    standIn: false,
    blurb: "IVALA teaching pack · cranial nerves",
  },
  {
    id: "canine-dental-nerve-blocks",
    title: "Canine dental nerve blocks",
    standIn: false,
    blurb: "IVALA teaching pack · dental blocks",
  },
  {
    id: "canine-brain-key-structures",
    title: "Canine brain key structures",
    standIn: false,
    blurb: "IVALA teaching pack · brain",
  },
  {
    id: "canine-brain-ventricles",
    title: "Canine brain ventricles",
    standIn: false,
    blurb: "IVALA teaching pack · ventricles",
  },
  {
    id: "canine-forelimb-arteries",
    title: "Canine forelimb arteries",
    standIn: false,
    blurb: "IVALA teaching pack · forelimb arteries",
  },
  {
    id: "canine-forelimb-bones",
    title: "Canine forelimb bones",
    standIn: false,
    blurb: "IVALA teaching pack · forelimb osteology",
  },
  {
    id: "canine-forelimb-bony-landmarks",
    title: "Canine forelimb bony landmarks",
    standIn: false,
    blurb: "IVALA teaching pack · forelimb landmarks",
  },
  {
    id: "canine-forelimb-musculature",
    title: "Canine forelimb musculature",
    standIn: false,
    blurb: "IVALA teaching pack · forelimb muscles",
  },
  {
    id: "canine-forelimb-musculature-scan",
    title: "Canine forelimb musculature scan",
    standIn: false,
    blurb: "IVALA teaching pack · forelimb muscle scan",
  },
  {
    id: "canine-forelimb-veins",
    title: "Canine forelimb veins",
    standIn: false,
    blurb: "IVALA teaching pack · forelimb veins",
  },
  {
    id: "canine-hindlimb-arteries",
    title: "Canine hindlimb arteries",
    standIn: false,
    blurb: "IVALA teaching pack · hindlimb arteries",
  },
  {
    id: "canine-hindlimb-bones",
    title: "Canine hindlimb bones",
    standIn: false,
    blurb: "IVALA teaching pack · hindlimb osteology",
  },
  {
    id: "canine-hindlimb-bony-landmarks",
    title: "Canine hindlimb bony landmarks",
    standIn: false,
    blurb: "IVALA teaching pack · hindlimb landmarks",
  },
  {
    id: "canine-hindlimb-musculature",
    title: "Canine hindlimb musculature",
    standIn: false,
    blurb: "IVALA teaching pack · hindlimb muscles",
  },
  {
    id: "canine-hindlimb-musculature-scan",
    title: "Canine hindlimb musculature scan",
    standIn: false,
    blurb: "IVALA teaching pack · hindlimb muscle scan",
  },
  {
    id: "canine-hindlimb-veins",
    title: "Canine hindlimb veins",
    standIn: false,
    blurb: "IVALA teaching pack · hindlimb veins",
  },
  {
    id: "canine-stifle",
    title: "Canine stifle",
    standIn: false,
    blurb: "IVALA teaching pack · stifle ligaments",
  },
  {
    id: "canine-brachial-plexus",
    title: "Canine brachial plexus",
    standIn: false,
    blurb: "IVALA teaching pack · brachial plexus",
  },
];
