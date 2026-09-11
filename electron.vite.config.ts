import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig({
  main: {
    build: { rollupOptions: { input: resolve(__dirname, "src/main/index.ts") } },
  },
  preload: {
    // sandboxed preload scripts must be CommonJS
    build: {
      rollupOptions: {
        input: resolve(__dirname, "src/preload/index.ts"),
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [react(), tailwindcss()],
    build: { rollupOptions: { input: resolve(__dirname, "src/renderer/index.html") } },
    resolve: {
      alias: { "@": resolve(__dirname, "src/renderer"), "@shared": resolve(__dirname, "src/shared") },
    },
  },
});
