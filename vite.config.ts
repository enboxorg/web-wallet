import { defineConfig } from 'vite';
import path from 'path';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import tailwindcss from '@tailwindcss/vite';
import nodePolyfills from 'vite-plugin-node-stdlib-browser';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    global: 'globalThis',
  },
  plugins: [
    tailwindcss(),
    svgr(),
    react(),
    nodePolyfills(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,

      pwaAssets: {
        disabled: false,
        config: true,
      },

      manifest: {
        name: 'Enbox',
        short_name: 'Enbox',
        description: 'Your Digital Identity Wallet',
        theme_color: '#ff6b8a',
      },

      injectManifest: {
        maximumFileSizeToCacheInBytes: 5_000_000,
        globPatterns: ['**/*.{js,css,html,json,svg,png,ico}'],
      },

      devOptions: {
        enabled: true,
        navigateFallback: 'index.html',
        suppressWarnings: false,
        type: 'module',
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Keep React framework in its own chunk
            if (
              id.includes('react-dom') ||
              id.includes('react-router') ||
              id.includes('/react/')
            )
              return 'vendor-react';
            // UI libraries (no circular deps with SDK)
            if (
              id.includes('@tanstack') ||
              id.includes('zustand') ||
              id.includes('sonner') ||
              id.includes('lucide') ||
              id.includes('clsx') ||
              id.includes('qrcode')
            )
              return 'vendor-ui';
            // Everything else (including @enbox/* and its transitive deps
            // like node-stdlib-browser, multiformats, etc.) stays in one
            // chunk to avoid circular-dependency initialisation errors.
          }
        },
      },
    },
  },
});
