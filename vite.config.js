import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Referrer-Policy': 'no-referrer-when-downgrade',
    },
  },
  preview: {
    headers: {
      'Referrer-Policy': 'no-referrer-when-downgrade',
    },
  },
})
