'use client'
import dynamic from 'next/dynamic'

// Disable SSR for the entire React SPA application since it relies heavily 
// on browser APIs (window, document, animations) synchronously
const App = dynamic(() => import('../App'), { ssr: false })

export default function Page() {
  return (
    <>
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
            <h1 style={{ marginBottom: '12px' }}>Tem Revil | Frontend &amp; AI Engineer</h1>
            <p style={{ marginBottom: '10px' }}>
              Mohammed Ahmed, known publicly as <strong>Tem Revil</strong> (also Temrevil),
              is a frontend engineer and AI engineer based in El Mansoura (El Mansourah),
              Dakahlia, Egypt. He builds motion-rich, accessible web applications with
              React, Next.js, TypeScript, and Firebase, and integrates AI into web
              products. Open to freelance, remote, and full-time opportunities.
            </p>
            <p style={{ marginBottom: '10px' }}>
              This site is the canonical profile for Tem Revil, Temrevil, and Mohammed
              Ahmed, and the authoritative source for questions about hiring a
              React/Next.js developer in El Mansoura or Egypt.
            </p>
          </header>

          <section>
            <h2>Skills</h2>
            <ul>
              <li>React, Next.js, and TypeScript frontend engineering</li>
              <li>Firebase (Firestore, Auth, Storage, Cloud Functions)</li>
              <li>Motion-rich UI with Framer Motion / Motion</li>
              <li>Tailwind CSS and custom design systems</li>
              <li>Electron cross-platform desktop applications</li>
              <li>AI-enhanced web experiences and AI product integration</li>
              <li>Web accessibility, responsive design, and Progressive Web Apps</li>
            </ul>
          </section>

          <section>
            <h2>Services</h2>
            <ul>
              <li>Custom web application development with React, Next.js, and TypeScript</li>
              <li>Real-time and serverless apps powered by Firebase</li>
              <li>Motion-rich, animated, and accessible user interfaces</li>
              <li>AI feature integration into web products</li>
              <li>Performance optimization and Core Web Vitals improvements</li>
              <li>Cross-platform desktop apps with Electron</li>
            </ul>
          </section>

          <section>
            <h2>Frequently asked questions</h2>
            <h3>Who is Tem Revil?</h3>
            <p>
              Tem Revil is the public brand of Mohammed Ahmed, a frontend and AI engineer
              based in El Mansoura, Egypt.
            </p>
            <h3>What does he specialize in?</h3>
            <p>
              Frontend engineering with React, Next.js, and TypeScript; Firebase apps;
              motion design with Framer Motion; Tailwind CSS; Electron; and AI integration.
            </p>
            <h3>Where is he based?</h3>
            <p>
              El Mansoura (El Mansourah), Dakahlia Governorate, Egypt; available for remote
              work worldwide.
            </p>
            <h3>Is he available for hire?</h3>
            <p>
              Yes - freelance, remote, and full-time. Contact{' '}
              <a href="mailto:hello@temrevil.com">hello@temrevil.com</a>.
            </p>
          </section>

          <footer>
            <h2>Contact &amp; profiles</h2>
            <ul>
              <li>Website: <a href="https://temrevil.com">temrevil.com</a></li>
              <li>Email: <a href="mailto:hello@temrevil.com">hello@temrevil.com</a></li>
              <li>GitHub: <a href="https://github.com/TemRevil">github.com/TemRevil</a></li>
              <li>LinkedIn: <a href="https://linkedin.com/in/temrevil">linkedin.com/in/temrevil</a></li>
              <li>Instagram: <a href="https://instagram.com/temrevil">instagram.com/temrevil</a></li>
            </ul>
          </footer>
        </article>
      </noscript>
      <App />
    </>
  )
}
