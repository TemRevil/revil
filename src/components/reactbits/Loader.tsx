/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    motion,
    AnimatePresence,
    Transition,
    LayoutGroup,
    type VariantLabels,
    type Target,
    type TargetAndTransition
} from 'motion/react';

function cn(...classes: (string | undefined | null | boolean)[]): string {
    return classes.filter(Boolean).join(' ');
}

export interface RotatingTextRef {
    next: () => void;
    previous: () => void;
    jumpTo: (index: number) => void;
    reset: () => void;
}

export interface RotatingTextProps
    extends Omit<
        React.ComponentPropsWithoutRef<typeof motion.span>,
        'children' | 'transition' | 'initial' | 'animate' | 'exit'
    > {
    texts: string[];
    transition?: Transition;
    initial?: boolean | Target | VariantLabels;
    animate?: boolean | VariantLabels | TargetAndTransition;
    exit?: Target | VariantLabels;
    animatePresenceMode?: 'sync' | 'wait';
    animatePresenceInitial?: boolean;
    rotationInterval?: number;
    staggerDuration?: number;
    staggerFrom?: 'first' | 'last' | 'center' | 'random' | number;
    loop?: boolean;
    auto?: boolean;
    splitBy?: string;
    onNext?: (index: number) => void;
    mainClassName?: string;
    splitLevelClassName?: string;
    elementLevelClassName?: string;
}

const RotatingText = forwardRef<RotatingTextRef, RotatingTextProps>((props, ref) => {
    const {
        texts,
        transition = { type: 'spring', damping: 25, stiffness: 300 },
        initial = { y: '100%', opacity: 0 },
        animate = { y: 0, opacity: 1 },
        exit = { y: '-120%', opacity: 0 },
        animatePresenceMode = 'popLayout',
        animatePresenceInitial = false,
        rotationInterval = 2000,
        staggerDuration = 0,
        staggerFrom = 'first',
        loop = true,
        auto = true,
        splitBy = 'characters',
        onNext,
        mainClassName,
        splitLevelClassName,
        elementLevelClassName,
        ...rest
    } = props;

    const [currentTextIndex, setCurrentTextIndex] = useState<number>(0);

    const splitIntoCharacters = (text: string): string[] => {
        if (typeof Intl !== 'undefined' && (Intl as any).Segmenter) {
            const segmenter = new (Intl as any).Segmenter('en', { granularity: 'grapheme' });
            return Array.from(segmenter.segment(text), (segment: any) => segment.segment);
        }
        return Array.from(text);
    };

    const elements = useMemo(() => {
        const currentText: string = texts[currentTextIndex];
        if (splitBy === 'characters') {
            const words = currentText.split(' ');
            return words.map((word, i) => ({
                characters: splitIntoCharacters(word),
                needsSpace: i !== words.length - 1
            }));
        }
        if (splitBy === 'words') {
            return currentText.split(' ').map((word, i, arr) => ({
                characters: [word],
                needsSpace: i !== arr.length - 1
            }));
        }
        if (splitBy === 'lines') {
            return currentText.split('\n').map((line, i, arr) => ({
                characters: [line],
                needsSpace: i !== arr.length - 1
            }));
        }

        return currentText.split(splitBy).map((part, i, arr) => ({
            characters: [part],
            needsSpace: i !== arr.length - 1
        }));
    }, [texts, currentTextIndex, splitBy]);

    const getStaggerDelay = useCallback(
        (index: number, totalChars: number): number => {
            const total = totalChars;
            if (staggerFrom === 'first') return index * staggerDuration;
            if (staggerFrom === 'last') return (total - 1 - index) * staggerDuration;
            if (staggerFrom === 'center') {
                const center = Math.floor(total / 2);
                return Math.abs(center - index) * staggerDuration;
            }
            if (staggerFrom === 'random') {
                const randomIndex = Math.floor(Math.random() * total);
                return Math.abs(randomIndex - index) * staggerDuration;
            }
            return Math.abs((staggerFrom as number) - index) * staggerDuration;
        },
        [staggerFrom, staggerDuration]
    );

    const handleIndexChange = useCallback(
        (newIndex: number) => {
            setCurrentTextIndex(newIndex);
            if (onNext) onNext(newIndex);
        },
        [onNext]
    );

    const next = useCallback(() => {
        const nextIndex = currentTextIndex === texts.length - 1 ? (loop ? 0 : currentTextIndex) : currentTextIndex + 1;
        if (nextIndex !== currentTextIndex) {
            handleIndexChange(nextIndex);
        }
    }, [currentTextIndex, texts.length, loop, handleIndexChange]);

    const previous = useCallback(() => {
        const prevIndex = currentTextIndex === 0 ? (loop ? texts.length - 1 : currentTextIndex) : currentTextIndex - 1;
        if (prevIndex !== currentTextIndex) {
            handleIndexChange(prevIndex);
        }
    }, [currentTextIndex, texts.length, loop, handleIndexChange]);

    const jumpTo = useCallback(
        (index: number) => {
            const validIndex = Math.max(0, Math.min(index, texts.length - 1));
            if (validIndex !== currentTextIndex) {
                handleIndexChange(validIndex);
            }
        },
        [texts.length, currentTextIndex, handleIndexChange]
    );

    const reset = useCallback(() => {
        if (currentTextIndex !== 0) {
            handleIndexChange(0);
        }
    }, [currentTextIndex, handleIndexChange]);

    useImperativeHandle(
        ref,
        () => ({
            next,
            previous,
            jumpTo,
            reset
        }),
        [next, previous, jumpTo, reset]
    );

    useEffect(() => {
        if (!auto) return;
        const intervalId = setInterval(next, rotationInterval);
        return () => clearInterval(intervalId);
    }, [next, rotationInterval, auto]);

    return (
        <motion.span
            className={cn('text-rotate', mainClassName)}
            {...rest}
            layout
            transition={transition}
            style={{ display: 'inline-flex', alignItems: 'center' }}
        >
            <span className="text-rotate-sr-only">{texts[currentTextIndex]}</span>
            <AnimatePresence mode={animatePresenceMode} initial={animatePresenceInitial}>
                <motion.span
                    key={currentTextIndex}
                    className={cn(splitBy === 'lines' ? 'text-rotate-lines' : 'text-rotate')}
                    layout
                    aria-hidden="true"
                >
                    {elements.map((wordObj, wordIndex, array) => {
                        const previousCharsCount = array.slice(0, wordIndex).reduce((sum, word) => sum + word.characters.length, 0);
                        return (
                            <span key={wordIndex} className={cn('text-rotate-word', splitLevelClassName)}>
                                {wordObj.characters.map((char, charIndex) => (
                                    <motion.span
                                        key={charIndex}
                                        initial={initial}
                                        animate={animate}
                                        exit={exit}
                                        transition={{
                                            ...transition,
                                            delay: getStaggerDelay(
                                                previousCharsCount + charIndex,
                                                array.reduce((sum, word) => sum + word.characters.length, 0)
                                            )
                                        }}
                                        className={cn('text-rotate-element', elementLevelClassName)}
                                    >
                                        {char}
                                    </motion.span>
                                ))}
                                {wordObj.needsSpace && <span className="text-rotate-space"> </span>}
                            </span>
                        );
                    })}
                </motion.span>
            </AnimatePresence>
        </motion.span>
    );
});

RotatingText.displayName = 'RotatingText';

interface LoaderProps {
    isOpen?: boolean;
    isFullScreen?: boolean;
}

const Loader: React.FC<LoaderProps> = ({ isOpen = true, isFullScreen = false }) => {
    const content = (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4, ease: "easeInOut" }}
                    className={isFullScreen ? "fixed inset-0 flex items-center justify-center z-[999999]" : "flex flex-col items-center justify-center gap-6 p-4"}
                    style={isFullScreen ? {
                        backgroundColor: "rgba(0, 0, 0, 0.4)",
                        backdropFilter: "blur(60px)",
                        WebkitBackdropFilter: "blur(60px)"
                    } : {}}
                >
                    <div className="flex flex-col items-center justify-center gap-10">
                        <LayoutGroup>
                            <motion.div
                                layout
                                transition={{ type: "spring", damping: 30, stiffness: 400 }}
                                className="flex items-center gap-4"
                            >
                                <motion.span
                                    layout
                                    transition={{ type: "spring", damping: 30, stiffness: 400 }}
                                    className="text-white text-4xl sm:text-5xl md:text-6xl font-black tracking-tight"
                                >
                                    Revil
                                </motion.span>
                                <RotatingText
                                    texts={['INIT', 'DATA', 'CORE', 'PROJECTS', 'STACK']}
                                    mainClassName="px-3 sm:px-4 md:px-5 bg-cyan-300 text-black overflow-hidden py-1 sm:py-2 md:py-3 justify-center rounded-2xl font-black text-4xl sm:text-5xl md:text-6xl tracking-tight"
                                    staggerFrom={"last"}
                                    initial={{ y: "100%", opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    exit={{ y: "-120%", opacity: 0 }}
                                    staggerDuration={0.025}
                                    splitLevelClassName="overflow-hidden pb-1 sm:pb-2 md:pb-2"
                                    transition={{ type: "spring", damping: 30, stiffness: 400 }}
                                    rotationInterval={2000}
                                />
                            </motion.div>
                        </LayoutGroup>
                    </div>

                    <style dangerouslySetInnerHTML={{
                        __html: `
                        .text-rotate {
                            display: flex;
                            flex-wrap: wrap;
                            white-space: pre-wrap;
                            position: relative;
                        }
                        .text-rotate-sr-only {
                            position: absolute;
                            width: 1px;
                            height: 1px;
                            padding: 0;
                            margin: -1px;
                            overflow: hidden;
                            clip: rect(0, 0, 0, 0);
                            white-space: nowrap;
                            border-width: 0;
                        }
                        .text-rotate-lines {
                            display: flex;
                            flex-direction: column;
                            width: 100%;
                        }
                        .text-rotate-word {
                            display: inline-flex;
                        }
                        .text-rotate-element {
                            display: inline-block;
                        }
                        .text-rotate-space {
                            white-space: pre;
                        }
                    `}} />
                </motion.div>
            )}
        </AnimatePresence>
    );

    if (isFullScreen) {
        return createPortal(content, document.body);
    }

    return content;
};

export { RotatingText };
export default Loader;
