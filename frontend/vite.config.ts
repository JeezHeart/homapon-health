import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Single-bundle app with the Supabase client; warning limit raised
    // to match instead of code-splitting a student capstone demo.
    chunkSizeWarningLimit: 700,
  },
})
