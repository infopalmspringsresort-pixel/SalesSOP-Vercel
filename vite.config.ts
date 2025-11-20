import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    // Removed problematic Replit plugins that cause util.promisify errors
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    hmr: {
      overlay: false, // Disable error overlay for faster dev
    },
    // Disable dev sourcemaps to reduce first-load CPU during cold starts
    sourcemapIgnoreList: () => true,
  },
  css: {
    devSourcemap: false,
  },
  optimizeDeps: {
    include: ["react", "react-dom", "@tanstack/react-query"],
    // Allow Vite to cache pre-bundled deps instead of forcing every cold start
    force: false,
    exclude: ["mongodb", "connect-mongodb-session"],
  },
  ssr: {
    noExternal: ["mongodb", "connect-mongodb-session"],
  },
});
