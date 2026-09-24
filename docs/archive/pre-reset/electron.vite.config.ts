import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: 'src/main/index.ts', host: 'src/host/index.ts' }, external: ['electron'] } }
  },
  preload: { plugins: [externalizeDepsPlugin()], build: { rollupOptions: { external: ['electron'], output: { format: 'cjs' } } } },
  renderer: { plugins: [react(), tailwindcss()], resolve: { alias: { '@': new URL('./src/renderer/src', import.meta.url).pathname } } }
})
