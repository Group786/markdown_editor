import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path';

const __dirname = path.resolve();

// https://vitejs.dev/config
export default defineConfig({
    plugins: [react(),
              tailwindcss(),],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'), // Maps '@' to the project's 'src' directory
        },
    },
});
