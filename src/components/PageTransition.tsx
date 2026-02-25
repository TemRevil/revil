import { useEffect, useRef, useState } from 'react';
import anime from 'animejs';

interface PageTransitionProps {
    isTransitioning: boolean;
    onCurtainCovered: () => void;
    onTransitionComplete: () => void;
    nextSectionName?: string;
    direction?: number;
}

const PageTransition = ({ isTransitioning, onCurtainCovered, onTransitionComplete, nextSectionName = '', direction = 0 }: PageTransitionProps) => {
    const curtainRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [fontSize, setFontSize] = useState(Math.min(window.innerWidth / 6, 100));
    const currentDirection: 'top' | 'bottom' | 'right' | 'left' =
        direction === 2 ? 'right' :
            direction === -2 ? 'left' :
                direction > 0 ? 'bottom' : 'top';

    const displayName = nextSectionName.charAt(0).toUpperCase() + nextSectionName.slice(1);

    useEffect(() => {
        const handleResize = () => {
            setFontSize(Math.max(40, Math.min(window.innerWidth / 6, 100)));
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const letterSpacing = fontSize * 0.65;
    const spaceWidth = fontSize * 0.4;
    let xPos = 0;
    const positions: number[] = [];

    displayName.split('').forEach((char: string) => {
        positions.push(xPos);
        xPos += char === ' ' ? spaceWidth : letterSpacing;
    });

    const svgWidth = xPos + 20;
    const svgHeight = fontSize * 1.4;

    useEffect(() => {
        if (isTransitioning && curtainRef.current) {
            const selectedDir = currentDirection;

            curtainRef.current.style.display = 'block';

            // Reset styles
            curtainRef.current.style.height = '100%';
            curtainRef.current.style.width = '100%';
            curtainRef.current.style.top = '0';
            curtainRef.current.style.left = '0';
            curtainRef.current.style.bottom = 'auto';
            curtainRef.current.style.right = 'auto';

            if (selectedDir === 'right') {
                // Horizontal: Start from right (covering moves Left)
                curtainRef.current.style.width = '0%';
                curtainRef.current.style.left = 'auto';
                curtainRef.current.style.right = '0';
            } else if (selectedDir === 'left') {
                // Horizontal: Start from left (covering moves Right)
                curtainRef.current.style.width = '0%';
                curtainRef.current.style.left = '0';
                curtainRef.current.style.right = 'auto';
            } else {
                // Vertical
                curtainRef.current.style.height = '0%';
                curtainRef.current.style.top = selectedDir === 'top' ? '0' : 'auto';
                curtainRef.current.style.bottom = selectedDir === 'bottom' ? '0' : 'auto';
            }

            const animationProps = (selectedDir === 'right' || selectedDir === 'left')
                ? { width: ['0%', '100%'] }
                : { height: ['0%', '100%'] };

            // Entry: Grow
            anime({
                targets: curtainRef.current,
                ...animationProps,
                duration: 150,
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
                                duration: 100,
                                delay: index * 30,
                                easing: 'easeOutQuad',
                                begin: () => {
                                    textEl.style.visibility = 'visible';
                                    textEl.style.strokeDasharray = `${estimatedLength}`;
                                    textEl.style.strokeDashoffset = `${estimatedLength}`;
                                },
                                complete: () => {
                                    anime({
                                        targets: textEl,
                                        fill: [{ value: 'transparent' }, { value: 'var(--text-primary)' }],
                                        duration: 60,
                                        easing: 'easeOutQuad',
                                        complete: () => {
                                            textEl.style.fill = 'var(--text-primary)';
                                            textEl.style.stroke = 'var(--text-primary)';
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
                            if (selectedDir === 'right') {
                                // Exit: Anchor Left, Shrink Width
                                curtainRef.current.style.left = '0';
                                curtainRef.current.style.right = 'auto';
                            } else if (selectedDir === 'left') {
                                // Exit: Anchor Right, Shrink Width (Reveals from Left)
                                curtainRef.current.style.left = 'auto';
                                curtainRef.current.style.right = '0';
                            } else {
                                // Vertical
                                // Top Entry -> Exit Anchor Bottom (Wipe Down)
                                // Bottom Entry -> Exit Anchor Top (Wipe Up)
                                curtainRef.current.style.top = selectedDir === 'top' ? 'auto' : '0';
                                curtainRef.current.style.bottom = selectedDir === 'top' ? '0' : 'auto';
                            }
                        }

                        const exitProps = (selectedDir === 'right' || selectedDir === 'left')
                            ? { width: ['100%', '0%'] }
                            : { height: ['100%', '0%'] };

                        anime({
                            targets: curtainRef.current,
                            ...exitProps,
                            duration: 150,
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
                    }, 400);
                }
            });
        }
    }, [isTransitioning, onCurtainCovered, onTransitionComplete, displayName, fontSize, currentDirection]);

    return (
        <div
            ref={curtainRef}
            className={`fixed inset-0 overflow-hidden z-50 ${currentDirection}`}
            style={{ backgroundColor: 'transparent', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', display: 'none' }}
        >
            <div className="absolute flex items-center justify-center" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '100%', height: '100%' }}>
                <svg
                    ref={svgRef}
                    width={svgWidth}
                    height={svgHeight}
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                    style={{ overflow: 'visible' }}
                >
                    {displayName.split('').map((char: string, index: number) => {
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
                                style={{ paintOrder: 'stroke fill', visibility: 'hidden', fill: 'transparent', stroke: 'var(--text-primary)', strokeOpacity: 1 }}
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
