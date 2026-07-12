import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { devServerProxy } from "../../vite.dev-proxy";

const clientDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(clientDir, "..");
const repoRoot = path.resolve(webDir, "..");

/**
 * Build/deploy web: stesso `src/`, `index.html` e `public/` della app desktop.
 * Non copiare in web/app-src — una sola sorgente in root.
 */
export default defineConfig({
  root: repoRoot,
  envDir: repoRoot,
  publicDir: path.join(repoRoot, "public"),
  plugins: [react(), tailwindcss()],
  define: {
    "import.meta.env.VITE_BRANCHEFY_WEB": JSON.stringify("1"),
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: devServerProxy,
  },
  build: {
    outDir: path.join(webDir, "dist"),
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
