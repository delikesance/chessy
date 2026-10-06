import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// In development the Rust server runs on :3000 and Vite proxies the socket to it.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/ws": { target: "ws://127.0.0.1:3000", ws: true },
      "/api": { target: "http://127.0.0.1:3000" },
    },
  },
  build: {
    chunkSizeWarningLimit: 1800, // the lazy-loaded Phaser chunk is ~1.6 MB
  },
});
