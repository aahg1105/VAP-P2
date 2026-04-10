import { defineConfig } from "vite";

export default defineConfig({
  base: "/VAP-P2/",
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        // add more entry points as needed
      },
    },
  },
});