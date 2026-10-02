import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The commit a build came from, for the client error log (src/lib/saves.js). Vercel sets
// VERCEL_GIT_COMMIT_SHA at build time; anywhere else it reads 'dev'.
process.env.VITE_APP_VERSION ??= (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})
