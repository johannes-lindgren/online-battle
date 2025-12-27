import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import viteBasicSslPlugin from '@vitejs/plugin-basic-ssl'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
    nodePolyfills({
      // Enable polyfills for crypto and other Node.js modules
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
    viteBasicSslPlugin(),
  ],
  server: {
    port: 3000,
    // Exposes to local network
    host: true,
  },
})
