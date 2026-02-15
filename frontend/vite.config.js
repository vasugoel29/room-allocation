import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss  from '@tailwindcss/vite'
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/login': 'http://localhost:4000',
      '/register': 'http://localhost:4000',
      '/admin': 'http://localhost:4000',
    }
  }
})
