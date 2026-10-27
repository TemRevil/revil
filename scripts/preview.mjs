#!/usr/bin/env node
/**
 * `npm start`: serve the static build (dist/, from `npm run build`) on this machine, routed
 * like production (scripts/lib/static-route.mjs). The site is a static export with no
 * Next.js server, so `next start` cannot serve it.
 *
 *   npm start                 # http://127.0.0.1:4173
 *   PORT=5000 npm start
 */
import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';
import { routeFile } from './lib/static-route.mjs';

const dist = resolve(process.cwd(), process.env.NEXT_DIST_DIR || 'dist');
const port = Number(process.env.PORT) || 4173;

if (!existsSync(resolve(dist, 'index.html'))) {
  console.error(`No build in ${dist}. Run \`npm run build\` first.`);
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
};

createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const file = routeFile(dist, new URL(req.url || '/', 'http://localhost').pathname);
  res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream' });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => {
  console.log(`Previewing ${dist} at http://127.0.0.1:${port}`);
});
