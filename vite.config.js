import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const debugLogging = env.VITE_DEBUG_LOGGING !== 'false'

  return {
    plugins: [react()],
    build: {
      outDir: 'dist',
      sourcemap: debugLogging,
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: !debugLogging,
          drop_debugger: !debugLogging,
        },
      },
      target: 'es2020',
      cssCodeSplit: true,
      reportCompressedSize: true,
      rollupOptions: {
        input: {
          main: 'index.html',
          logs: './src/pages/logs.html',
        },
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
    server: {
      port: 3000,
      open: false,
      // Proxy API requests to local Cloudflare Workers dev server
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8787',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    preview: {
      port: 4173,
    },
  }
})
