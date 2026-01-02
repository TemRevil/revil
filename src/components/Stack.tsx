import { useEffect, useRef, useState } from 'react';
import anime from 'animejs';

// Import SVG icons
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface StackItemProps {
    icon: string;
    name: string;
    percentage: string;
    delay: number;
    information?: string;
}

const StackItem = ({ icon, name, percentage, delay, information }: StackItemProps) => {
    const itemRef = useRef<HTMLDivElement>(null);
    const iconRef = useRef<HTMLImageElement>(null);
    const percentageRef = useRef<SVGSVGElement>(null);
    const [isHovered, setIsHovered] = useState(false);
    const [isDark, setIsDark] = useState(false);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);

    useEffect(() => {
        const checkTheme = () => setIsDark(document.documentElement.classList.contains('dark'));
        const handleResize = () => setWindowWidth(window.innerWidth);

        checkTheme();
        window.addEventListener('resize', handleResize);
        const observer = new MutationObserver(checkTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    // Responsive sizing
    const isSmall = windowWidth <= 400;
    const fontSize = isSmall ? 28 : 48;
    const nameFontSize = isSmall ? '1.1rem' : '1.5rem';

    const letterSpacing = fontSize * 0.55;
    let xPos = 0;
    const positions: number[] = [];

    percentage.split('').forEach(_char => {
        positions.push(xPos);
        xPos += letterSpacing;
    });

    const svgWidth = xPos + 10;
    const svgHeight = fontSize * 1.4;

    useEffect(() => {
        // Animate item entrance
        anime({
            targets: itemRef.current,
            opacity: [0, 1],
            translateY: [30, 0],
            duration: 800,
            delay: delay,
            easing: 'easeOutQuad'
        });

        // Animate icon
        anime({
            targets: iconRef.current,
            opacity: [0, 0.35],
            scale: [0.8, 1],
            duration: 1000,
            delay: delay + 200,
            easing: 'easeOutQuad'
        });

        // Handwriting animation for percentage (SVG stroke animation)
        if (percentageRef.current) {
            const letters = percentageRef.current.querySelectorAll('.percentage-letter');

            letters.forEach((letter, index) => {
                const textEl = letter as SVGTextElement;
                const estimatedLength = fontSize * 3;

                anime({
                    targets: textEl,
                    strokeDashoffset: [estimatedLength, 0],
                    duration: 200,
                    delay: delay + 500 + (index * 80),
                    easing: 'easeOutQuad',
                    begin: () => {
                        textEl.style.visibility = 'visible';
                        textEl.style.strokeDasharray = `${estimatedLength}`;
                        textEl.style.strokeDashoffset = `${estimatedLength}`;
                    },
                    complete: () => {
                        anime({
                            targets: textEl,
                            fill: [{ value: 'transparent' }, { value: 'rgb(59, 130, 246)' }],
                            duration: 150,
                            easing: 'easeOutQuad',
                            complete: () => {
                                textEl.style.fill = 'rgb(59, 130, 246)';
                                textEl.style.stroke = 'rgb(59, 130, 246)';
                                textEl.style.strokeOpacity = '0.3';
                            }
                        });
                    }
                });
            });
        }
    }, [delay, fontSize, percentage]);

    return (
        <div
            ref={itemRef}
            className="stack-inner"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                opacity: 0,
            }}
        >
            {/* Icon */}
            <img
                ref={iconRef}
                src={icon}
                alt={name}
                className="stack-icon"
                style={{
                    opacity: isHovered ? 1 : 0.35,
                    filter: isHovered ? 'none' : 'grayscale(100%) brightness(0.8)',
                    transform: isHovered ? 'scale(1.1)' : 'scale(1)'
                }}
            />

            {/* Tooltip */}
            {information && (
                <div style={{
                    position: 'absolute',
                    top: '-10px',
                    left: isSmall ? '20px' : '50px',
                    transform: isHovered ? 'translateY(-100%) scale(1)' : 'translateY(-90%) scale(0.9)',
                    backgroundColor: isDark ? 'rgba(30, 30, 30, 0.7)' : 'rgba(255, 255, 255, 0.7)',
                    color: 'var(--text-primary)',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    fontSize: '0.85rem',
                    width: isSmall ? '180px' : '220px',
                    pointerEvents: 'none',
                    opacity: isHovered ? 1 : 0,
                    transition: 'opacity 0.3s ease, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                    zIndex: 20,
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
                    textAlign: 'center',
                    lineHeight: '1.4'
                }}>
                    {information}
                    <div style={{
                        position: 'absolute',
                        bottom: '-6px',
                        left: '20px',
                        width: '12px',
                        height: '12px',
                        backgroundColor: isDark ? 'rgba(30, 30, 30, 0.7)' : 'rgba(255, 255, 255, 0.7)',
                        transform: 'rotate(45deg)',
                        borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                        borderRight: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)'
                    }} />
                </div>
            )}

            {/* Text content - to the right of icon */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                justifyContent: 'center'
            }}>
                {/* Name */}
                <h3 style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 900,
                    fontSize: nameFontSize,
                    color: 'var(--text-primary)',
                    margin: 0,
                    transition: 'color 0.3s ease'
                }}>
                    {name}
                </h3>

                {/* Percentage with SVG handwriting animation */}
                <div style={{ marginTop: '4px' }}>
                    <svg
                        ref={percentageRef}
                        width={svgWidth}
                        height={svgHeight}
                        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                        style={{ overflow: 'visible' }}
                    >
                        {percentage.split('').map((char, index) => (
                            <text
                                key={index}
                                className="percentage-letter"
                                x={positions[index]}
                                y={fontSize}
                                fontFamily="'Kalam', cursive"
                                fontSize={fontSize}
                                fontWeight="700"
                                fill="transparent"
                                stroke="rgb(59, 130, 246)"
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
                        ))}
                    </svg>
                </div>
            </div>
        </div>
    );
};

const Stack = () => {
    const titleRef = useRef<HTMLHeadingElement>(null);
    const handwritingRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);

    const [stackItems, setStackItems] = useState<any[]>([]);

    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'Settings', 'Tech Stack'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const items = Object.entries(data)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([_, item]: [string, any]) => ({
                        icon: item.Icon,
                        name: item.Name,
                        percentage: (item["Proficiency Level"] || 0) + '%',
                        information: item.Information
                    }));
                setStackItems(items);
            }
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        // Animate handwriting text
        anime({
            targets: handwritingRef.current,
            opacity: [0, 1],
            translateX: [-30, 0],
            duration: 800,
            easing: 'easeOutQuad'
        });

        // Animate title
        anime({
            targets: titleRef.current,
            opacity: [0, 1],
            translateX: [-50, 0],
            duration: 1000,
            delay: 200,
            easing: 'easeOutQuad'
        });

        // Animate grid border
        anime({
            targets: gridRef.current,
            opacity: [0, 1],
            duration: 800,
            delay: 400,
            easing: 'easeOutQuad'
        });
    }, []);

    return (
        <div
            className="min-h-screen max-w-full overflow-x-hidden flex flex-col justify-center bg-[var(--bg-primary)] transition-colors duration-300 pt-20 pb-40 page-padding"
            style={{ fontFamily: 'Inter, sans-serif' }}
        >
            {/* Header */}
            <div style={{ marginBottom: '60px' }}>
                <div
                    ref={handwritingRef}
                    style={{
                        fontFamily: "'Rock Salt', cursive",
                        fontSize: '2rem',
                        color: 'rgb(59, 130, 246)',
                        marginBottom: '-15px',
                        marginLeft: '10px',
                        opacity: 0
                    }}
                >
                    My Tech
                </div>
                <h1
                    ref={titleRef}
                    className="text-5xl md:text-7xl lg:text-8xl"
                    style={{
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: 900,
                        color: 'var(--text-primary)',
                        margin: 0,
                        opacity: 0,
                        transition: 'color 0.3s ease'
                    }}
                >
                    Stack
                </h1>
            </div>

            {/* Grid with border */}
            <div
                ref={gridRef}
                style={{ position: 'relative', marginBottom: '80px', opacity: 0 }}
            >
                {/* Corner squares */}
                <div className="marker marker-corner-tl"></div>
                <div className="marker marker-corner-tr"></div>
                <div className="marker marker-corner-bl"></div>
                <div className="marker marker-corner-br"></div>

                {/* Desktop/Tablet Edge markers (Controlled by CSS) */}
                <div className="marker marker-edge-33 marker-edge-top"></div>
                <div className="marker marker-edge-66 marker-edge-top"></div>
                <div className="marker marker-edge-50 marker-edge-top"></div>

                <div className="marker marker-edge-33 marker-edge-bottom"></div>
                <div className="marker marker-edge-66 marker-edge-bottom"></div>
                <div className="marker marker-edge-50 marker-edge-bottom"></div>

                {/* Grid items container */}
                <div className="stack-grid">
                    {stackItems.map((item, index) => (
                        <div key={item.name} className="stack-item">
                            <StackItem
                                icon={item.icon}
                                name={item.name}
                                percentage={item.percentage}
                                delay={500 + (index * 150)}
                                information={item.information}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default Stack;
