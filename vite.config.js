import { defineConfig } from 'vite';

// Geliştirme: `npm run dev:server` (3000) + `npm run dev` — /api istekleri yerel API sunucusuna gider.
const target = `http://localhost:${process.env.API_PORT || process.env.PORT || 3000}`;

export default defineConfig({
  server: { proxy: { '/api': target } },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      // three.js ayrı parça: uygulama kodu değişince büyük kütüphane tarayıcı önbelleğinde kalır
      output: { codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three/ }] } },
    },
  },
});
