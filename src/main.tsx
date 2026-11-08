import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import { theme } from "./theme.ts";
import { syncAtlasPreviewParam } from "./atlas/preview.ts";
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
