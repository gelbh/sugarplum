import type { SvgIconComponent } from "@mui/icons-material";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import NotesOutlinedIcon from "@mui/icons-material/NotesOutlined";
import QuizOutlinedIcon from "@mui/icons-material/QuizOutlined";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import type { SourceRole } from "./sourceRole";

export const SOURCE_ROLE_ICONS: Record<SourceRole, SvgIconComponent> = {
  lecture: SchoolOutlinedIcon,
  tutorial: MenuBookOutlinedIcon,
  practical: ScienceOutlinedIcon,
  past_paper: QuizOutlinedIcon,
  notes: NotesOutlinedIcon,
};
