/**
 * How a modal opens and closes: it fades in out of a blur, and fades back into one.
 * The filter is dropped once the modal has landed: while any filter is set, the glass
 * panels inside can't blur the page behind them.
 */
export const blurFade = {
    initial: { opacity: 0, filter: 'blur(14px)' },
    animate: { opacity: 1, filter: 'blur(0px)', transitionEnd: { filter: 'none' } },
    exit: { opacity: 0, filter: 'blur(14px)', transition: { duration: 0.26, ease: [0.4, 0, 1, 1] as const } },
    transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const },
};
