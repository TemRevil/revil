import { ArrowUpRight } from 'lucide-react';
import RevilMark from '../ui/RevilMark';

/** Shared navigation for the public reading and project pages. */
export default function StandaloneBar({ current }: { current?: 'list' | 'privacy' }) {
    return (
        <header className="pj-bar">
            <a href="/" className="pj-home" aria-label="Tem Revil, home">
                <RevilMark size={44} className="pj-mark" />
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
