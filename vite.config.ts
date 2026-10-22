import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Relative asset paths: the built app works from any URL or subfolder (routing is hash-based).
  base: './',
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true },
});
