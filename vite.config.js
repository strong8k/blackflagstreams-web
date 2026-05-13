import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    target: 'es2020',
    cssCodeSplit: true,
    reportCompressedSize: true,
  },
  server: {
    port: 3000,
    open: false,
  },
  preview: {
    port: 4173,
  },
})