import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: '.',
  base: './',
  plugins: [react()],
  publicDir: 'resources',
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  server: {
    port: 5173,
    strictPort: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer')
    }
  }
});
