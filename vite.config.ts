/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Electron은 file:// 로 index.html 을 읽기 때문에 상대 경로가 필요하다.
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  test: { environment: 'node' },
});
