import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // Relative paths for local file loading in Android WebView
  build: {
    outDir: 'app/src/main/assets',
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
  },
});
