import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Every request the browser makes to /api is forwarded to Flask on :5000.
    //
    // This is worth understanding: without the proxy the browser sees two
    // different origins (localhost:5173 and localhost:5000), which means CORS
    // rules apply and the session cookie needs extra configuration to travel.
    // With the proxy, the browser thinks everything is one origin, cookies
    // "just work", and development matches production - where Flask serves the
    // built React files from the same origin anyway.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
})
