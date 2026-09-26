import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    resolve: {
      alias: {
        '@': path.resolve(rootDir, 'src'),
      },
    },
    build: {
      outDir: 'dist',
      target: 'esnext',
      lib: {
        entry: './src/main.ts',
        name: '__component__',
        formats: ['iife'],
        fileName: 'index',
        cssFileName: 'style'
      },
    },
    define: {
      'process.env': {},
      __DEV__: mode === 'development'
    },
    plugins: [vue()]
  }
})
