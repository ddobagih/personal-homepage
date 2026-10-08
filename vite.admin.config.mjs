import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const platform = (name) => path.join(projectRoot, "admin-src/platform", name);

export default defineConfig({
  root: path.join(projectRoot, "admin-src"),
  base: "/assets/notion-app/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^convex\/react$/, replacement: platform("convex.tsx") },
      { find: /^@clerk\/nextjs$/, replacement: platform("clerk.tsx") },
      { find: /^next\/navigation$/, replacement: platform("navigation.ts") },
      { find: /^next\/dynamic$/, replacement: platform("dynamic.tsx") },
      { find: /^next\/image$/, replacement: platform("image.tsx") },
      { find: /^next\/link$/, replacement: platform("link.tsx") },
      { find: "@", replacement: path.join(projectRoot, "admin-src/upstream") }
    ]
  },
  build: {
    outDir: path.join(projectRoot, "assets/notion-app"),
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022"
  }
});
