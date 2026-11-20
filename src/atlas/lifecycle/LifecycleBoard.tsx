import useMediaQuery from "@mui/material/useMediaQuery";
import type { Theme } from "@mui/material/styles";
import { lifecyclePanelImage } from "./lifecyclePanelImage";
import LifecycleSwimlane from "./LifecycleSwimlane";
import LifecycleVertical from "./LifecycleVertical";
import SelectedStagePanel from "./SelectedStagePanel";
import type { AtlasImageView, DatasetFields } from "../types";

type Props = {
  fields: DatasetFields;
  images?: AtlasImageView[];
  onEditLifecycle?: () => void;
  /** Test override for `breakpoints.down("md")`. */
  mobile?: boolean;
};

export default function LifecycleBoard({
  fields,
  images = [],
  onEditLifecycle,
  mobile: mobileProp,
}: Props) {
  const mobileMq = useMediaQuery((t: Theme) => t.breakpoints.down("md"));
  const mobile = mobileProp ?? mobileMq;
  if (mobile) {
    return (
      <LifecycleVertical
        fields={fields}
        images={images}
        onEditLifecycle={onEditLifecycle}
      />
    );
  }
  return (
    <LifecycleSwimlane
      fields={fields}
      afterBoard={({ current, index, stages, transport }) => (
        <SelectedStagePanel
          stage={current}
          index={index}
          total={stages.length}
          image={lifecyclePanelImage(images, current.imageId)}
          transport={transport}
          onEdit={onEditLifecycle}
          animate
        />
      )}
    />
  );
}
