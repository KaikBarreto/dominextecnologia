import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      // autoUpdate + skipWaiting + clientsClaim: o SW novo assume controle
      // imediato no próximo load. Sem isso, o cliente fica preso ao bundle
      // JS antigo e tem que "limpar cache" pra ver release novo (incidente
      // do 1.8.10 — Glacial Cold reportou 10min de cache).
      registerType: "autoUpdate",
      injectRegister: false,
      manifest: false,
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,otf}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/~oauth/],
        runtimeCaching: [
          // Supabase storage (assets publicos: logos, fotos) — pode cachear.
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "supabase-storage",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          // NUNCA cachear REST/auth/realtime/functions: respostas dependem de
          // JWT/RLS e ficar com OS de outra empresa em cache quebra share-links.
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/(rest|auth|realtime|functions)\/.*/i,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-stylesheets",
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // ESTRATÉGIA DE CHUNKING — minimalista de propósito.
        //
        // O ganho real da landing vem do code-splitting POR ROTA (React.lazy em
        // App.tsx): o entry deixou de ser um monolito de 8MB e as libs pesadas
        // (recharts, leaflet, jspdf/xlsx, tiptap, ogl) passam a viver nos chunks
        // LAZY das telas internas que as usam — nunca tocam a landing.
        //
        // LIÇÃO MEDIDA (não reverter sem medir): forçar essas libs em
        // manualChunks PRÓPRIOS é CONTRAPRODUCENTE. O rollup hoista um símbolo
        // compartilhado pro entry e passa a IMPORTAR ESTATICAMENTE o vendor
        // inteiro — então a landing pré-carregava recharts/jspdf à toa, e o
        // último vendor da lista sempre virava âncora do entry. Deixar o rollup
        // distribuir essas libs nos chunks lazy mantém o entry da landing limpo.
        // (Também evita o TDZ que aparece ao fatiar react/radix/supabase.)
        //
        // Único override: fixar o helper `__vitePreload` num chunk leaf próprio.
        // Sem isso o rollup o ancora dentro de um vendor pesado e o entry arrasta
        // esse vendor só pelo helper. É folha, sem ciclo → TDZ-safe.
        manualChunks(id) {
          if (id.includes("vite/preload-helper")) return "vite-preload-helper";
          return undefined;
        },
      },
    },
  },
}));
