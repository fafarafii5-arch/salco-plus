import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative asset paths are more robust on GitHub Pages project sites and Capacitor builds.
  base: './',
})
