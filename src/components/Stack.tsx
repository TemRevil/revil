import { createElement, useEffect, useRef, useState, useMemo } from 'react';
import anime from 'animejs';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { Github, Instagram, Linkedin, Twitter, Facebook, Mail, Link as LinkIcon, Twitch, Youtube, Code } from 'lucide-react';
import { useSocialTracker } from '../hooks/useSocialTracker';

interface StackItemProps {
    icon: string;
    name: string;
    delay: number;
    iconSize: number;
}

const StackItem = ({ icon, name, iconSize, delay }: StackItemProps) => {
    const itemRef = useRef<HTMLDivElement>(null);
    const [isHovered, setIsHovered] = useState(false);
    const [imgError, setImgError] = useState(false);

    useEffect(() => {
        anime({
            targets: itemRef.current,
            opacity: [0, 1],
            filter: ['blur(20px)', 'blur(0px)'],
            duration: 1200,
            delay: delay,
            easing: 'easeOutExpo'
        });
    }, [delay]);

    const showFallback = !icon || imgError;

    // Calculate min-height based on icon size
    const minHeight = Math.max(iconSize + 20, 60);
    const fallbackSize = Math.max(iconSize * 0.8, 40);

    return (
        <div
            ref={itemRef}
            className="w-full h-full flex items-center justify-center p-3 opacity-0"
            style={{ minHeight: `${minHeight}px` }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className={`flex items-center justify-center transition-all duration-300 ${isHovered ? 'scale-110' : ''}`}>
                {showFallback ? (
                    <Code size={fallbackSize} className="text-zinc-400" />
                ) : (
                    <div
                        style={{
                            width: `${iconSize}px`,
                            height: `${iconSize}px`,
                            backgroundImage: `url(${icon})`,
                            backgroundSize: 'contain',
                            backgroundPosition: 'center',
                            backgroundRepeat: 'no-repeat',
                            opacity: isHovered ? 1 : 0.6,
                            filter: isHovered ? 'grayscale(0%)' : 'grayscale(100%)',
                            transition: 'all 0.3s ease'
                        }}
                        title={name}
                        onError={() => setImgError(true)}
                    />
                )}
            </div>
        </div>
    );
};

// Icon mapping helper kept at module scope to avoid creating components during render
const getIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('github')) return Github;
    if (lower.includes('linkedin')) return Linkedin;
    if (lower.includes('instagram')) return Instagram;
    if (lower.includes('twitter') || lower.includes('x.com')) return Twitter;
    if (lower.includes('facebook')) return Facebook;
    if (lower.includes('youtube')) return Youtube;
    if (lower.includes('twitch')) return Twitch;
    if (lower.includes('mail') || lower.includes('@')) return Mail;
    return LinkIcon;
};

const SocialIcon = ({ name, url, delay }: { name: string; url: string; delay: number }) => {
    const iconRef = useRef<HTMLAnchorElement>(null);
    const { trackClick } = useSocialTracker();

    useEffect(() => {
        anime({
            targets: iconRef.current,
            opacity: [0, 1],
            translateY: [20, 0],
            duration: 800,
            delay: delay,
            easing: 'easeOutQuad'
        });
    }, [delay]);

    const iconElement = createElement(getIcon(name), {
        size: 32,
        className: "text-gray-500 group-hover:text-black transition-colors duration-300",
        strokeWidth: 1.5
    });

    return (
        <a
            ref={iconRef}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackClick(name)}
            className="group relative flex items-center justify-center p-3 rounded-xl transition-all duration-300 hover:bg-zinc-100 hover:scale-110"
        >
            {iconElement}

            {/* Tooltip */}
            <span className="absolute lg:right-full lg:mr-3 lg:top-1/2 lg:-translate-y-1/2 lg:bottom-auto lg:left-auto lg:translate-x-0 bottom-full mb-3 lg:mb-0 left-1/2 -translate-x-1/2 lg:left-auto px-3 py-1.5 bg-black text-white rounded-lg text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 shadow-xl">
                {name}
            </span>
        </a>
    );

};

const Stack = () => {
    const titleRef = useRef<HTMLHeadingElement>(null);
    const handwritingRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    type StackData = { icon?: string; name?: string };
    const [stackItems, setStackItems] = useState<StackData[]>([]);
    const [socialLinks, setSocialLinks] = useState<{ name: string, url: string }[]>([]);
    const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);

    // Track window width for responsive behavior
    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Calculate dynamic grid properties based on screen width
    // Grid rules: ALWAYS 5 columns on desktop, 3 on tablet, 2 on mobile
    const gridConfig = useMemo(() => {
        const isMobile = windowWidth < 640;
        const isTablet = windowWidth >= 640 && windowWidth < 1024;

        let columns: number;
        let iconSize: number;
        let paddingTotal: number; // Total horizontal padding per cell (left + right)

        if (isMobile) {
            columns = windowWidth < 360 ? 3 : 3;
            if (windowWidth < 400) {
                iconSize = 45;
                paddingTotal = 12;
            } else {
                iconSize = 65;
                paddingTotal = 16;
            }
        } else if (isTablet) {
            columns = 4;
            iconSize = windowWidth < 800 ? 80 : 100;
            paddingTotal = 20;
        } else {
            // Desktop: ALWAYS 5 columns
            columns = 5;

            if (windowWidth < 1100) iconSize = 90;
            else if (windowWidth < 1280) iconSize = 100;
            else if (windowWidth < 1440) iconSize = 110;
            else iconSize = 120;

            paddingTotal = iconSize > 120 ? 40 : 24;
        }

        // Exact width of one cell in pixels (used for desktop sizing)
        const cellWidth = iconSize + paddingTotal;

        // Generate marker positions for columns (excluding edges)
        const markerPositions: number[] = [];
        for (let i = 1; i < columns; i++) {
            markerPositions.push((i / columns) * 100);
        }

        return { columns, iconSize, markerPositions, cellWidth, isMobile, isTablet };
    }, [windowWidth]);

    // Fetch Stack Items
    useEffect(() => {
        const unsubStack = onSnapshot(doc(db, 'Settings', 'Tech Stack'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();

                const items = Object.entries(data)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([, item]: [string, unknown]) => {
                        const it = item as Record<string, unknown>;
                        return {
                            icon: (it.Icon ?? it.icon) as string | undefined,
                            name: (it.Name ?? it.name) as string | undefined
                        };
                    });
                setStackItems(items);
            }
        }, (error) => {
            console.error('[Stack] Firestore error:', error);
        });

        // Fetch Social Links
        const unsubAccount = onSnapshot(doc(db, 'Settings', 'Account'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data && data['Social Links']) {
                    const links = Object.entries(data['Social Links']).map(([name, url]) => ({
                        name,
                        url: url as string
                    }));
                    setSocialLinks(links);
                }
            }
        });

        return () => {
            unsubStack();
            unsubAccount();
        };
    }, []);

    useEffect(() => {
        anime({
            targets: handwritingRef.current,
            opacity: [0, 1],
            translateY: [20, 0],
            duration: 600,
            easing: 'easeOutExpo'
        });

        anime({
            targets: titleRef.current,
            opacity: [0, 1],
            translateY: [30, 0],
            duration: 800,
            delay: 100,
            easing: 'easeOutExpo'
        });


    }, []);

    // Calculate which items are in the last row for border styling
    const getItemClasses = (index: number) => {
        const { columns } = gridConfig;
        const totalItems = stackItems.length;
        const totalRows = Math.ceil(totalItems / columns);
        const currentRow = Math.floor(index / columns);

        const isLastRow = currentRow === totalRows - 1;
        const isLastCol = (index + 1) % columns === 0;

        return { isLastRow, isLastCol };
    };

    return (
        <div className="min-h-screen w-full overflow-x-hidden flex flex-col items-center justify-center bg-primary transition-slow pt-20 pb-40 page-padding">
            <div className="max-w-7xl w-full mx-auto relative z-10">
                {/* Header Section */}
                <div className="mb-14">
                    <div
                        ref={handwritingRef}
                        className="text-3xl md:text-4xl opacity-0 mb-[-10px] ml-2"
                        style={{
                            fontFamily: "'Rock Salt', cursive",
                            color: 'var(--accent)'
                        }}
                    >
                        My Tech
                    </div>
                    <h1
                        ref={titleRef}
                        className="text-6xl md:text-8xl lg:text-9xl font-black transition-slow opacity-0 m-0 leading-none"
                        style={{ color: 'var(--text-primary)' }}
                    >
                        Stack
                    </h1>
                </div>

                <div
                    ref={containerRef}
                    className="flex flex-col md:flex-row items-center md:items-start justify-between w-full bg-transparent px-6 sm:px-12 lg:px-20 py-4"
                >

                    {/* Tech Stack Grid Wrapper */}
                    {/* 
                        FIX: We explicitly set the width of this container on desktop.
                        This ensures the 'relative' container matches the grid size exactly,
                        so the corner and edge markers (absolute positioned) align perfectly with the grid lines.
                    */}
                    <div
                        className="relative shrink-0"
                        style={{
                            width: (gridConfig.isMobile || gridConfig.isTablet)
                                ? 'fit-content'
                                : `${gridConfig.columns * gridConfig.cellWidth}px`
                        }}
                    >

                        {/* Corner Markers */}
                        <div className="marker marker-corner-tl"></div>
                        <div className="marker marker-corner-tr"></div>
                        <div className="marker marker-corner-bl"></div>
                        <div className="marker marker-corner-br"></div>

                        {/* Dynamic Edge Markers - Top */}
                        {gridConfig.markerPositions.map((pos, idx) => (
                            <div
                                key={`top-${idx}`}
                                className="marker marker-edge-top"
                                style={{
                                    left: `${pos}%`,
                                    transform: 'translateX(-50%)',
                                    top: '-6px',
                                    display: 'block'
                                }}
                            />
                        ))}

                        {/* Dynamic Edge Markers - Bottom */}
                        {gridConfig.markerPositions.map((pos, idx) => (
                            <div
                                key={`bottom-${idx}`}
                                className="marker marker-edge-bottom"
                                style={{
                                    left: `${pos}%`,
                                    transform: 'translateX(-50%)',
                                    bottom: '-6px',
                                    display: 'block'
                                }}
                            />
                        ))}

                        {/* Dynamic Grid */}
                        <div
                            className="dynamic-stack-grid"
                            style={{
                                display: 'grid',
                                gridTemplateColumns: (gridConfig.isMobile || gridConfig.isTablet)
                                    ? `repeat(${gridConfig.columns}, 1fr)`
                                    : `repeat(${gridConfig.columns}, ${gridConfig.cellWidth}px)`,
                                gap: 0,
                                border: '1px dashed var(--text-muted)',
                                position: 'relative',
                                transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                                width: '100%' // Fill the explicit parent width
                            }}
                        >
                            {stackItems.map((item, index) => {
                                const { isLastRow, isLastCol } = getItemClasses(index);
                                return (
                                    <div
                                        key={index}
                                        className="stack-item-dynamic"
                                        style={{
                                            borderRight: isLastCol ? 'none' : '1px dashed var(--text-muted)',
                                            borderBottom: isLastRow ? 'none' : '1px dashed var(--text-muted)',
                                            padding: gridConfig.iconSize > 120 ? '20px' : '12px',
                                            transition: 'all 0.3s ease'
                                        }}
                                    >
                                        <StackItem
                                            icon={item.icon || ''}
                                            name={item.name || ''}
                                            delay={500 + (index * 50)}
                                            iconSize={gridConfig.iconSize}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Social Links - Below grid on mobile, sidebar on desktop */}
                    {socialLinks.length > 0 && (
                        <div className="flex flex-row md:flex-col items-center justify-center md:justify-start gap-3 md:gap-4 mt-8 md:mt-0 w-auto md:w-12 shrink-0 relative z-30">
                            <div className="hidden md:block w-px h-12 bg-gradient-to-b from-gray-400/50 to-transparent mb-2"></div>

                            {socialLinks.map((link, index) => (
                                <SocialIcon
                                    key={link.name}
                                    name={link.name}
                                    url={link.url}
                                    delay={800 + (index * 100)}
                                />
                            ))}

                            <div className="hidden md:block w-px h-12 bg-gradient-to-t from-gray-400/50 to-transparent mt-2"></div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Stack;
