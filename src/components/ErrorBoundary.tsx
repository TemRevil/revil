import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
    /** Rendered when a descendant throws. Defaults to null (render nothing). */
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
}

/**
 * Minimal error boundary. Its primary job here is to contain failures from the
 * app's React.lazy() + Suspense boundaries (SecretPage, Dashboard, the lottie
 * StreakCircle). Without it, a single failed hashed-chunk fetch - common after a
 * redeploy when a returning user still has a stale index.html referencing an old
 * chunk - would throw during render and unmount the WHOLE single-tree SPA to a
 * blank screen. With it, the failure is contained to the wrapped subtree.
 */
class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        // info-level so a benign lazy-chunk fetch failure doesn't trip the
        // "no browser errors logged" Best-Practices audit.
        console.info('[ErrorBoundary] Contained a render error:', error?.message, info?.componentStack);
    }

    render() {
        if (this.state.hasError) return this.props.fallback ?? null;
        return this.props.children;
    }
}

export default ErrorBoundary;
