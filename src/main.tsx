import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'
import './lib/firebase'
import App from './App.tsx'

const wipeMaliciousStyles = () => {
  if (document.body.style.backgroundColor === 'yellow') {
    document.body.style.removeProperty('background-color');
  }
  if (document.body.style.transform === 'rotate(180deg)' || document.body.style.transform.includes('rotate(180deg)')) {
    document.body.style.removeProperty('transform');
  }
  
  document.querySelectorAll('style').forEach(style => {
    const text = style.textContent?.toLowerCase() || '';
    // Look for EXACT malicious injection signatures, NOT partial words that match valid CSS like "rotate"
    if (text.includes('animation: rot 20s linear infinite') || text.includes('animation: rot 20s')) {
      style.remove();
      console.warn('Blocked malicious style tag injection!');
    }
  });
};

// Run immediately on load
wipeMaliciousStyles();

// Active interceptor to aggressively prevent any external scripts/extensions 
// from injecting malicious CSS (yellow backgrounds, spinning body, or rogue style tags).
const observer = new MutationObserver((mutations) => {
  wipeMaliciousStyles();
  
  mutations.forEach(mutation => {
    mutation.addedNodes.forEach(node => {
      if (node.nodeName?.toLowerCase() === 'style') {
        const text = node.textContent?.toLowerCase() || '';
        if (text.includes('animation: rot 20s linear infinite') || text.includes('animation: rot 20s')) {
          node.parentNode?.removeChild(node);
          console.warn('Blocked malicious style tag injection in real-time!');
        }
      }
    });
  });
});

observer.observe(document.documentElement, { 
  attributes: true, 
  attributeFilter: ['style'], 
  childList: true, 
  subtree: true 
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
