// Builds the framework-free simulation player into a single IIFE script.
// The builder app inlines this script into exported HTML files, so exported
// simulations run offline without the builder.
import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: 'src/player/entry.ts',
      name: 'SimPlayer',
      formats: ['iife'],
      fileName: () => 'player.iife.js',
    },
    outDir: 'src/player/dist',
    emptyOutDir: true,
    minify: true,
  },
});
