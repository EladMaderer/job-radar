import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// The API runs as Vercel serverless functions under /api. In local `vercel dev` they're served
// on the same origin; this proxy is a convenience if you run a local API on :3000 separately.
export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            '/api': 'http://localhost:3000',
        },
    },
});
