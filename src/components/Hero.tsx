import { useEffect, useRef, useState } from 'react';
import anime from 'animejs';
import userImage from '../assets/imgs/user.jpg';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

// True handwriting animation - letter by letter
const HandwritingText = ({
    text,
    fontSize = 70,
    delay = 0,
    color = '#3b82f6',
    rotate = 0
}: {
    text: string;
    fontSize?: number;
    delay?: number;
    color?: string;
    rotate?: number;
}) => {
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (svgRef.current) {
            const letters = svgRef.current.querySelectorAll('.letter-path');

            letters.forEach((letter, index) => {
                const textEl = letter as SVGTextElement;
                const estimatedLength = fontSize * 2;

                // Stroke drawing animation for each letter
                anime({
                    targets: textEl,
                    strokeDashoffset: [estimatedLength, 0],
                    duration: 120,
                    delay: delay + (index * 40), // Almost no gap between letters
                    easing: 'easeOutQuad',
                    begin: () => {
                        textEl.style.visibility = 'visible';
                        textEl.style.strokeDasharray = `${estimatedLength}`;
                        textEl.style.strokeDashoffset = `${estimatedLength}`;
                    },
                    complete: () => {
                        // Fill in the letter after stroke is drawn
                        anime({
                            targets: textEl,
                            fill: [{ value: 'transparent' }, { value: color }],
                            duration: 100,
                            easing: 'easeOutQuad',
                            complete: () => {
                                textEl.style.fill = color;
                                textEl.style.stroke = color;
                                textEl.style.strokeOpacity = '0.3';
                            }
                        });
                    }
                });
            });
        }
    }, [delay, text, fontSize, color]);

    // Calculate letter positions - normal spacing
    const letterSpacing = fontSize * 0.5;
    const spaceWidth = fontSize * 0.3;
    let xPos = 0;
    const positions: number[] = [];

    text.split('').forEach(char => {
        positions.push(xPos);
        xPos += char === ' ' ? spaceWidth : letterSpacing;
    });

    const width = xPos + 20;
    const height = fontSize * 1.4;

    return (
        <div style={{
            transform: `rotate(${rotate}deg)`,
            transformOrigin: 'left center',
            display: 'inline-block'
        }}>
            <svg
                ref={svgRef}
                width={width}
                height={height}
                viewBox={`0 0 ${width} ${height}`}
                style={{ overflow: 'visible' }}
            >
                {text.split('').map((char, index) => {
                    if (char === ' ') return null;

                    return (
                        <text
                            key={index}
                            className="letter-path"
                            x={positions[index]}
                            y={fontSize}
                            fontFamily="'Permanent Marker', cursive"
                            fontSize={fontSize}
                            fill="transparent"
                            stroke={color}
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{
                                paintOrder: 'stroke fill',
                                visibility: 'hidden'
                            }}
                        >
                            {char}
                        </text>
                    );
                })}
            </svg>
        </div>
    );
};

// Available Status Badge Component
const AvailableBadge = () => {
    const badgeRef = useRef<HTMLDivElement>(null);
    const pulseRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Pulse animation for the dot
        anime({
            targets: pulseRef.current,
            scale: [1, 1.5],
            opacity: [0.8, 0],
            duration: 1500,
            loop: true,
            easing: 'easeOutQuad'
        });

        // Badge entrance - starts right after handwriting
        anime({
            targets: badgeRef.current,
            opacity: [0, 1],
            translateY: [20, 0],
            duration: 800,
            delay: 1200,
            easing: 'easeOutExpo'
        });
    }, []);

    return (
        <div ref={badgeRef} style={{ display: 'flex', alignItems: 'center', gap: '20px', opacity: 0, flexWrap: 'wrap', justifyContent: 'center' }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px 24px',
                background: 'var(--card-bg)',
                backdropFilter: 'blur(16px)',
                borderRadius: '9999px',
                boxShadow: 'var(--card-shadow)',
                border: '1px solid rgba(243, 244, 246, 1)'
            }}>
                <div style={{ position: 'relative' }}>
                    <div style={{ width: '12px', height: '12px', backgroundColor: '#22c55e', borderRadius: '9999px' }}></div>
                    <div ref={pulseRef} style={{ position: 'absolute', inset: 0, width: '12px', height: '12px', backgroundColor: '#22c55e', borderRadius: '9999px' }}></div>
                </div>
                <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600, color: 'var(--text-primary)' }}>Available</span>
            </div>
            <div style={{
                padding: '10px 20px',
                background: '#111827',
                color: 'white',
                borderRadius: '9999px',
                fontFamily: 'Inter, sans-serif',
                fontSize: '14px',
                fontWeight: 500
            }}>
                UTC+2
            </div>
        </div>
    );
};

const Hero = () => {
    const titleRef = useRef<HTMLHeadingElement>(null);
    const imageRef = useRef<HTMLDivElement>(null);
    const imageContainerRef = useRef<HTMLDivElement>(null);
    const box1Ref = useRef<HTMLDivElement>(null);
    const box2Ref = useRef<HTMLDivElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [isDark, setIsDark] = useState(false);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);

    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, 'Settings', 'Hero'),
            (docSnapshot) => {
                if (docSnapshot.exists()) {
                    const data = docSnapshot.data();
                    if (data.imageUrl) {
                        setHeroImageUrl(data.imageUrl);
                    }
                }
            },
            (error) => {
                const status = navigator.onLine ? "Service Blocked (ISP/Firewall)" : "Offline";
                console.warn(`[Connection] Hero sync: ${status}. Check diagnostic in lib/firebase.ts`, error);
            }
        );
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const checkTheme = () => setIsDark(document.documentElement.classList.contains('dark'));
        const handleResize = () => setWindowWidth(window.innerWidth);

        checkTheme();
        window.addEventListener('resize', handleResize);
        const observer = new MutationObserver(checkTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

        return () => {
            window.removeEventListener('resize', handleResize);
            observer.disconnect();
        };
    }, []);

    // Responsive sizes
    const isMobile = windowWidth < 768;
    const isSmallMobile = windowWidth < 400;

    // Dynamic font sizes for handwriting
    const topSloganSize = isSmallMobile ? 40 : (isMobile ? 50 : 80);
    const bottomSloganSize = isSmallMobile ? 30 : (isMobile ? 40 : 60);

    useEffect(() => {
        // Animate "Tem Revil"
        anime({
            targets: titleRef.current,
            opacity: [0, 1],
            translateX: [-50, 0],
            duration: 1200,
            easing: 'easeOutExpo',
            delay: 350
        });

        // Animate Image entrance
        anime({
            targets: imageRef.current,
            opacity: [0, 1],
            scale: [0.9, 1],
            duration: 1500,
            easing: 'easeOutElastic(1, .8)',
            delay: 0
        });

        // Floating animation for the entire wrapper (image + boxes)
        anime({
            targets: wrapperRef.current,
            translateY: [-10, 10],
            rotate: [-1, 1],
            duration: 4000,
            easing: 'easeInOutSine',
            direction: 'alternate',
            loop: true
        });
    }, []);

    return (
        <div className="min-h-screen w-full flex items-center justify-center overflow-hidden relative pt-20 pb-32" style={{ backgroundColor: 'var(--bg-primary)', transition: 'background-color 0.3s ease' }}>
            {/* Wall texture - subtle grain pattern */}
            <div className="absolute inset-0 pointer-events-none" style={{
                backgroundImage: `
                    radial-gradient(circle at 25% 25%, rgba(0,0,0,0.02) 1px, transparent 1px),
                    radial-gradient(circle at 75% 75%, rgba(0,0,0,0.02) 1px, transparent 1px),
                    radial-gradient(circle at 50% 50%, rgba(0,0,0,0.01) 2px, transparent 2px)
                `,
                backgroundSize: '20px 20px, 20px 20px, 40px 40px'
            }}></div>

            {/* Subtle concrete-like overlay */}
            <div className="absolute inset-0 pointer-events-none opacity-30" style={{
                backgroundImage: `
                    linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.01) 50%, transparent 100%),
                    linear-gradient(0deg, transparent 0%, rgba(0,0,0,0.01) 50%, transparent 100%)
                `,
                backgroundSize: '100px 100px'
            }}></div>

            <div className="page-padding grid grid-cols-1 md:grid-cols-2 gap-12 items-center relative z-10 w-full">

                {/* Left Content */}
                <div className="flex flex-col items-center md:items-start text-center md:text-left relative">
                    <div className="mb-[-10px] md:-mb-4 md:ml-4 origin-center md:origin-left">
                        <HandwritingText
                            text="This is"
                            fontSize={topSloganSize}
                            delay={0}
                            rotate={-5}
                        />
                    </div>
                    <h1 ref={titleRef} className="font-['Inter'] font-black text-6xl sm:text-7xl md:text-8xl lg:text-9xl tracking-tighter opacity-0 z-10" style={{ color: 'var(--text-primary)', transition: 'color 0.3s ease', lineHeight: '1.1' }}>
                        Tem Revil
                    </h1>
                    <div className="mt-[-5px] md:mt-[-10px] md:self-end md:mr-20 origin-center md:origin-right">
                        <HandwritingText
                            text="a Front-End"
                            fontSize={bottomSloganSize}
                            delay={400}
                            rotate={-3}
                        />
                    </div>

                    {/* Decorative Elements - Hide on mobile if too crowded */}
                    <div className="hidden md:grid absolute top-1/2 left-0 -translate-x-8 translate-y-24 grid-cols-3 gap-2">
                        {[...Array(12)].map((_, i) => (
                            <div key={i} className="w-3 h-3 rounded-full border-2 border-[#3b82f6]"></div>
                        ))}
                    </div>

                    {/* Available Badge */}
                    <div className="mt-12 md:mt-20 md:ml-4 md:pl-4">
                        <AvailableBadge />
                    </div>
                </div>

                {/* Right Content - Image */}
                <div className="relative flex justify-center mt-8 md:mt-0" ref={imageRef}>
                    <div ref={wrapperRef} className="relative inline-block max-w-full">
                        {/* Decorative Squares - with floating animation */}
                        <div ref={box1Ref} className={`absolute -top-6 -left-6 w-24 h-24 bg-white/10 backdrop-blur-md border border-white/20 ${isDark ? 'z-0' : 'z-30'} scale-75 sm:scale-100`}></div>
                        <div ref={box2Ref} className={`absolute -bottom-6 -right-6 w-24 h-24 bg-white/10 backdrop-blur-md border border-white/20 ${isDark ? 'z-0' : 'z-30'} scale-75 sm:scale-100`}></div>

                        {/* Image Container - with floating animation */}
                        <div ref={imageContainerRef} className="relative p-4 border border-white/50 z-10 rounded-lg max-w-full" style={{
                            background: 'var(--card-bg)',
                            backdropFilter: 'blur(16px)',
                            boxShadow: 'var(--card-shadow)'
                        }}>
                            <div className="relative w-full max-w-[320px] aspect-[4/5] overflow-hidden bg-gray-200 rounded-sm">
                                <img
                                    src={heroImageUrl || userImage}
                                    alt="User"
                                    className="w-full h-full object-cover"
                                />
                            </div>

                            {/* Numbers */}
                            <div className="absolute -left-8 top-1/2 -rotate-90 font-bold text-xl hidden sm:block">4.0</div>
                            <div className="absolute bottom-[-30px] left-1/2 -translate-x-1/2 font-bold text-xl">5.0</div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default Hero;
