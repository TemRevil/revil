/**
 * Which file of the static build answers a request path, routed the way production's
 * deploy/hostinger/.htaccess routes it, so the local preview behaves like the live site:
 *   1. `<path>.html` when it exists (the export writes /book as book.html),
 *   2. the file itself (or a folder's index.html),
 *   3. otherwise share.html, the noindex app shell that opens share links.
 */
import { existsSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

const isFile = (p) => existsSync(p) && statSync(p).isFile();

export function routeFile(dist, pathname) {
  const root = resolve(dist);
  const fallback = join(root, 'share.html');
  let path;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return fallback;
  }
  const inside = (p) => p === root || p.startsWith(root + sep);
  const target = resolve(root, '.' + path);
  if (!inside(target)) return fallback;

  const bare = target.replace(/[\\/]+$/, '');
  if (bare !== root && inside(bare) && isFile(bare + '.html')) return bare + '.html';
  if (isFile(target)) return target;
  if (isFile(join(target, 'index.html'))) return join(target, 'index.html');
  return fallback;
}
