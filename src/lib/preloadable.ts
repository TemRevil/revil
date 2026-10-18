import { createElement, lazy, startTransition, useState, type ComponentType } from 'react';

/**
 * A lazy component whose chunk can be fetched ahead of time. React.lazy suspends on its
 * first render even when the chunk is already loaded (an import() always resolves a tick
 * later), and a suspended open has to go through a transition, which React renders in
 * slices between frames: on a slow phone the first modal open took over a second. Once
 * `preload` has finished this renders the module itself, so nothing suspends and `open`
 * runs the update at normal priority, in one go.
 */
export function preloadable<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
    let loaded: ComponentType<P> | null = null;
    let pending: Promise<void> | null = null;
    const Lazy = lazy(load);
    const preload = () => (pending ??= load().then(
        m => { loaded = m.default; },
        () => { pending = null; },
    ));
    function Preloadable(props: P) {
        // Fixed per mount: swapping the lazy wrapper for the module while it is open would remount it.
        const [Component] = useState<ComponentType<P>>(() => loaded ?? Lazy);
        return createElement(Component, props);
    }
    /** Runs the update that shows it: directly once preloaded, else in a transition (see above). */
    const open = (show: () => void) => (loaded ? show() : startTransition(show));
    return Object.assign(Preloadable, { preload, open });
}
