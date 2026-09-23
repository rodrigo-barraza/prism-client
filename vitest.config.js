import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { transformWithOxc } from "vite";

const forceJsx = {
  name: "force-jsx",
  enforce: "pre",
  async transform(code, id) {
    if (id.endsWith(".js") && !id.includes("node_modules")) {
      return transformWithOxc(code, id, { lang: "jsx" });
    }
  },
};

export default defineConfig({
  plugins: [forceJsx, react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    globals: true,
    passWithNoTests: true,
    // Vitest's defaults plus the agent worktrees under .claude/ — a run from
    // the main checkout (the deploy gate) would otherwise collect every
    // worktree's second copy of the tests.
    exclude: [...configDefaults.exclude, ".claude/**"],
    css: { modules: { classNameStrategy: "non-scoped" } },
    server: {
      deps: {
        inline: [/@rodrigo-barraza\/components-library/],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
