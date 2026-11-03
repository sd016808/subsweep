// Tiny static file server for headless-Chrome pages (screenshots and browser tests).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.css': 'text/css',
};

/** Serves files under `root`, plus in-memory HTML pages registered with `page()`. */
export async function startServer(rootDir) {
  const root = path.resolve(rootDir); // normalised, so the containment check works on Windows
  const pages = new Map();
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (pages.has(url)) {
      res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
      res.end(pages.get(url));
      return;
    }
    const file = path.join(root, url);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    page(route, html) {
      pages.set(route, html);
      return base + route;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
