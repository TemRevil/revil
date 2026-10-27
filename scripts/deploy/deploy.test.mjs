// The server-side release scripts, run with bash against a throwaway DEPLOY_ROOT.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const hasBash = spawnSync('bash', ['-c', 'true']).status === 0;

let root;
const base = () => join(root, '.codex-deploy');
const live = (...p) => join(root, 'public_html', ...p);

function write(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

/** Packs `files` ({ name: text }) as the release archive activate.sh expects. */
function stageArchive(files) {
  const src = mkdtempSync(join(tmpdir(), 'release-src-'));
  for (const [name, text] of Object.entries(files)) write(join(src, name), text);
  mkdirSync(join(base(), 'incoming'), { recursive: true });
  const out = spawnSync('bash', ['-c', 'tar -czf "$1" -C "$2" .', '_', toBash(join(base(), 'incoming', 'release.tgz')), toBash(src)]);
  rmSync(src, { recursive: true, force: true });
  expect(out.status, out.stderr?.toString()).toBe(0);
}

// Git Bash on Windows wants /c/... paths; elsewhere this is a no-op.
const toBash = (p) => (process.platform === 'win32' ? p.replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`).replace(/\\/g, '/') : p);

function run(script, sha = 'abc123') {
  return spawnSync('bash', [toBash(resolve(here, script))], {
    env: { ...process.env, DEPLOY_ROOT: toBash(root), RELEASE_SHA: sha },
    encoding: 'utf8',
  });
}

const backups = () => (existsSync(join(base(), 'backups')) ? readdirSync(join(base(), 'backups')).sort() : []);

describe.skipIf(!hasBash)('release activation and rollback', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deploy-root-'));
    write(live('index.html'), 'old site');
    write(live('.well-known', 'acme.txt'), 'verify');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('swaps the release in, keeps the old site as a backup and the server-only files', () => {
    stageArchive({ 'index.html': 'new site', 'book.html': 'book' });
    const out = run('activate.sh');
    expect(out.status, out.stdout + out.stderr).toBe(0);
    expect(readFileSync(live('index.html'), 'utf8')).toBe('new site');
    expect(readFileSync(live('.well-known', 'acme.txt'), 'utf8')).toBe('verify');
    expect(readFileSync(join(base(), 'current'), 'utf8').trim()).toBe('abc123');
    expect(existsSync(join(base(), 'incoming', 'release.tgz'))).toBe(false);
    const [backup] = backups();
    expect(readFileSync(join(base(), 'backups', backup, 'public_html', 'index.html'), 'utf8')).toBe('old site');
  });

  it('does nothing the second time once the release is live', () => {
    stageArchive({ 'index.html': 'new site' });
    expect(run('activate.sh').status).toBe(0);
    const again = run('activate.sh');
    expect(again.status).toBe(0);
    expect(again.stdout).toContain('already live');
    expect(backups()).toHaveLength(1);
  });

  it('refuses a release without index.html and leaves the live site alone', () => {
    stageArchive({ 'other.html': 'x' });
    expect(run('activate.sh').status).not.toBe(0);
    expect(readFileSync(live('index.html'), 'utf8')).toBe('old site');
    expect(backups()).toHaveLength(0);
  });

  it('keeps only the newest five backups', () => {
    for (let i = 1; i <= 7; i++) write(join(base(), 'backups', `2026010100000${i}`, 'public_html', 'index.html'), `b${i}`);
    write(join(base(), 'backups', 'not-a-backup', 'keep.txt'), 'x');
    stageArchive({ 'index.html': 'new site' });
    expect(run('activate.sh').status).toBe(0);
    const kept = backups().filter((n) => /^\d{14}$/.test(n));
    expect(kept).toHaveLength(5);
    expect(kept).not.toContain('20260101000001');
    expect(kept).not.toContain('20260101000003');
    expect(backups()).toContain('not-a-backup');
  });

  it('rolls a failed release back to the site that was live before it', () => {
    stageArchive({ 'index.html': 'broken site' });
    expect(run('activate.sh').status).toBe(0);
    const out = run('rollback.sh');
    expect(out.status, out.stdout + out.stderr).toBe(0);
    expect(readFileSync(live('index.html'), 'utf8')).toBe('old site');
    expect(readFileSync(join(base(), 'current'), 'utf8').trim()).toBe('rolled-back-from-abc123');
    const [parked] = readdirSync(join(base(), 'failed'));
    expect(readFileSync(join(base(), 'failed', parked, 'index.html'), 'utf8')).toBe('broken site');
  });

  it('will not roll back a release that is not the live one', () => {
    stageArchive({ 'index.html': 'new site' });
    expect(run('activate.sh').status).toBe(0);
    expect(run('rollback.sh', 'someothersha').status).not.toBe(0);
    expect(readFileSync(live('index.html'), 'utf8')).toBe('new site');
  });
});
