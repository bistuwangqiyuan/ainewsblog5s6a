import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
    site: 'https://ainewsblog5s6a.netlify.app',
    vite: {
        plugins: [tailwindcss()]
    },
    integrations: [
        react(),
        sitemap({
            changefreq: 'daily',
            priority: 0.7,
            lastmod: new Date(),
            i18n: {
                defaultLocale: 'zh-CN',
                locales: {
                    'zh-CN': 'zh-CN'
                }
            }
        })
    ],
    adapter: netlify(),
    compressHTML: true,
    build: {
        inlineStylesheets: 'auto'
    }
});
