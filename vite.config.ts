import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(() => {
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('@tensorflow/tfjs')) return 'vendor-tfjs';
            if (id.includes('jszip')) return 'vendor-jszip';
            if (id.includes('@supabase/supabase-js')) return 'vendor-supabase';
            if (id.includes('@google/genai')) return 'vendor-genai';
            if (
              id.includes('react') ||
              id.includes('react-dom') ||
              id.includes('lucide-react')
            ) {
              return 'vendor-react';
            }
            return 'vendor-misc';
          },
        },
      },
    },
  };
});
