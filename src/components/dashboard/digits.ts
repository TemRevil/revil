/**
 * Amount fields are plain text inputs (inputMode="decimal"), not type="number": a number
 * input on an Arabic keyboard rejects or silently drops the digits it types. Whatever is
 * typed is kept as Western digits, so nothing stored ever holds ٠-٩ or ۰-۹.
 */
const ARABIC_INDIC = /[٠-٩]/g;   // ٠-٩
const EXTENDED_INDIC = /[۰-۹]/g; // ۰-۹ (Persian / Urdu)

/** Arabic-Indic and extended digits become 0-9. */
export function toWesternDigits(s: string): string {
    return s
        .replace(ARABIC_INDIC, d => String(d.charCodeAt(0) - 0x0660))
        .replace(EXTENDED_INDIC, d => String(d.charCodeAt(0) - 0x06F0));
}

/**
 * A decimal amount as typed, cleaned: Western digits, one "." (the Arabic decimal
 * separator ٫ counts as one), an optional leading "-", and nothing else.
 */
export function decimalInput(raw: string): string {
    const s = toWesternDigits(raw).replace(/٫/g, '.');
    const negative = s.trimStart().startsWith('-');
    let out = '';
    let dot = false;
    for (const ch of s) {
        if (ch >= '0' && ch <= '9') out += ch;
        else if (ch === '.' && !dot) { out += ch; dot = true; }
    }
    return (negative ? '-' : '') + out;
}
