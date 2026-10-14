import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      // the fare-collection code lives in ../afc-system (tested there); this app bundles it
      '@afc/shared': here('../afc-system/shared/src/index.ts'),
      '@afc/terminal': here('../afc-system/terminal/src/index.ts'),
      '@noble/ciphers': here('./node_modules/@noble/ciphers'),
      '@noble/curves': here('./node_modules/@noble/curves'),
      '@noble/hashes': here('./node_modules/@noble/hashes'),
    },
  },
  server: { fs: { allow: ['..'] } },
  build: {
    outDir: 'dist',
  },
})
