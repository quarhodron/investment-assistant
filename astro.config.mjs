// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    // Force a single resolved copy of React across the client and SSR graphs.
    // Without this, Vite's dep optimizer can briefly serve two React instances
    // on a cold dev request, producing "Invalid hook call" / "Cannot read
    // properties of null (reading 'useState')" until the page is refreshed.
    resolve: {
      dedupe: ["react", "react-dom"],
    },
    ssr: {
      // Pre-bundle React up front in one consistent pass so the first SSR
      // request isn't served a half-optimized module graph.
      optimizeDeps: {
        include: ["react", "react-dom", "react/jsx-runtime"],
      },
    },
  },
  adapter: cloudflare(),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      ENCRYPTION_KEY: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
