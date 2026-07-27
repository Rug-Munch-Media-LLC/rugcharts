import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(),
    {
      name: 'cf-bypass',
      transformIndexHtml(html) {
        return html.replace(
          /<script(?!.*data-cfasync)/g,
          '<script data-cfasync="false"'
        );
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    extensions: ['.js', '.ts', '.tsx', '.json'],
  },
  optimizeDeps: {
    include: ['framer-motion', 'react-router-dom', 'lucide-react', 'recharts'],
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts') || id.includes('d3-')) return 'charts'
            if (id.includes('framer-motion')) return 'framer'
            if (id.includes('lucide-react')) return 'icons'
            if (id.includes('react-dom') || id.includes('react/') || id.includes('react-router') || id.includes('scheduler')) return 'react'
            if (id.includes('@radix-ui')) return 'radix'
            if (id.includes('@tanstack')) return 'tanstack'
            return 'vendor'
          }
        },
        entryFileNames: 'assets/[name]-[hash:8].js',
        chunkFileNames: 'assets/[name]-[hash:8].js',
        assetFileNames: 'assets/[name]-[hash:8][extname]',
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true, secure: false },
      '/ws': { target: 'ws://localhost:8000', changeOrigin: true, secure: false, ws: true },
    },
  },
})
