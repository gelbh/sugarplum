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
        "maskable-icon-512.png",
      ],
      manifest: {
        id: "/",
        name: "Sugarplum",
        short_name: "Sugarplum",
        description:
          "Spaced-repetition study app that turns notes into flashcards",
        display: "standalone",
        start_url: "/today",
        scope: "/",
        theme_color: "#5B2C6F",
        background_color: "#1e0d1b",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "/maskable-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // ORT / DocLayout weights are 15–30MB; never precache them.
        globIgnores: ["**/*.wasm", "**/models/**", "**/ort/**"],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
});
