#!/usr/bin/env node
/**
 * Writes the deployed .htaccess: deploy/hostinger/.htaccess with its Content Security
 * Policy made exact for every page of the static export.
 *
 * The policy itself lives in the template, between `# CSP:BEGIN` and `# CSP:END`, as one
 * `Header always set Content-Security-Policy "..."` line whose script-src carries
 * 'unsafe-inline' (so the template still works, as before, if this step is skipped).
 * Next.js inlines a few scripts into every page (the RSC payload pushes and the
 * beforeInteractive scripts), so this step hashes the inline scripts of each built
 * page and swaps 'unsafe-inline' for exactly those hashes, one <FilesMatch> per page.
 * Every other response gets the policy with no inline script allowed at all.
 *
 * Run it on the final HTML (after every postbuild step that edits pages):
 *   node scripts/csp-headers.mjs <distDir> <template .htaccess> <out .htaccess>
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BEGIN = '# CSP:BEGIN';
const END = '# CSP:END';
const HEADER_RE = /^(\s*)Header always set Content-Security-Policy "([^"]*)"\s*$/m;
const EXECUTABLE = new Set(['', 'text/javascript', 'application/javascript', 'module']);

/** The sha256 sources of the inline scripts a browser would run in this page. */
export function inlineScriptHashes(html) {
    const hashes = new Set();
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
        const attrs = m[1];
        if (/\ssrc\s*=/i.test(attrs)) continue;
        const type = (attrs.match(/\stype\s*=\s*["']?([^"'\s>]+)/i)?.[1] || '').toLowerCase();
        if (!EXECUTABLE.has(type)) continue;
        hashes.add(`'sha256-${createHash('sha256').update(m[2], 'utf8').digest('base64')}'`);
    }
    return [...hashes];
}

/** The template policy with 'unsafe-inline' in script-src replaced by these sources. */
export function withScripts(policy, sources) {
    let found = false;
    const out = policy.split(';').map((part) => {
        const words = part.trim().split(/\s+/).filter(Boolean);
        if (words[0] !== 'script-src') return part.trim();
        found = true;
        const kept = words.slice(1).filter((w) => w !== "'unsafe-inline'");
        return ['script-src', ...kept.slice(0, 1), ...sources, ...kept.slice(1)].join(' ');
    }).filter(Boolean).join('; ');
    if (!found) throw new Error('csp-headers: the template policy has no script-src');
    return out;
}

function htmlFiles(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) out.push(...htmlFiles(path));
        else if (name.endsWith('.html')) out.push(path);
    }
    return out;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The deployed .htaccess text for this build. */
export function buildHtaccess(distDir, template) {
    const start = template.indexOf(BEGIN), stop = template.indexOf(END);
    if (start < 0 || stop < start) throw new Error(`csp-headers: no "${BEGIN}" ... "${END}" block in the template`);
    const block = template.slice(start, stop);
    const header = block.match(HEADER_RE);
    if (!header) throw new Error('csp-headers: no Content-Security-Policy header line in the CSP block');
    const [, indent, policy] = header;

    // FilesMatch sees only the file name, so pages sharing one (book.html and a
    // project called "book") share one policy holding both pages' hashes.
    const byName = new Map();
    for (const file of htmlFiles(distDir)) {
        const name = basename(file);
        const set = byName.get(name) || new Set();
        for (const h of inlineScriptHashes(readFileSync(file, 'utf8'))) set.add(h);
        byName.set(name, set);
    }
    if (!byName.size) throw new Error(`csp-headers: no .html files under ${distDir}`);

    const lines = [`${indent}Header always set Content-Security-Policy "${withScripts(policy, [])}"`];
    for (const [name, set] of [...byName].sort(([a], [b]) => a.localeCompare(b))) {
        lines.push(`${indent}<FilesMatch "^${escapeRe(name)}$">`);
        lines.push(`${indent}  Header always set Content-Security-Policy "${withScripts(policy, [...set].sort())}"`);
        lines.push(`${indent}</FilesMatch>`);
    }
    const filled = block.replace(HEADER_RE, () => lines.join('\n'));
    return template.slice(0, start) + filled + template.slice(stop);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [dist, templatePath, outPath] = process.argv.slice(2);
    if (!dist || !templatePath || !outPath) {
        console.error('usage: node scripts/csp-headers.mjs <distDir> <template .htaccess> <out .htaccess>');
        process.exit(1);
    }
    writeFileSync(outPath, buildHtaccess(resolve(dist), readFileSync(templatePath, 'utf8')));
    console.log(`csp-headers: wrote ${outPath}`);
}
