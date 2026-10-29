/**
 * Brand icons for social and code-host links. Lucide 1.0 dropped its brand icons, so
 * these keep the drawings lucide-react 0.555 shipped, built with lucide's own factory:
 * they take the same props (size, strokeWidth, className) and look like every other icon.
 */
import { createLucideIcon } from 'lucide-react';

export const Facebook = createLucideIcon('facebook', [
    ['path', { d: 'M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z', key: 'facebook-1' }],
]);

export const Github = createLucideIcon('github', [
    ['path', { d: 'M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4', key: 'github-1' }],
    ['path', { d: 'M9 18c-4.51 2-5-2-7-2', key: 'github-2' }],
]);

export const Instagram = createLucideIcon('instagram', [
    ['rect', { width: '20', height: '20', x: '2', y: '2', rx: '5', ry: '5', key: 'instagram-1' }],
    ['path', { d: 'M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z', key: 'instagram-2' }],
    ['line', { x1: '17.5', x2: '17.51', y1: '6.5', y2: '6.5', key: 'instagram-3' }],
]);

export const Linkedin = createLucideIcon('linkedin', [
    ['path', { d: 'M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z', key: 'linkedin-1' }],
    ['rect', { width: '4', height: '12', x: '2', y: '9', key: 'linkedin-2' }],
    ['circle', { cx: '4', cy: '4', r: '2', key: 'linkedin-3' }],
]);

export const Twitch = createLucideIcon('twitch', [
    ['path', { d: 'M21 2H3v16h5v4l4-4h5l4-4V2zm-10 9V7m5 4V7', key: 'twitch-1' }],
]);

export const Twitter = createLucideIcon('twitter', [
    ['path', { d: 'M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z', key: 'twitter-1' }],
]);

export const Youtube = createLucideIcon('youtube', [
    ['path', { d: 'M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17', key: 'youtube-1' }],
    ['path', { d: 'm10 15 5-3-5-3z', key: 'youtube-2' }],
]);
