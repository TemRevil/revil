import { useEffect, useRef, useState } from 'react';
import anime from 'animejs';
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
    const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);

    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const isSmall = windowWidth <= 400;
    const fontSize = isSmall ? 28 : 48;
    const nameFontSize = isSmall ? '1.1rem' : '1.5rem';

    const letterSpacing = fontSize * 0.55;
    let xPos = 0;
    const positions: number[] = [];

    percentage.split('').forEach(() => {
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

        // Percentage handwriting animation
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
                            fill: [{ value: 'transparent' }, { value: 'var(--accent)' }],
                            duration: 150,
                            easing: 'easeOutQuad',
                            complete: () => {
                                textEl.style.fill = 'var(--accent)';
                                textEl.style.stroke = 'var(--accent)';
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
            className="stack-inner opacity-0"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <img
                ref={iconRef}
                src={icon}
                alt={name}
                className="stack-icon transition-slow"
                style={{
                    opacity: isHovered ? 1 : 0.35,
                    filter: isHovered ? 'none' : 'grayscale(100%) brightness(0.8)',
                    transform: isHovered ? 'scale(1.1)' : 'scale(1)'
                }}
            />

            {information && (
                <div
                    className="absolute z-50 pointer-events-auto cursor-pointer"
                    style={{
                        top: '-10px',
                        left: isSmall ? '20px' : '50px',
                        width: isSmall ? '180px' : '220px',
                        transform: isHovered ? 'translateY(-100%) scale(1)' : 'translateY(-90%) scale(0.9)',
                        opacity: isHovered ? 1 : 0,
                        transition: 'opacity 0.15s ease-out, transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                        pointerEvents: isHovered ? 'auto' : 'none',
                    }}
                >
                    <div
                        className="nav-tooltip-inner text-center leading-relaxed"
                        style={{
                            whiteSpace: 'normal',
                            fontWeight: 'normal',
                            fontSize: '0.85rem',
                            backgroundColor: 'rgba(20, 20, 25, 0.6)',
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                        }}
                    >
                        {information}
                    </div>
                </div>
            )}

            <div className="flex flex-col items-start justify-center">
                <h3
                    className="transition-slow font-black m-0"
                    style={{
                        fontSize: nameFontSize,
                        color: 'var(--text-primary)'
                    }}
                >
                    {name}
                </h3>

                <div className="mt-1">
                    <svg
                        ref={percentageRef}
                        width={svgWidth}
                        height={svgHeight}
                        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                        className="overflow-visible"
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
                                stroke="var(--accent)"
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
        // Animation sequence
        anime({
            targets: handwritingRef.current,
            opacity: [0, 1],
            translateX: [-30, 0],
            duration: 800,
            easing: 'easeOutQuad'
        });

        anime({
            targets: titleRef.current,
            opacity: [0, 1],
            translateX: [-50, 0],
            duration: 1000,
            delay: 200,
            easing: 'easeOutQuad'
        });

        anime({
            targets: gridRef.current,
            opacity: [0, 1],
            duration: 800,
            delay: 400,
            easing: 'easeOutQuad'
        });
    }, []);

    return (
        <div className="min-h-screen w-full overflow-x-hidden flex flex-col justify-center bg-primary transition-slow pt-20 pb-40 page-padding">

            {/* Header Section */}
            <div className="mb-14">
                {/* "My Tech" - Increased size to text-3xl/4xl */}
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
                {/* "Stack" - Massively increased size: 6xl -> 9xl, added font-black and leading-none */}
                <h1
                    ref={titleRef}
                    className="text-6xl md:text-8xl lg:text-9xl font-black transition-slow opacity-0 m-0 leading-none"
                    style={{ color: 'var(--text-primary)' }}
                >
                    Stack
                </h1>
            </div>

            {/* Grid Container */}
            <div
                ref={gridRef}
                className="relative mb-20 opacity-0"
            >
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

                {/* Grid Items */}
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