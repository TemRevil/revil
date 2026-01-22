import { useEffect, useRef, useState } from 'react';
import anime from 'animejs';

interface PageTransitionProps {
    isTransitioning: boolean;
    onCurtainCovered: () => void;
    onTransitionComplete: () => void;
    nextSectionName?: string;
}

const PageTransition = ({ isTransitioning, onCurtainCovered, onTransitionComplete, nextSectionName = '' }: PageTransitionProps) => {
    const curtainRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [currentDirection, setCurrentDirection] = useState<'top' | 'bottom' | 'right'>('top');

    const displayName = nextSectionName.charAt(0).toUpperCase() + nextSectionName.slice(1);

    const [fontSize, setFontSize] = useState(Math.min(window.innerWidth / 6, 100));

    useEffect(() => {
        const handleResize = () => {
            // Responsive font size: 1/6th of screen width, max 100px, min 40px
            setFontSize(Math.max(40, Math.min(window.innerWidth / 6, 100)));
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const letterSpacing = fontSize * 0.65;
    const spaceWidth = fontSize * 0.4;
    let xPos = 0;
    const positions: number[] = [];

    displayName.split('').forEach(char => {
        positions.push(xPos);
        xPos += char === ' ' ? spaceWidth : letterSpacing;
    });

    const svgWidth = xPos + 20;
    const svgHeight = fontSize * 1.4;

    useEffect(() => {
        if (isTransitioning && curtainRef.current) {
            let direction: 'top' | 'bottom' | 'right' = 'top';

            if (nextSectionName === 'secret') {
                direction = 'right';
            } else {
                const directions: ('top' | 'bottom')[] = ['top', 'bottom'];
                direction = directions[Math.floor(Math.random() * directions.length)];
            }

            setCurrentDirection(direction);

            curtainRef.current.style.display = 'block';

            // Reset styles
            curtainRef.current.style.height = '100%';
            curtainRef.current.style.width = '100%';
            curtainRef.current.style.top = '0';
            curtainRef.current.style.left = '0';
            curtainRef.current.style.bottom = 'auto';
            curtainRef.current.style.right = 'auto';

            if (direction === 'right') {
                // Horizontal: Start from right (covering moves Left)
                // Initial: Width 0, Anchored Right
                curtainRef.current.style.width = '0%';
                curtainRef.current.style.left = 'auto';
                curtainRef.current.style.right = '0';
            } else {
                // Vertical
                curtainRef.current.style.height = '0%';
                curtainRef.current.style.top = direction === 'top' ? '0' : 'auto';
                curtainRef.current.style.bottom = direction === 'bottom' ? '0' : 'auto';
            }

            const animationProps = direction === 'right'
                ? { width: ['0%', '100%'] }
                : { height: ['0%', '100%'] };

            // Entry: Grow
            anime({
                targets: curtainRef.current,
                ...animationProps,
                duration: 500,
                easing: 'easeOutQuart',
                complete: () => {
                    // Handwriting animation
                    if (svgRef.current) {
                        const letters = svgRef.current.querySelectorAll('.letter-path');

                        letters.forEach((letter, index) => {
                            const textEl = letter as SVGTextElement;
                            const estimatedLength = fontSize * 2;

                            anime({
                                targets: textEl,
                                strokeDashoffset: [estimatedLength, 0],
                                duration: 120,
                                delay: index * 40,
                                easing: 'easeOutQuad',
                                begin: () => {
                                    textEl.style.visibility = 'visible';
                                    textEl.style.strokeDasharray = `${estimatedLength}`;
                                    textEl.style.strokeDashoffset = `${estimatedLength}`;
                                },
                                complete: () => {
                                    anime({
                                        targets: textEl,
                                        fill: [{ value: 'transparent' }, { value: 'white' }],
                                        duration: 100,
                                        easing: 'easeOutQuad',
                                        complete: () => {
                                            textEl.style.fill = 'white';
                                            textEl.style.stroke = 'white';
                                            textEl.style.strokeOpacity = '0.3';
                                        }
                                    });
                                }
                            });
                        });
                    }

                    onCurtainCovered();

                    setTimeout(() => {
                        // Exit phase
                        if (curtainRef.current) {
                            if (direction === 'right') {
                                // Exit: Shrink towards Left
                                // Anchor changes to Left
                                curtainRef.current.style.left = '0';
                                curtainRef.current.style.right = 'auto';
                            } else {
                                // Exit: Shrink towards opposite vertical side
                                curtainRef.current.style.top = direction === 'top' ? 'auto' : '0';
                                curtainRef.current.style.bottom = direction === 'top' ? '0' : 'auto';
                            }
                        }

                        const exitProps = direction === 'right'
                            ? { width: ['100%', '0%'] }
                            : { height: ['100%', '0%'] };

                        anime({
                            targets: curtainRef.current,
                            ...exitProps,
                            duration: 450,
                            easing: 'easeInQuart',
                            complete: () => {
                                if (curtainRef.current) {
                                    curtainRef.current.style.display = 'none';
                                    curtainRef.current.style.height = '100%';
                                }

                                if (svgRef.current) {
                                    const letters = svgRef.current.querySelectorAll('.letter-path');
                                    letters.forEach((letter) => {
                                        const textEl = letter as SVGTextElement;
                                        textEl.style.visibility = 'hidden';
                                        textEl.style.fill = 'transparent';
                                    });
                                }
                                onTransitionComplete();
                            }
                        });
                    }, 500);
                }
            });
        }
    }, [isTransitioning, onCurtainCovered, onTransitionComplete, displayName, fontSize]);

    return (
        <div
            ref={curtainRef}
            className={`fixed inset-0 overflow-hidden z-50 ${currentDirection}`}
            style={{ backgroundColor: 'var(--accent)', display: 'none' }}
        >
            <div className="absolute flex items-center justify-center" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '100%', height: '100%' }}>
                <svg
                    ref={svgRef}
                    width={svgWidth}
                    height={svgHeight}
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                    style={{ overflow: 'visible' }}
                >
                    {displayName.split('').map((char, index) => {
                        if (char === ' ') return null;

                        return (
                            <text
                                key={index}
                                className="letter-path"
                                x={positions[index]}
                                y={fontSize}
                                fontFamily="'Rock Salt', cursive"
                                fontSize={fontSize}
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                style={{ paintOrder: 'stroke fill', visibility: 'hidden', fill: 'transparent', stroke: 'white', strokeOpacity: 1 }}
                            >
                                {char}
                            </text>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
};

export default PageTransition;
