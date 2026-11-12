import type { SvgIconComponent } from "@mui/icons-material";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import ChecklistOutlinedIcon from "@mui/icons-material/ChecklistOutlined";
import CropOutlinedIcon from "@mui/icons-material/CropOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import QuestionAnswerOutlinedIcon from "@mui/icons-material/QuestionAnswerOutlined";
import ShortTextOutlinedIcon from "@mui/icons-material/ShortTextOutlined";
import type { CardType } from "../api/client";

export const CARD_TYPE_ICONS: Record<CardType, SvgIconComponent> = {
  qa: QuestionAnswerOutlinedIcon,
  cloze: ShortTextOutlinedIcon,
  mcq: ChecklistOutlinedIcon,
  image_label: ImageOutlinedIcon,
  diagram: AccountTreeOutlinedIcon,
  occlusion: CropOutlinedIcon,
};
