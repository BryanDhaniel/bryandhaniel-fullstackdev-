import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The API is proxied rather than called cross-origin. This means the
    // browser sees a single origin in development, so the httpOnly refresh
    // cookie is sent on same-origin requests without depending on CORS
    // credential handling — and `SameSite=Lax` behaves as it will in
    // production, where both are served from one host. See docs/adr/0004.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
