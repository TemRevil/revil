import { preload } from 'react-dom'
import HomeApp from './HomeApp'
import { projectPages } from '../utils/projectPages'
import { baseGraph, homeGraph, jsonLd, HOME_FAQ, JOB_TITLE, SERVICES, SKILLS, SOCIAL_PROFILES } from '../utils/siteProfile'

// A server component on purpose: the <noscript> copy below is built from the project
// snapshot at build time, and nothing of it ships to the browser as JavaScript.

export default function Page() {
  // The hero photo is rendered by the client app, so the browser would only ask for it
  // once the JS has run (~4s on a slow phone). A <link rel=preload> in the HTML starts it
  // with the first requests instead.
  preload('/book/tem-cutout.webp', { as: 'image', fetchPriority: 'high' })
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd([...baseGraph, ...homeGraph]) }} />
      {/* GEO fallback - the visible app is a client-rendered SPA (ssr:false), so AI
          crawlers that do NOT execute JavaScript (GPTBot, ClaudeBot, PerplexityBot,
          CCBot, etc.) only ever see this static HTML plus the JSON-LD in <head>.
          Googlebot renders JS and sees the full app. We mirror the canonical facts
          from layout.tsx structured data + llms.txt here as semantic HTML so the
          non-JS engines get the complete, consistent story. */}
      <noscript>
        <article
          style={{
            padding: '24px',
            maxWidth: '760px',
            margin: '0 auto',
            fontFamily: 'Inter, sans-serif',
            background: '#08090d',
            color: '#f5f7fb',
            lineHeight: 1.7,
          }}
        >
          <header>
            <h1 style={{ marginBottom: '12px' }}>Tem Revil | {JOB_TITLE}</h1>
            <p style={{ marginBottom: '10px' }}>
              Mohammed Ahmed, known publicly as <strong>Tem Revil</strong> (also Temrevil),
              is a frontend engineer and AI engineer based in El Mansoura (El Mansourah),
              Dakahlia, Egypt. He builds motion-rich, accessible web applications with
              React, Next.js, TypeScript, and Firebase, and integrates AI into web
              products. Open to freelance, remote, and full-time opportunities.
            </p>
          </header>

          <section>
            <h2>Skills</h2>
            <ul>
              {SKILLS.map((s) => <li key={s}>{s}</li>)}
            </ul>
          </section>

          <section>
            <h2>Services</h2>
            <ul>
              {SERVICES.map((s) => <li key={s}>{s}</li>)}
            </ul>
          </section>

          <section>
            <h2>Frequently asked questions</h2>
            {/* The same questions and answers as llms.txt (HOME_FAQ in siteProfile). */}
            {HOME_FAQ.map(({ q, a }) => (
              <div key={q}>
                <h3>{q}</h3>
                <p>{a}</p>
              </div>
            ))}
          </section>

          <nav aria-label="Pages">
            <h2>Pages</h2>
            <ul>
              <li><a href="/book">Book a free 60 minute call</a></li>
              <li><a href="/projects">All projects</a></li>
              {projectPages.map((p) => (
                <li key={p.slug}><a href={`/projects/${p.slug}`}>{p.name}</a></li>
              ))}
            </ul>
          </nav>

          <footer>
            <h2>Contact &amp; profiles</h2>
            <ul>
              <li>Website: <a href="https://temrevil.com">temrevil.com</a></li>
              <li>Email: <a href="mailto:hello@temrevil.com">hello@temrevil.com</a></li>
              <li>GitHub: <a href={SOCIAL_PROFILES.github}>github.com/TemRevil</a></li>
              <li>LinkedIn: <a href={SOCIAL_PROFILES.linkedin}>linkedin.com/in/tem-revil</a></li>
              <li>Instagram: <a href={SOCIAL_PROFILES.instagram}>instagram.com/temrevil</a></li>
            </ul>
          </footer>
        </article>
      </noscript>
      <HomeApp />
    </>
  )
}
