import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Spotify no longer accepts `localhost` as a redirect URI host — it must be
// the loopback IP literal. Pinning the dev server here so the URL in the
// browser always matches what you register in the Spotify dashboard.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true, // fail loudly instead of silently moving to 5174 and breaking auth
  },
})
