import { defineConfig } from 'vite';
import { loadEnv } from 'vite';
import path from 'path';

export default defineConfig(({ command, mode }) => {
  // Load env file based on `mode` in the parent directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, path.resolve(process.cwd(), '..'), '');

  return {
    root: 'src',
    base: './',  // This ensures assets are served correctly
    build: {
      outDir: '../dist',
      assetsDir: 'assets',
      emptyOutDir: true,
      sourcemap: true
    },
    server: {
      port: 5173
    },
    define: {
      // Make env variables available globally in the app
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL),
      'import.meta.env.VITE_SUPABASE_KEY': JSON.stringify(env.VITE_SUPABASE_KEY),
    }
  };
});