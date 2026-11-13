import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The new public Pages site is hosted at https://gharibg70.github.io/coaster-react-vite/.
  base: process.env.GITHUB_ACTIONS ? '/coaster-react-vite/' : '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/leaflet/')) return 'leaflet';
          if (id.includes('/node_modules/@supabase/')) return 'supabase';
          if (id.includes('/node_modules/react')) return 'react-vendor';
        },
      },
    },
  },
});
