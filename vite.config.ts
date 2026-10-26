import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    cloudflare(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon-32.png",
        "apple-touch-icon.png",
        "logo.png",
        "icon-192.png",
        "icon-512.png",
      ],
      manifest: {
        name: "Sugarplum",
        short_name: "Sugarplum",
        description:
          "Spaced-repetition study app that turns notes into flashcards",
        display: "standalone",
        theme_color: "#5B2C6F",
        background_color: "#ffffff",
        start_url: "/",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
});
