import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  // Réutilise les assets Remotion (metal_texture.png, lens_flare.mp4, watermark_neopro.png, fonts)
  // au lieu de dupliquer. Les fichiers /players et /logos restent dans studio-poc/public mais
  // celui-ci n'est plus le publicDir — on les sert via un middleware static plus bas.
  publicDir: resolve(__dirname, '../public'),
  plugins: [
    react(),
    {
      // Sert également studio-poc/public/ (players, logos) en parallèle de publicDir.
      name: 'studio-poc-extra-static',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith('/players/') || req.url?.startsWith('/logos/')) {
            const fs = require('fs');
            const path = require('path');
            const filePath = path.join(__dirname, 'public', req.url.split('?')[0]);
            if (fs.existsSync(filePath)) {
              const ext = path.extname(filePath).toLowerCase();
              const mime: Record<string, string> = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.webp': 'image/webp',
              };
              res.setHeader('Content-Type', mime[ext] ?? 'application/octet-stream');
              fs.createReadStream(filePath).pipe(res);
              return;
            }
          }
          next();
        });
      },
    },
  ],
  server: {
    port: 5174,
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://127.0.0.1:5175',
      '/renders': 'http://127.0.0.1:5175',
    },
  },
});
