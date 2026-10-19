/**
 * What kind of screen the site is on, decided here and nowhere else.
 *
 * - Phone: a phone-sized screen. On a phone the page runs "lite": the effects that cost a
 *   phone the most step down (no live blur behind glass, a calmer brush entrance, no
 *   hidden pre-drawing, videos still until tapped). Lite is fixed when the page loads, by
 *   LITE_SCRIPT in <head>, so the CSS can drop effects before the first paint and nothing
 *   switches look halfway through a visit.
 * - Touch: phones and every touch screen, tablets included. They get the one-page scroll
 *   layout. any-pointer, not pointer: an iPad with a trackpad attached still has a touch
 *   screen.
 *
 * Components follow a query with hooks/useMediaQuery.ts.
 */
export const PHONE_QUERY = '(max-width: 767px)';
export const TOUCH_QUERY = '(max-width: 767px), (any-pointer: coarse)';

/** Marks <html data-lite> on a phone, before anything paints. Inlined in the layout's <head>. */
export const LITE_SCRIPT = `(function(){try{if(matchMedia('${PHONE_QUERY}').matches)document.documentElement.setAttribute('data-lite','')}catch(e){}})();`;

/** True when this page load runs lite (see above). */
export const isLite = () => typeof document !== 'undefined' && document.documentElement.hasAttribute('data-lite');

