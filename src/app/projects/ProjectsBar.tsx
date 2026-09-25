/** The top bar of the project pages: home, the list, and the way to book a call. */
export default function ProjectsBar({ current }: { current?: 'list' }) {
    return (
        <header className="pj-bar">
            <a href="/" className="pj-home">Tem Revil</a>
            <nav aria-label="Site">
                <a href="/" className="pj-navlink pj-hide-sm">Portfolio</a>
                <a href="/projects" className="pj-navlink" aria-current={current === 'list' ? 'page' : undefined}>Projects</a>
                <a href="/book" className="pj-cta">Book a call</a>
            </nav>
        </header>
    );
}
