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
      output: {
        // Split vendor libraries into separate cacheable chunks
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3')) {
            return 'charts-vendor';
          }
          if (id.includes('node_modules/@radix-ui')) {
            return 'radix-vendor';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'icons-vendor';
          }
          if (id.includes('node_modules/motion') || id.includes('node_modules/framer-motion')) {
            return 'motion-vendor';
          }
          if (id.includes('node_modules/date-fns')) {
            return 'dates-vendor';
          }
          if (id.includes('node_modules/')) {
            return 'vendor';
          }
        },
      },
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
