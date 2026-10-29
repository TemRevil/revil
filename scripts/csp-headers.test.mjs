import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildHtaccess, inlineScriptHashes, withScripts } from './csp-headers.mjs';

const sha = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;
const POLICY = "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.google.com; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'";
const TEMPLATE = `RewriteEngine On\n<IfModule mod_headers.c>\n  # CSP:BEGIN\n  Header always set Content-Security-Policy "${POLICY}"\n  # CSP:END\n  Header always set X-Frame-Options "DENY"\n</IfModule>\n`;

let dirs = [];
afterEach(() => { dirs.forEach((d) => rmSync(d, { recursive: true, force: true })); dirs = []; });
function dist(files) {
    const root = mkdtempSync(join(tmpdir(), 'csp-'));
    dirs.push(root);
    for (const [path, html] of Object.entries(files)) {
        const full = join(root, path);
        mkdirSync(join(full, '..'), { recursive: true });
        writeFileSync(full, html);
    }
    return root;
}

describe('inlineScriptHashes', () => {
    it('hashes only inline scripts a browser runs', () => {
        const html = [
            '<script>self.__next_f.push([1,"a"])</script>',
            '<script src="/_next/x.js"></script>',
            '<script type="application/json" id="public-data">{"a":1}</script>',
            '<script type="application/ld+json">{}</script>',
            '<script id="theme-init">(function(){})()</script>',
        ].join('');
        expect(inlineScriptHashes(html).sort()).toEqual([sha('self.__next_f.push([1,"a"])'), sha('(function(){})()')].sort());
    });
});

describe('withScripts', () => {
    it("swaps 'unsafe-inline' in script-src only, keeping the hosts", () => {
        const out = withScripts(POLICY, ["'sha256-AAA'"]);
        expect(out).toContain("script-src 'self' 'sha256-AAA' https://www.google.com");
        expect(out).toContain("style-src 'self' 'unsafe-inline'");
        expect(out).not.toMatch(/script-src[^;]*unsafe-inline/);
    });
});

describe('buildHtaccess', () => {
    it("gives each page its own hashes, and nothing else any inline script", () => {
        const root = dist({
            'index.html': '<script>one()</script>',
            'projects/glass.html': '<script>two()</script>',
            'projects/book.html': '<script>three()</script>',
            'book.html': '<script>four()</script>',
        });
        const out = buildHtaccess(root, TEMPLATE);
        const policyFor = (name) => out.match(new RegExp(`<FilesMatch "\\^${name.replace('.', '\\\\.')}\\$">\\s*Header always set Content-Security-Policy "([^"]*)"`))?.[1];
        expect(policyFor('index.html')).toContain(sha('one()'));
        expect(policyFor('index.html')).not.toContain(sha('two()'));
        expect(policyFor('glass.html')).toContain(sha('two()'));
        // Same file name in two folders: one policy allowing both pages' scripts.
        expect(policyFor('book.html')).toContain(sha('three()'));
        expect(policyFor('book.html')).toContain(sha('four()'));
        expect(out).not.toMatch(/script-src[^;"]*unsafe-inline/);
        // Everything outside the CSP block is left as it was.
        expect(out.startsWith('RewriteEngine On\n')).toBe(true);
        expect(out).toContain('Header always set X-Frame-Options "DENY"');
    });

    it('refuses a template without the CSP block', () => {
        const root = dist({ 'index.html': '<p>hi</p>' });
        expect(() => buildHtaccess(root, 'RewriteEngine On\n')).toThrow(/CSP:BEGIN/);
    });

    it('fills in the real deploy template', () => {
        const root = dist({ 'index.html': '<script>one()</script>' });
        const template = readFileSync(new URL('../deploy/hostinger/.htaccess', import.meta.url), 'utf8');
        const out = buildHtaccess(root, template);
        expect(out).toContain(sha('one()'));
        expect(out).toContain("frame-ancestors 'none'");
        expect(out).not.toMatch(/script-src[^;"]*unsafe-inline/);
    });
});
