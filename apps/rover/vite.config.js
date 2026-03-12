import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/rover': 'http://localhost:8081',
      '/auth': 'http://localhost:8080',
    },
  },
})
