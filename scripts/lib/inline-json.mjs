/**
 * JSON for an inline <script type="application/json"> tag, safe whatever the data holds.
 *
 * `<` is written as its JSON escape (a backslash and u003c), so no text in the data can
 * write `</script>` and close the tag; a JS literal needs the backslash escaped to output it.
 * U+2028 and U+2029 are escaped too: JSON allows them raw,
 * but older JavaScript parsers treat them as line breaks. JSON.parse reads all three back
 * as the original characters.
 */
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);
const ESCAPED = { '<': '\\u003c', [LINE_SEPARATOR]: '\\u2028', [PARAGRAPH_SEPARATOR]: '\\u2029' };
const UNSAFE = new RegExp(`[<${LINE_SEPARATOR}${PARAGRAPH_SEPARATOR}]`, 'g');

export function inlineJson(data) {
  return JSON.stringify(data).replace(UNSAFE, (c) => ESCAPED[c]);
}
