export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  runtimeConfig: {
    nearAuthEnabled: false,
    nearAuthBaseUrl: "",
    nearAuthSecret: "",
    nearAuthDatabaseUrl: "",
    nearAuthDatabaseCa: "",
    nearAuthRecoveryEnabled: false,
    nearAuthSmtpUrl: "",
    nearAuthMailFrom: "",
    nearAuthSupabaseSecretKey: "",
    public: {
      supabaseUrl: "",
      supabasePublishableKey: "",
      mapStyleUrl: "",
      nearPasskeyEnabled: false,
      nearRecoveryEnabled: false,
    },
  },
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
