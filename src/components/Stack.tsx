import { useEffect, useRef, useState } from 'react';
import anime from 'animejs';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { Github, Instagram, Linkedin, Twitter, Facebook, Mail, Link as LinkIcon, Twitch, Youtube, Code } from 'lucide-react';

interface StackItemProps {
    icon: string;
    name: string;
    delay: number;
}

const StackItem = ({ icon, name }: StackItemProps) => {
    const itemRef = useRef<HTMLDivElement>(null);
    const [isHovered, setIsHovered] = useState(false);
    const [imgError, setImgError] = useState(false);

    const showFallback = !icon || imgError;

    return (
        <div
            ref={itemRef}
            className="w-full h-full min-h-[220px] flex items-center justify-center p-2"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className={`flex items-center justify-center transition-all duration-300 ${isHovered ? 'scale-110' : ''}`}>
                {showFallback ? (
                    <Code size={120} className="text-zinc-400" />
                ) : (
                    <div
                        style={{
                            width: '150px',
                            height: '150px',
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

const SocialIcon = ({ name, url, delay }: { name: string; url: string; delay: number }) => {
    const iconRef = useRef<HTMLAnchorElement>(null);

    // Icon mapping
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

    const Icon = getIcon(name);

    useEffect(() => {
        anime({
            targets: iconRef.current,
            opacity: [0, 1],
            translateX: [20, 0],
            duration: 800,
            delay: delay,
            easing: 'easeOutQuad'
        });
    }, [delay]);

    return (
        <a
            ref={iconRef}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative flex items-center justify-center p-3 rounded-xl transition-all duration-300 hover:bg-white/5"
        >
            <Icon
                size={36}
                className="text-muted group-hover:text-primary transition-colors duration-300"
                strokeWidth={1.5}
            />

            {/* Tooltip - Left on desktop, Top on mobile */}
            <span className="absolute lg:right-full lg:mr-3 lg:top-1/2 lg:-translate-y-1/2 lg:bottom-auto lg:left-auto lg:translate-x-0 bottom-full mb-3 lg:mb-0 left-1/2 -translate-x-1/2 lg:left-auto px-3 py-1.5 bg-white backdrop-blur-md border border-zinc-200 rounded-lg text-xs font-bold text-black opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 shadow-xl">
                {name}
            </span>
        </a>
    );

};

const Stack = () => {
    const titleRef = useRef<HTMLHeadingElement>(null);
    const handwritingRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [stackItems, setStackItems] = useState<any[]>([]);
    const [socialLinks, setSocialLinks] = useState<{ name: string, url: string }[]>([]);

    // Fetch Stack Items
    useEffect(() => {
        const unsubStack = onSnapshot(doc(db, 'Settings', 'Tech Stack'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();

                const items = Object.entries(data)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([, item]: [string, any]) => {
                        return {
                            icon: item.Icon || item.icon,
                            name: item.Name || item.name
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
            translateX: [-20, 0],
            duration: 600,
            easing: 'easeOutExpo'
        });

        anime({
            targets: titleRef.current,
            opacity: [0, 1],
            translateX: [-30, 0],
            duration: 800,
            delay: 100,
            easing: 'easeOutExpo'
        });

        anime({
            targets: containerRef.current,
            opacity: [0, 1],
            duration: 800,
            delay: 200,
            easing: 'easeOutQuad'
        });
    }, []);

    return (
        <div className="min-h-screen w-full overflow-x-hidden flex flex-col justify-center bg-primary transition-slow pt-20 pb-40 page-padding">

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

            <div ref={containerRef} className="flex flex-col lg:flex-row gap-12 lg:gap-20 opacity-0 bg-transparent">

                {/* Tech Stack Grid */}
                <div className="flex-1 relative">
                    {/* Markers */}
                    <div className="marker marker-corner-tl"></div>
                    <div className="marker marker-corner-tr"></div>
                    <div className="marker marker-corner-bl"></div>
                    <div className="marker marker-corner-br"></div>

                    <div className="marker marker-edge-33 marker-edge-top"></div>
                    <div className="marker marker-edge-66 marker-edge-top"></div>
                    <div className="marker marker-edge-50 marker-edge-top"></div>

                    <div className="marker marker-edge-33 marker-edge-bottom"></div>
                    <div className="marker marker-edge-66 marker-edge-bottom"></div>
                    <div className="marker marker-edge-50 marker-edge-bottom"></div>

                    <div className="stack-grid">
                        {stackItems.map((item, index) => (
                            <div key={index} className="stack-item">
                                <StackItem
                                    icon={item.icon}
                                    name={item.name}
                                    delay={500 + (index * 50)}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Social Links Sidebar */}
                {socialLinks.length > 0 && (
                    <div className="w-full lg:w-24 shrink-0 flex flex-row lg:flex-col justify-center lg:justify-start items-center gap-4 lg:pt-8 bg-transparent">
                        <div className="hidden lg:block w-px h-12 bg-gradient-to-b from-transparent to-gray-500/20 mb-2"></div>
                        {socialLinks.map((link, index) => (
                            <SocialIcon
                                key={link.name}
                                name={link.name}
                                url={link.url}
                                delay={800 + (index * 100)}
                            />
                        ))}
                        <div className="hidden lg:block w-px h-full bg-gradient-to-t from-transparent to-gray-500/20 mt-2 flex-1"></div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Stack;