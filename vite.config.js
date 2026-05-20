import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig(({ command }) => ({
    base: command === 'serve' ? '/' : '/cuble/',
    resolve: {
        alias: {
            'cubing-internal': path.resolve(__dirname, 'node_modules/cubing/dist/lib/cubing'),
        },
    },
    optimizeDeps: {
        exclude: [
            'cubing',
            'cubing/search',
            'cubing/scramble',
            'cubing-internal/chunks/chunk-V27EM5TJ.js',
            'cubing-internal/chunks/search-dynamic-solve-4x4x4-E576AITS.js',
            'cubing-internal/chunks/twips-YHXBF55O.js',
        ],
    },
    build: {
        target: 'es2022',
    },
    plugins: [VitePWA({
        manifest: {
            "name": "Cuble",
            "short_name": "Cuble",
            "description": "The Wordle of Rubik's Cubes! Guess the scramble in as few tries as you can.",
            "icons": [
                {
                    "src": "https://raw.githubusercontent.com/DanielZTing/cuble/master/favicon.png",
                    "sizes": "512x512",
                    "type": "image/png"
                }
            ],
            "display": "standalone",
            "background_color": "black",
            "theme_color": "black"
        }
    })],
}));
