// vite.config.js snippet
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  // ... other configs
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'), // Maps '@' to the 'src' directory
    },
  },
});
