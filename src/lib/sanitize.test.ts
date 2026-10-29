// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { sanitizeSvg } from './sanitize';

vi.spyOn(console, 'warn').mockImplementation(() => { });

/** Parses the sanitizer's output the way the page will use it: as HTML inside a div. */
const render = (svg: string) => {
    const host = document.createElement('div');
    host.innerHTML = sanitizeSvg(svg);
    return host;
};

describe('sanitizeSvg', () => {
    it('keeps a plain icon drawable', () => {
        const out = render('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="url(#g)"/><defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></defs></svg>');
        const svg = out.querySelector('svg');
        expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
        expect(out.querySelector('path')?.getAttribute('fill')).toBe('url(#g)');
        expect(out.querySelector('stop')).not.toBeNull();
    });

    it('rejects a root that is not an SVG <svg> element', () => {
        expect(sanitizeSvg('<style xmlns="http://www.w3.org/2000/svg">body{display:none}</style>')).toBe('');
        expect(sanitizeSvg('<svg xmlns="http://www.w3.org/1999/xhtml"><p>hi</p></svg>')).toBe('');
        expect(sanitizeSvg('<svg><path d="M0 0"/></svg>')).toBe('');
        expect(sanitizeSvg('<div xmlns="http://www.w3.org/1999/xhtml">x</div>')).toBe('');
    });

    it('drops comments, processing instructions and CDATA markup', () => {
        const comment = render('<svg xmlns="http://www.w3.org/2000/svg"><!--><img src=x onerror=alert(1)>--><path d="M0 0"/></svg>');
        expect(comment.querySelector('img')).toBeNull();
        expect(comment.innerHTML).not.toContain('<!--');
        const pi = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><?foo <img src=x onerror=alert(1)>?><path d="M0 0"/></svg>');
        expect(pi).not.toContain('<?foo');
        const cdata = render('<svg xmlns="http://www.w3.org/2000/svg"><text><![CDATA[</text><img src=x onerror=alert(1)>]]></text></svg>');
        expect(cdata.querySelector('img')).toBeNull();
        expect(cdata.querySelector('text')?.textContent).toContain('<img');
    });

    it('drops elements from other namespaces and outside the allowlist', () => {
        const out = render('<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml"><h:style>body{display:none}</h:style><style>body{display:none}</style><foreignObject><div/></foreignObject><a href="https://x.test"><path d="M0 0"/></a><use href="#p"/><feImage href="https://x.test/i.png"/><symbol id="s"/><circle r="2"/></svg>');
        expect(out.querySelector('style')).toBeNull();
        expect(out.querySelector('foreignObject')).toBeNull();
        expect(out.querySelector('a')).toBeNull();
        expect(out.querySelector('use')).toBeNull();
        expect(out.querySelector('feImage')).toBeNull();
        expect(out.querySelector('symbol')).toBeNull();
        expect(out.querySelector('circle')).not.toBeNull();
    });

    it('strips handlers, links and outside url() references, on the root too', () => {
        const out = render('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" onload="alert(1)" style="background:url(https://x.test/a.png)"><path d="M0 0" onclick="alert(1)" xlink:href="#a" fill="url(https://x.test/b.svg#c)" stroke="url(#ok)"/></svg>');
        const svg = out.querySelector('svg')!;
        expect(svg.hasAttribute('onload')).toBe(false);
        expect(svg.hasAttribute('style')).toBe(false);
        const path = out.querySelector('path')!;
        expect(path.hasAttribute('onclick')).toBe(false);
        expect(path.hasAttribute('xlink:href')).toBe(false);
        expect(path.hasAttribute('fill')).toBe(false);
        expect(path.getAttribute('stroke')).toBe('url(#ok)');
    });

    it('rejects script and unparseable input', () => {
        expect(sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')).toBe('');
        expect(sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><path></svg>')).toBe('');
        expect(sanitizeSvg('')).toBe('');
    });

    it('returns the same result for the same input without parsing again', () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';
        const first = sanitizeSvg(svg);
        const parse = vi.spyOn(DOMParser.prototype, 'parseFromString');
        expect(sanitizeSvg(svg)).toBe(first);
        expect(parse).not.toHaveBeenCalled();
        parse.mockRestore();
    });
});
