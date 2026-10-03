import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// Puerto del servidor de juego al que se redirigen /api y /socket.io en desarrollo.
const SERVER_PORT = process.env.KEST_SERVER_PORT || 3000;

export default defineConfig({
  root: path.join(here, 'client'),
  publicDir: false,
  server: {
    port: 5173,
    proxy: {
      '/api': `http://127.0.0.1:${SERVER_PORT}`,
      '/socket.io': { target: `http://127.0.0.1:${SERVER_PORT}`, ws: true },
    },
    fs: { allow: [here] },
  },
  build: {
    outDir: path.join(here, 'dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
});
