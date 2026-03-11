import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      // Unity fetches sharedassets*.resource relative to the page origin.
      // The files live on jsDelivr — proxy them so we get a 200 instead of 404.
      '^/sharedassets.*\\.resource$': {
        target: 'https://cdn.jsdelivr.net/gh/aukak/hollow-knight',
        changeOrigin: true,
        rewrite: (path) => `/Build${path}`,
      },
    },
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tanstackStart(),
    viteReact(),
  ],
  // See https://github.com/TanStack/router/issues/5738
  resolve: {
    alias: [
      { find: 'use-sync-external-store/shim/index.js', replacement: 'react' },
    ],
  },
})
