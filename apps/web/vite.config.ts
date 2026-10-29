import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

const CONTENT = new URL('../../content/build/content.json', import.meta.url);

// `virtual:demo-content` is the content bundle as gzip+base64 in the demo build, and empty in the server build.
function demoContent(demo: boolean): Plugin {
  const id = 'virtual:demo-content';
  return {
    name: 'demo-content',
    resolveId: (s) => (s === id ? '\0' + id : null),
    load(s) {
      if (s !== '\0' + id) return null;
      if (!demo) return 'export default "";';
      const gz = gzipSync(readFileSync(CONTENT), { level: 9 });
      return `export default ${JSON.stringify(gz.toString('base64'))};`;
    },
  };
}

// The single-file demo has no server to serve the manifest, icon or service worker.
const stripPwaLinks: Plugin = {
  name: 'strip-pwa-links',
  transformIndexHtml: (html) => html.replace(/\s*<link rel="(manifest|icon)"[^>]*>/g, ''),
};

// `vite build` produces the production SPA served by the API server.
// `vite build --mode demo` produces one self-contained HTML file that runs entirely in the browser.
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    plugins: demo ? [react(), demoContent(true), viteSingleFile(), stripPwaLinks] : [react(), demoContent(false)],
    define: { __DEMO__: JSON.stringify(demo) },
    build: demo
      ? { outDir: 'dist-demo', assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 20_000, copyPublicDir: false }
      : { outDir: 'dist', sourcemap: true },
    server: { port: 5173, proxy: { '/api': 'http://localhost:8080' } },
  };
});
