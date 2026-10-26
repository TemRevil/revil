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

/** The spring the dock open and the icon that flies with it share. */
export const DOCK_SPRING = { type: 'spring', damping: 30, stiffness: 350, mass: 1 } as const;

/**
 * The desktop open: the contact and CV modals rise out of the navbar like a window from a
 * taskbar, scaling up from bottom-center (pair with `transformOrigin: 'bottom center'`),
 * while their icon flies from the navbar button into the header (`layoutId`, see DockIcon).
 */
export const dockRise = {
    initial: { opacity: 0, scale: 0.3, y: 400 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.3, y: 400 },
    transition: DOCK_SPRING,
};
