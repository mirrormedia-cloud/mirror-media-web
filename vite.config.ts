import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

function tiktok_verify_plugin(): import('vite').Plugin {
  return {
    name: 'tiktok-verify',
    configureServer(server) {
      server.middlewares.use('/tiktok', (_req, res) => {
        res.setHeader('Content-Type', 'text/plain');
        res.end('tiktok-developers-site-verification=imlSPg15x5bkk4K4lvm1UfurUig2el28\n');
      });
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), tiktok_verify_plugin()],
    base: '/',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.io', '.ngrok.app', '.ngrok.dev'],
    },
  };
});
