export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: false },
  css: ["maplibre-gl/dist/maplibre-gl.css", "~/assets/css/main.css"],
  app: {
    head: {
      title: "Near — いつものみんなを、もっと近くに。",
      meta: [
        { name: "viewport", content: "width=device-width, initial-scale=1" },
      ],
    },
  },
});
