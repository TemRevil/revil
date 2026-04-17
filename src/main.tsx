import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'
import './lib/firebase'
import App from './App.tsx'

// Active interceptor to aggressively prevent any external scripts/extensions 
// from injecting yellow backgrounds and rotation inline onto the body tag.
const observer = new MutationObserver(() => {
  if (document.body.style.backgroundColor === 'yellow') {
    document.body.style.removeProperty('background-color');
  }
  if (document.body.style.transform === 'rotate(180deg)' || document.body.style.transform.includes('rotate(180deg)')) {
    document.body.style.removeProperty('transform');
  }
});
observer.observe(document.body, { attributes: true, attributeFilter: ['style'] });

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
