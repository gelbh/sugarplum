import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import { registerSW } from "virtual:pwa-register";
import App from "./app/App";
import { theme } from "./theme";
import { syncAtlasPreviewParam } from "./atlas/preview";
import "./styles/brand.css";

// https://vite-pwa-org.netlify.app/guide/auto-update
registerSW({ immediate: true });
syncAtlasPreviewParam();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <InitColorSchemeScript attribute="data" defaultMode="system" />
    <ThemeProvider
      theme={theme}
      defaultMode="system"
      modeStorageKey="sugarplum-mode"
    >
      <CssBaseline enableColorScheme />
      <App />
    </ThemeProvider>
  </StrictMode>,
);
