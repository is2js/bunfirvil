import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const pagesBase = "/bunfirvil/";

export default defineConfig({
  base: pagesBase,
  build: {
    target: "es2022",
    sourcemap: false,
    rollupOptions: {
      input: {
        showcase: resolve(__dirname, "index.html"),
        manage: resolve(__dirname, "manage/index.html"),
        guides: resolve(__dirname, "guides/index.html"),
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
