import { describe, expect, it } from 'vitest';
import { inlineJson } from './inline-json.mjs';

describe('inlineJson', () => {
  it('cannot close the script tag it is baked into', () => {
    const out = inlineJson({ bio: 'Hi</script><script>alert(1)</script>' });
    expect(out).not.toContain('<');
    expect(out).toContain('\\u003c/script>');
  });

  it('escapes the line and paragraph separators', () => {
    const out = inlineJson({ text: 'a\u2028b\u2029c' });
    expect(out).not.toMatch(/[\u2028\u2029]/);
    expect(out).toContain('\\u2028');
    expect(out).toContain('\\u2029');
  });

  it('parses back to exactly the same data', () => {
    const data = { a: '<b>x</b> & \u2028 \u2029', list: [1, null, true, { k: '</script>' }] };
    expect(JSON.parse(inlineJson(data))).toEqual(data);
  });
});
