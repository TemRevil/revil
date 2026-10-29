/**
 * SVG Sanitization Utility
 *
 * Cleans SVG strings (tag icons stored in Firestore) before they are injected via
 * dangerouslySetInnerHTML. An allowlist, not a blocklist: what survives is an
 * SVG-namespace <svg> root holding only allowlisted SVG elements, text, and
 * attributes that can neither run script nor load anything from outside.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

// Allowlist of safe SVG elements (lower-cased local names). Nothing that takes an
// href: `use`, `feImage`, `a` and `image` lose theirs below, so they could only ever
// draw nothing, and `symbol` only draws through `use`.
const SAFE_ELEMENTS = new Set([
    'svg', 'path', 'circle', 'ellipse', 'line', 'polygon', 'polyline',
    'rect', 'g', 'defs', 'clippath', 'mask',
    'lineargradient', 'radialgradient', 'stop', 'text', 'tspan',
    'title', 'desc', 'filter', 'fegaussianblur', 'feoffset',
    'feblend', 'fecolormatrix', 'fecomposite', 'feflood',
    'femerge', 'femergenode', 'femorphology', 'feturbulence',
    'fedisplacementmap',
]);

// Attributes that run script, point somewhere, or submit.
const DANGEROUS_ATTRS = /^(on\w+|xlink:href|href|src|formaction|action|data)$/i;

// A url() reference anywhere but inside this same SVG (`url(#id)`) loads from outside.
const OUTSIDE_URL = /url\s*\(\s*(?!['"]?#)/i;

/** Sanitized results, by input: the same icons render on every grid re-render. */
const cache = new Map<string, string>();
const CACHE_MAX = 500;

/**
 * Sanitizes an SVG string by removing dangerous elements and attributes.
 *
 * @param svgString - Raw SVG string from Firestore
 * @returns Sanitized SVG string safe for dangerouslySetInnerHTML, or '' when the input
 *          is not an SVG document
 */
export function sanitizeSvg(svgString: string): string {
    if (!svgString || typeof svgString !== 'string') return '';
    const hit = cache.get(svgString);
    if (hit !== undefined) return hit;
    const clean = sanitize(svgString);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(svgString, clean);
    return clean;
}

function sanitize(svgString: string): string {
    // Quick reject: if it contains obvious script injection
    if (/<script/i.test(svgString) || /javascript:/i.test(svgString)) {
        console.warn('[Sanitize] Blocked SVG with script content');
        return '';
    }

    try {
        const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');

        if (doc.getElementsByTagName('parsererror').length) {
            console.warn('[Sanitize] SVG parse error, returning empty');
            return '';
        }

        // The root itself must be an SVG <svg>: anything else (a <style>, an XHTML
        // element, an <svg> in another namespace) would land in the page as itself.
        const root = doc.documentElement;
        if (!root || root.namespaceURI !== SVG_NS || root.localName.toLowerCase() !== 'svg') {
            console.warn('[Sanitize] Root is not an SVG element, returning empty');
            return '';
        }

        sanitizeElementAttributes(root);
        sanitizeChildren(root);

        return new XMLSerializer().serializeToString(root);
    } catch {
        console.warn('[Sanitize] Failed to sanitize SVG, returning empty');
        return '';
    }
}

// Strip dangerous attributes (event handlers, links, outside url() references) from a
// single element. Used for both the root <svg> and every descendant.
function sanitizeElementAttributes(el: Element): void {
    for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        // Namespace declarations are re-emitted by the serializer as it needs them.
        if (name === 'xmlns' || name.startsWith('xmlns:')) continue;
        // Attributes in any other namespace (xlink:, xml:base, a made-up prefix).
        if (attr.namespaceURI) { el.removeAttributeNode(attr); continue; }
        if (DANGEROUS_ATTRS.test(name) || OUTSIDE_URL.test(attr.value) || /expression\s*\(/i.test(attr.value)) {
            el.removeAttributeNode(attr);
        }
    }
}

// Keep only allowlisted SVG elements and plain text. Comments, processing instructions,
// CDATA sections and elements from any other namespace are dropped: each of them can
// carry markup that the HTML parser reads differently once the result is inserted.
function sanitizeChildren(node: Element): void {
    for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 3 /* TEXT_NODE */) continue;
        if (child.nodeType === 4 /* CDATA_SECTION_NODE */) {
            node.replaceChild(node.ownerDocument.createTextNode(child.nodeValue || ''), child);
            continue;
        }
        if (child.nodeType !== 1 /* ELEMENT_NODE */) {
            node.removeChild(child);
            continue;
        }
        const el = child as Element;
        if (el.namespaceURI !== SVG_NS || !SAFE_ELEMENTS.has(el.localName.toLowerCase())) {
            node.removeChild(el);
            continue;
        }
        sanitizeElementAttributes(el);
        sanitizeChildren(el);
    }
}
