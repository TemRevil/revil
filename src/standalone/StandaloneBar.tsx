import { ArrowUpRight } from 'lucide-react';

/** Shared navigation for the public reading and project pages. */
export default function StandaloneBar({ current }: { current?: 'list' | 'privacy' }) {
    return (
        <header className="pj-bar">
            <a href="/" className="pj-home" aria-label="Tem Revil, home">
                <span>Tem</span><span>Revil</span>
                <svg className="pj-signature" viewBox="0 0 120 16" fill="none" aria-hidden="true">
                    <path d="M3 10C27 5 52 5 76 7S104 9 117 4M17 13C43 9 71 10 95 11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
            </a>
            <nav aria-label="Site">
                <a href="/" className="pj-navlink">Portfolio</a>
                <a href="/projects" className="pj-navlink" aria-current={current === 'list' ? 'page' : undefined}>Projects</a>
                <a href="/privacy" className="pj-navlink" aria-current={current === 'privacy' ? 'page' : undefined}>Privacy &amp; terms</a>
            </nav>
            <a href="/book" className="pj-cta pj-bar-cta">Book a call<ArrowUpRight size={18} strokeWidth={1.8} aria-hidden="true" /></a>
        </header>
    );
}
