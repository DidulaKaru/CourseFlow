/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@react-pdf') || id.includes('yoga-layout') || id.includes('pdfkit')) {
            return 'pdf-renderer';
          }
          if (id.includes('@xyflow')) {
            return 'xyflow';
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    alias: {
      '@react-pdf/renderer': '@react-pdf/renderer/lib/react-pdf.browser.js',
    },
  },
})
