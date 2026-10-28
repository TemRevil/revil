import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { routeFile } from './static-route.mjs';

let dist;

beforeAll(() => {
  dist = mkdtempSync(join(tmpdir(), 'revil-dist-'));
  for (const f of ['index.html', 'book.html', 'share.html', 'projects.html', 'projects/demo.html', '_next/static/a.js']) {
    mkdirSync(join(dist, f, '..'), { recursive: true });
    writeFileSync(join(dist, f), f);
  }
});
afterAll(() => rmSync(dist, { recursive: true, force: true }));

describe('routeFile (the .htaccess routing, for the local preview)', () => {
  const at = (p) => routeFile(dist, p);

  it('serves the homepage for /', () => {
    expect(at('/')).toBe(join(dist, 'index.html'));
  });

  it('serves real files as they are', () => {
    expect(at('/_next/static/a.js')).toBe(join(dist, '_next/static/a.js'));
  });

  it('maps an extensionless route, with or without a trailing slash, to its .html file', () => {
    expect(at('/book')).toBe(join(dist, 'book.html'));
    expect(at('/book/')).toBe(join(dist, 'book.html'));
    expect(at('/projects')).toBe(join(dist, 'projects.html'));
    expect(at('/projects/demo')).toBe(join(dist, 'projects/demo.html'));
  });

  it('answers a share code or an unknown address with the noindex shell', () => {
    expect(at('/ab12cd')).toBe(join(dist, 'share.html'));
    expect(at('/no/such/page')).toBe(join(dist, 'share.html'));
  });

  it('never leaves the build folder', () => {
    expect(at('/../package.json')).toBe(join(dist, 'share.html'));
    expect(at('/%2e%2e/%2e%2e/etc/passwd')).toBe(join(dist, 'share.html'));
  });
});
