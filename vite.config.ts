import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const hostname =
    env.VITE_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VITE_VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    process.env.VITE_VERCEL_URL;
  let socialImage: string | undefined;
  if (hostname) {
    try {
      const origin = new URL(hostname.includes('://') ? hostname : `https://${hostname}`);
      if (origin.protocol === 'https:' || origin.protocol === 'http:')
        socialImage = new URL('/social-preview.png', origin).href;
    } catch {
      /* Local builds can use the relative image without a public hostname. */
    }
  }
  return {
    plugins: [
      react(),
      {
        name: 'social-preview-origin',
        transformIndexHtml(html) {
          return socialImage
            ? html.replaceAll('content="/social-preview.png"', `content="${socialImage}"`)
            : html;
        },
      },
    ],
  };
});
