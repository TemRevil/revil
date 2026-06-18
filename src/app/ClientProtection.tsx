'use client'
import { useEffect } from 'react'

/**
 * ClientProtection - DOM integrity shield
 * 
 * Monitors and neutralizes malicious style/attribute injections that could
 * alter the visual appearance of the application (e.g., via browser extensions,
 * console injection, or cross-site scripting attempts).
 * 
 * Protected vectors:
 * - Background color hijacking on body/html
 * - Transform-based rotation attacks on body/html
 * - Injected <style> tags with body-targeted malicious rules
 * - Visibility/display/pointer-events disabling on body/html
 * 
 * Exemptions:
 * - Framework styles (data-next, data-styled, data-emotion)
 * - @keyframes definitions (legitimate animations)
 * - Scripts from trusted Google/Firebase domains
 */

// Dangerous body style properties that should never be externally set
const DANGEROUS_BODY_STYLES: Record<string, string[]> = {
  'background-color': ['yellow', 'red', 'lime', '#ff0', '#f00', '#0f0'],
  'transform': ['rotate(180deg)', 'rotate(90deg)', 'scaleX(-1)', 'scaleY(-1)'],
  'visibility': ['hidden'],
  'display': ['none'],
  'pointer-events': ['none'],
};

// Patterns that indicate a style tag is targeting the body/html maliciously
// These must appear OUTSIDE of @keyframes blocks to be flagged
const MALICIOUS_BODY_PATTERNS = [
  /body\s*\{[^}]*visibility\s*:\s*hidden/i,
  /body\s*\{[^}]*display\s*:\s*none/i,
  /body\s*\{[^}]*pointer-events\s*:\s*none/i,
  /body\s*\{[^}]*cursor\s*:\s*none/i,
  /body\s*\{[^}]*filter\s*:\s*(blur|invert|grayscale)/i,
  /html\s*\{[^}]*transform\s*:\s*rotate/i,
  /html\s*\{[^}]*visibility\s*:\s*hidden/i,
  /animation\s*:\s*rot\s/i,
];

// Trusted script sources that ClientProtection should NOT block
const TRUSTED_SCRIPT_DOMAINS = [
  'apis.google.com',
  'accounts.google.com',
  'www.google.com',
  'www.gstatic.com',
  'firebaseapp.com',
  'googleapis.com',
];

function isScriptTrusted(node: Node): boolean {
  if (!(node instanceof HTMLScriptElement)) return false;
  const src = node.src || '';
  if (!src) return false; // Inline scripts with no src
  
  // Allow same-origin scripts (crucial for Next.js dynamic chunks)
  try {
    const url = new URL(src, window.location.origin);
    if (url.origin === window.location.origin) return true;
  } catch {
    if (src.startsWith('/')) return true;
  }

  return TRUSTED_SCRIPT_DOMAINS.some(domain => src.includes(domain));
}

export default function ClientProtection() {
  useEffect(() => {
    const wipeMaliciousStyles = () => {
      // Check and remove dangerous inline styles on body
      for (const [prop, dangerousValues] of Object.entries(DANGEROUS_BODY_STYLES)) {
        const currentValue = document.body.style.getPropertyValue(prop);
        if (currentValue && dangerousValues.some(v => currentValue.includes(v))) {
          document.body.style.removeProperty(prop);
        }
      }

      // Also check html element
      const html = document.documentElement;
      const htmlTransform = html.style.getPropertyValue('transform');
      if (htmlTransform && htmlTransform.includes('rotate')) {
        html.style.removeProperty('transform');
      }
      
      // Scan injected <style> tags for body-targeted malicious rules
      document.querySelectorAll('style').forEach(style => {
        // Skip framework-managed styles
        if (
          style.hasAttribute('data-next') || 
          style.hasAttribute('data-styled') || 
          style.hasAttribute('data-emotion') ||
          style.hasAttribute('data-n-href')
        ) {
          return;
        }

        const text = style.textContent || '';

        // Only flag styles that match body/html-targeted malicious patterns
        const isMalicious = MALICIOUS_BODY_PATTERNS.some(pattern => pattern.test(text));

        if (isMalicious) {
          style.remove();
          console.warn('[ClientProtection] Blocked malicious style injection:', text.substring(0, 100));
        }
      });
    };

    wipeMaliciousStyles();

    // Handle injected <style> / <script> tags. Most XSS injection lands in <head>,
    // and React-rendered styled-jsx / next/font also live there - so we observe
    // head only (not the whole document subtree), which dramatically reduces work.
    const injectObserver = new MutationObserver((mutations) => {
      let needsStyleCheck = false;

      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          const nodeName = node.nodeName?.toLowerCase();
          if (nodeName === 'style') {
            needsStyleCheck = true;
          } else if (nodeName === 'script') {
            if (!isScriptTrusted(node) && !(node as Element).hasAttribute('data-next')) {
              node.parentNode?.removeChild(node);
              console.warn('[ClientProtection] Blocked untrusted injected script tag!');
            }
          }
        }
      }

      if (needsStyleCheck) wipeMaliciousStyles();
    });

    // Head: catches injected <script>/<style> tags (the main XSS vector)
    injectObserver.observe(document.head, { childList: true, subtree: false });
    // Body root only (not subtree): catches scripts injected at the top of body
    if (document.body) {
      injectObserver.observe(document.body, { childList: true, subtree: false });
    }

    // Separate observer for inline-style attribute changes on the root elements
    // (html and body). Doesn't traverse the React tree, so it's cheap.
    const styleAttrObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          wipeMaliciousStyles();
          break;
        }
      }
    });
    styleAttrObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style'],
      subtree: false,
    });
    if (document.body) {
      styleAttrObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['style'],
        subtree: false,
      });
    }

    return () => {
      injectObserver.disconnect();
      styleAttrObserver.disconnect();
    };
  }, []);

  return null;
}
