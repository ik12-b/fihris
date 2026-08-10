import fs from 'fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

/**
 * Vite plugin: after production build, remove the uncompressed pustakaDatabase.json
 * from dist/ so the APK / bundle only carries the gzip-compressed version.
 * The search worker falls back to the uncompressed file if .gz is unavailable.
 */
function removeUncompressedDb() {
  return {
    name: 'remove-uncompressed-db',
    apply: 'build' as const,
    closeBundle() {
      const uncompressed = path.resolve(__dirname, 'dist/pustakaDatabase.json');
      try {
        fs.rmSync(uncompressed, {force: true});
        console.log('  → removed uncompressed pustakaDatabase.json (using .gz instead)');
      } catch {
        // ignore — file may not exist if build only emitted assets
      }
    },
  };
}

/**
 * Vite plugin: dev-server middleware that lets the browser fetch local pustaka
 * .txt book files via /api/pustaka/<book-relative-path>.
 * In production this is handled by a real express server (server.js).
 */
function pustakaTextServer() {
  return {
    name: 'pustaka-text-server',
    apply: 'serve' as const,
    configureServer(server) {
      // Endpoint: returns JSON list of .txt files in a directory
      server.middlewares.use('/api/pustaka/list/', async (req, res, next) => {
        try {
          const url = req.url || '';
          // Extract path after /api/pustaka/list/
          let dirPath = url.replace(/^\/api\/pustaka\/list\/?/, '').replace(/\/+$/, '');
          // Decode URL-encoded characters (Vite does NOT auto-decode middleware URLs)
          dirPath = decodeURIComponent(dirPath);
          // Remove any leading slashes that could cause path.join to treat as absolute
          dirPath = dirPath.replace(/^\/+/, '');
          const assetsRoot = path.resolve(__dirname, 'assets/pustaka');
          const safePath = path.normalize(path.join(assetsRoot, dirPath));
          console.log('[pustaka api] dirPath:', dirPath, 'safePath:', safePath, 'exists:', fs.existsSync(safePath));
          if (!safePath.startsWith(assetsRoot)) {
            res.statusCode = 403;
            res.end('Forbidden');
            return;
          }
          if (fs.existsSync(safePath) && fs.statSync(safePath).isDirectory()) {
            const files = fs.readdirSync(safePath).filter((f) => f.endsWith('.txt'));
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ files }));
            return;
          }
          res.statusCode = 404;
          res.end('Directory not found');
        } catch (e) {
          res.statusCode = 500;
          res.end('Server error');
        }
      });

      // Endpoint: returns content of a specific .txt file
      server.middlewares.use('/api/pustaka/file/', async (req, res, next) => {
        try {
          const url = req.url || '';
          let filePath = url.replace(/^\/api\/pustaka\/file\/?/, '').replace(/\/+$/, '');
          filePath = decodeURIComponent(filePath);
          filePath = filePath.replace(/^\/+/, '');
          const assetsRoot = path.resolve(__dirname, 'assets/pustaka');
          const safePath = path.normalize(path.join(assetsRoot, filePath));
          if (!safePath.startsWith(assetsRoot)) {
            res.statusCode = 403;
            res.end('Forbidden');
            return;
          }
          if (fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
            const content = fs.readFileSync(safePath, 'utf-8');
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end(content);
            return;
          }
          res.statusCode = 404;
          res.end('File not found');
        } catch (e) {
          res.statusCode = 500;
          res.end('Server error');
        }
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), removeUncompressedDb(), pustakaTextServer()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
