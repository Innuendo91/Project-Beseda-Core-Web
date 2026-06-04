import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [vue()],
  root: fileURLToPath(new URL(".", import.meta.url)),
  build: {
    outDir: "../src/public/spa",
    emptyOutDir: true,
    rollupOptions: {
      external: ["/public/mediasoup-client.js"],
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8085",
      "/logout": "http://localhost:8085",
      "/public": "http://localhost:8085",
    },
  },
});
