import netlify from "@netlify/vite-plugin-tanstack-start";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // The site has no Edge Functions, so local dev does not start Netlify's Deno-based emulator.
  plugins: [tailwindcss(), tanstackStart(), netlify({ dev: { edgeFunctions: { enabled: false } } }), viteReact()],
});
