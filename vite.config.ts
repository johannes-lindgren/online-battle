import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import viteBasicSslPlugin from '@vitejs/plugin-basic-ssl'
import wasm from 'vite-plugin-wasm'

const useBasicSsl = true

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    wasm(),
    // TODO remove
    ...(useBasicSsl ? [viteBasicSslPlugin()] : []),
  ],
  server: {
    port: 3000,
    // Exposes to local network
    host: true,
  },
})
