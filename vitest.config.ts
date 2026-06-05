import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/.git/**",
      "**/.idea/**",
      "**/.DS_Store",
      "**/*.swp",
      "**/*.swo",
      "dist*/**",
      ".astro/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/**"],
      exclude: ["src/db/**", "src/components/ui/**", "**/*.astro"],
    },
  },
});
