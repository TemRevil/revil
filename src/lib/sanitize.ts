/**
 * SVG Sanitization Utility
 * 
 * Strips dangerous attributes and elements from SVG strings
 * before they are injected via dangerouslySetInnerHTML.
 * This prevents XSS attacks via malicious SVG content stored in Firestore.
 */

// Allowlist of safe SVG elements
const SAFE_ELEMENTS = new Set([
    'svg', 'path', 'circle', 'ellipse', 'line', 'polygon', 'polyline',
    'rect', 'g', 'defs', 'clippath', 'mask', 'use', 'symbol',
    'lineargradient', 'radialgradient', 'stop', 'text', 'tspan',
    'title', 'desc', 'filter', 'fegaussianblur', 'feoffset',
    'feblend', 'fecolormatrix', 'fecomposite', 'feflood',
    'femerge', 'femergenode', 'femorphology', 'feturbulence',
    'fedisplacementmap', 'feimage'
]);

// Dangerous attributes that can execute JavaScript
const DANGEROUS_ATTRS = /^(on\w+|xlink:href|href|formaction|action|data)$/i;

// Dangerous URL protocols
const DANGEROUS_PROTOCOLS = /^\s*(javascript|data|vbscript)\s*:/i;

/**
 * Sanitizes an SVG string by removing dangerous elements and attributes.
 * 
 * @param svgString - Raw SVG string from Firestore
 * @returns Sanitized SVG string safe for dangerouslySetInnerHTML
 */
export function sanitizeSvg(svgString: string): string {
    if (!svgString || typeof svgString !== 'string') return '';

    // Quick reject: if it contains obvious script injection
    if (/<script/i.test(svgString) || /javascript:/i.test(svgString)) {
        console.warn('[Sanitize] Blocked SVG with script content');
        return '';
    }

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgString, 'image/svg+xml');

        // Check for parse errors
        const parseError = doc.querySelector('parsererror');
        if (parseError) {
            console.warn('[Sanitize] SVG parse error, returning empty');
            return '';
        }

        // Recursively sanitize all elements
        sanitizeNode(doc.documentElement);

        return new XMLSerializer().serializeToString(doc.documentElement);
    } catch {
        console.warn('[Sanitize] Failed to sanitize SVG, returning empty');
        return '';
    }
}

function sanitizeNode(node: Element): void {
    // Remove disallowed elements
    const children = Array.from(node.children);
    for (const child of children) {
        const tagName = child.tagName.toLowerCase();

        if (!SAFE_ELEMENTS.has(tagName)) {
            child.remove();
            continue;
        }

        // Remove dangerous attributes
        const attrs = Array.from(child.attributes);
        for (const attr of attrs) {
            const name = attr.name.toLowerCase();

            // Remove event handlers and dangerous attributes
            if (DANGEROUS_ATTRS.test(name)) {
                child.removeAttribute(attr.name);
                continue;
            }

            // Check for dangerous URL protocols in href-like attributes
            if ((name === 'xlink:href' || name === 'href') && DANGEROUS_PROTOCOLS.test(attr.value)) {
                child.removeAttribute(attr.name);
                continue;
            }

            // Remove style attributes that contain url() or expression()
            if (name === 'style' && (/url\s*\(/i.test(attr.value) || /expression\s*\(/i.test(attr.value))) {
                child.removeAttribute(attr.name);
            }
        }

        // Recurse into children
        sanitizeNode(child);
    }
}
