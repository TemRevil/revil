/**
 * The dashboard's easing curves as cubic-beziers for `motion`. They are the Penner
 * curves the dashboard used to name through anime.js ('easeOutQuint' and so on), so the
 * move to motion keeps every animation's pace and feel.
 */
type Bezier = [number, number, number, number];

export const EASE = {
    inQuad: [0.11, 0, 0.5, 0] as Bezier,
    outQuad: [0.5, 1, 0.89, 1] as Bezier,
    inOutQuad: [0.45, 0, 0.55, 1] as Bezier,
    inOutCubic: [0.65, 0, 0.35, 1] as Bezier,
    outQuart: [0.25, 1, 0.5, 1] as Bezier,
    outQuint: [0.22, 1, 0.36, 1] as Bezier,
    outExpo: [0.16, 1, 0.3, 1] as Bezier,
    inOutSine: [0.37, 0, 0.63, 1] as Bezier,
};
