import { ArrowUpRight } from 'lucide-react';
import RevilMark from '../ui/RevilMark';
import PageCurtain from './PageCurtain';

/** Shared navigation for the public reading and project pages, and the curtain between them
 *  (`title`: this page's name, written on the curtain as it opens). */
export default function StandaloneBar({ current, title }: { current?: 'list' | 'privacy'; title: string }) {
    return (
        <>
        <header className="pj-bar">
            <a href="/" className="pj-home" aria-label="Tem Revil, home">
                <RevilMark size={30} className="pj-mark" />
            </a>
            <nav aria-label="Site">
                <a href="/" className="pj-navlink pj-nav-wide">Portfolio</a>
                <a href="/projects" className="pj-navlink" aria-current={current === 'list' ? 'page' : undefined}>Projects</a>
                <a href="/privacy" className="pj-navlink" aria-current={current === 'privacy' ? 'page' : undefined}>Privacy &amp; terms</a>
            </nav>
            <a href="/book" className="pj-cta pj-bar-cta">Book a call<ArrowUpRight size={18} strokeWidth={1.8} aria-hidden="true" /></a>
        </header>
        <PageCurtain title={title} />
        </>
    );
}
