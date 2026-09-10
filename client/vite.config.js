import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dir, '..');

export default defineConfig({
  root: dir,
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.join(dir, 'src'),
      '@shared': path.join(repoRoot, 'shared'),
    },
  },
  server: {
    port: 5173,
    // Allow dev tunnels (ngrok, localtunnel, Cloudflare, etc.) to reach the UI.
    // A leading "." wildcards every subdomain of that domain.
    allowedHosts: ['.ngrok-free.app', '.ngrok.io', '.loca.lt', '.trycloudflare.com'],
    proxy: {
      '/api': { target: 'http://127.0.0.1:4280', changeOrigin: false },
    },
  },
  build: {
    outDir: path.join(repoRoot, 'dist'),
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
