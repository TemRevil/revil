import firebaseIcon from '../assets/svgs/firebase.svg';

export const isVideoFile = (url: string) => {
    return url.split('?')[0].toLowerCase().match(/\.(mp4|webm|ogg|mov)$/) || url.includes('/videos/');
};

export const getStackIcon = (name: string) => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('firebase')) return firebaseIcon;
    return null;
};

export const getTechColor = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('react')) return '#61dafb';
    if (lower.includes('html')) return '#e34f26';
    if (lower.includes('css')) return '#1572b6';
    if (lower.includes('js') || lower.includes('javascript')) return '#f7df1e';
    if (lower.includes('node')) return '#339933';
    if (lower.includes('firebase')) return '#ffca28';
    if (lower.includes('typescript') || lower.includes('ts')) return '#3178c6';
    if (lower.includes('tailwind')) return '#06b6d4';
    return '#60a5fa';
};
