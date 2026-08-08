import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 5173,
    strictPort: true,
  },
  build: {
    // Phaser is one big chunk; no point warning about it every build.
    chunkSizeWarningLimit: 2000,
  },
});
