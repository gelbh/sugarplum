import { describe, expect, it } from "vitest";
import { normalizeParasiteName } from "../../../worker/atlas/names";

describe("normalizeParasiteName", () => {
  it.each([
    ["Ancyclostoma caninum", "Ancylostoma caninum"],
    ["Telodorsagia circumcinta", "Teladorsagia circumcincta"],
    ["Dictyocaulus viviparous", "Dictyocaulus viviparus"],
    ["Dictylocaulus viviparous", "Dictyocaulus viviparus"],
    ["Stongylus edentates", "Strongylus edentatus"],
    ["Stongylus vulgaris", "Strongylus vulgaris"],
    ["Syngymus trachea", "Syngamus trachea"],
    ["Spirocera lupi", "Spirocerca lupi"],
    ["Raillientina spp.", "Raillietina spp."],
    ["Davainae proglottina", "Davainea proglottina"],
    ["Thelezia lacrymalis", "Thelazia lacrymalis"],
    ["Fasciolides magna", "Fascioloides magna"],
    ["Toxocaris leonina", "Toxascaris leonina"],
    ["Ascarida galli", "Ascaridia galli"],
    ["Eimieria species", "Eimeria spp."],
    ["Dicrocoelium dentriticum", "Dicrocoelium dendriticum"],
    ["Trichomonas fetus", "Tritrichomonas foetus"],
  ])("fixes %s to %s and flags the correction", (raw, canonical) => {
    expect(normalizeParasiteName(raw)).toEqual({ canonical, corrected: true });
  });

  it.each([
    ["Fasciola hepatica", "Fasciola hepatica"],
    ["  toxocara   CANIS ", "Toxocara canis"],
    ["Nematodirus battus and", "Nematodirus battus"],
    ["Capillaria aerophila &", "Capillaria aerophila"],
    ["Cyathostomin spp", "Cyathostomin spp."],
    ["Babesia species", "Babesia spp."],
    ["Onchocerca sp.", "Onchocerca spp."],
    ["Taenia", "Taenia spp."],
    ["(Ctenocephalides felis)", "Ctenocephalides felis"],
    ["Echinococcus granulosus equinus", "Echinococcus granulosus"],
  ])("normalises %s to %s without flagging", (raw, canonical) => {
    expect(normalizeParasiteName(raw)).toEqual({ canonical, corrected: false });
  });

  it.each(["", "   ", "and", "123 abc", "Fasciola 2"])(
    "returns null for %j",
    (raw) => {
      expect(normalizeParasiteName(raw)).toBeNull();
    },
  );
});
