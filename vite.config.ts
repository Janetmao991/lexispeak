import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icons/apple-touch-icon.png'],
        manifest: {
          name: 'LexiSpeak — Speaking Studio',
          short_name: 'LexiSpeak',
          description: 'AI speaking practice: four conversation modes with audio-level coaching, sharing your LexiAI vocabulary.',
          theme_color: '#FDFBF7',
          background_color: '#FDFBF7',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
          globIgnores: ['**/fixture-*.js'], // demo-only data: fetched on demand, not precached for everyone
          navigateFallback: '/index.html',
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'google-fonts' },
            },
          ],
        },
      }),
    ],
    server: { port: 5175, strictPort: true },
    define: {
      // AI keys are BYOK (typed into Settings, kept in the browser) — never bake them into the bundle.
      'process.env.API_KEY': 'undefined',
      'process.env.ANTHROPIC_API_KEY': 'undefined',
      'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL),
      'process.env.SUPABASE_KEY': JSON.stringify(env.SUPABASE_KEY)
    }
  };
});
