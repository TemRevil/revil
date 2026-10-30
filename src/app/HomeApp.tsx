'use client'
import App from '../home/App'

// Prerendered: the build writes the hero and the section frame into index.html, and the
// browser hydrates it. Anything that needs the browser (its storage, the screen size,
// the address) is read just after hydration, before the first paint (see App's start).
export default function HomeApp() {
  return <App />
}
