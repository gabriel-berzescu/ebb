import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', watch: { ignored: ['**/shots/**', '**/.cache/**'] } },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
});
