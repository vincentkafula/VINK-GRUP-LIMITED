import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
  plugins: [
    figmaAssetResolver(),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Expose env variables to the client
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.0.0'),
  },
  assetsInclude: ['**/*.svg', '**/*.csv', '**/*.pdf'],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Raise warning threshold — we know the app is large
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      // NOTE: We intentionally do NOT use a hand-rolled `manualChunks`
      // function here. Grouping unrelated node_modules packages into
      // arbitrary buckets by name (react-vendor, charts-vendor, vendor, etc.)
      // repeatedly caused production-only crashes of the form:
      //
      //   Uncaught ReferenceError: can't access lexical declaration '<x>'
      //   before initialization
      //
      // This happens because several of our dependencies (d3/recharts, and
      // others pulled into the generic "vendor" bucket) have circular
      // internal imports. When modules with circular references are split
      // across chunk boundaries by name-matching instead of by their actual
      // dependency graph, Rollup can emit minified `let`/`const` bindings in
      // an order that violates the temporal dead zone — the app then throws
      // before React ever mounts, resulting in a blank page in production
      // (this does not reproduce with `vite dev` or `vite preview` locally
      // in the same way, which is why it slipped through).
      //
      // Rollup's default automatic chunking is dependency-graph-aware and
      // keeps circularly-dependent modules together, so we let it handle
      // splitting on its own instead of overriding it.
    },
    // Inline only tiny assets (<4KB) as base64; larger ones stay as separate files
    assetsInlineLimit: 4096,
    // Enable minification
    minify: 'esbuild',
    // Generate source maps only for errors (smaller output)
    sourcemap: false,
    // Improve CSS chunking
    cssCodeSplit: true,
  },
  // Dev server proxy — avoids CORS during local development
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: env.VITE_API_URL ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    // Serve SPA — all routes fall back to index.html
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  },
  // Speed up dev server
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'lucide-react',
      'recharts',
      'sonner',
    ],
  },
  }
})
