import type { SvgIconComponent } from "@mui/icons-material";
import Box from "@mui/material/Box";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import type { ReactNode } from "react";

type Props = {
  icon: SvgIconComponent;
  label: string;
};

export function SelectEnumItem({ icon: Icon, label }: Props): ReactNode {
  return (
    <>
      <ListItemIcon>
        <Icon fontSize="small" aria-hidden />
      </ListItemIcon>
      <ListItemText primary={label} />
    </>
  );
}

export function renderSelectEnumValue({
  icon: Icon,
  label,
}: Props): ReactNode {
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 1,
        minWidth: 0,
      }}
    >
      <Icon fontSize="small" aria-hidden sx={{ flexShrink: 0 }} />
      <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </Box>
    </Box>
  );
}
