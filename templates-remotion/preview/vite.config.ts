import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // root = dossier contenant index.html (preview/)
  root: __dirname,
  // base = chemin sous lequel l'app est servie en prod (central-server /remotion-preview/)
  // Tous les assets Vite (JS/CSS) seront préfixés avec ce chemin.
  base: '/remotion-preview/',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
});
