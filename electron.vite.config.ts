import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/main/index.ts"),
          // utility process entry: the BM25 index is built off the main process
          "search-worker": resolve(__dirname, "src/main/pi/search-worker.ts"),
          // utility process entry: one per open session, hosting Pi's AgentSessionRuntime
          "session-worker": resolve(__dirname, "src/main/pi/session-worker.ts"),
        },
      },
    },
    resolve: { alias: { "@shared": resolve(__dirname, "src/shared") } },
  },
  preload: {
    // sandboxed preload scripts must be CommonJS
    build: {
      rollupOptions: {
        input: resolve(__dirname, "src/preload/index.ts"),
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
    resolve: { alias: { "@shared": resolve(__dirname, "src/shared") } },
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
