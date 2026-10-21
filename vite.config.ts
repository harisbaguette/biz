import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 4317,
    strictPort: true,
    proxy: {
      "/api": {
        target: loadEnv("development", ".", "BIZ_").BIZ_API_ORIGIN || "http://127.0.0.1:4318",
        changeOrigin: true,
        headers: { "X-Biz-Origin": "http://127.0.0.1:4317" },
      },
    },
  },
  build: {
    manifest: "build-manifest.json",
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: { react: ["react", "react-dom"] },
      },
    },
  },
});
