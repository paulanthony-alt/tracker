/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const apiPort = process.env.API_PORT ?? '3001';

export default defineConfig({
  plugins: [react()],
  // Relative base so the built app also works when hosted from a sub-path.
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: { vendor: ['react', 'react-dom', 'react-dom/client', 'zustand', 'zod', 'date-fns'] },
      },
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': `http://localhost:${apiPort}` },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
