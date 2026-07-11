import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(rootDir, "../..");

export default defineConfig({
  root: rootDir,
  envDir: path.resolve(rootDir, ".."),
  publicDir: path.resolve(repoRoot, "public"),
  plugins: [react(), tailwindcss()],
  define: {
    "import.meta.env.VITE_BRANCHEFY_WEB": JSON.stringify("1"),
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.resolve(rootDir, "..", "dist"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/hls.js")) return "hls";
          if (id.includes("node_modules/framer-motion")) return "motion";
          if (id.includes("node_modules/@supabase")) return "supabase";
          if (
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/react/")
          ) {
            return "vendor";
          }
        },
      },
    },
  },
});
