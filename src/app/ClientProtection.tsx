'use client'
import { useEffect } from 'react'

export default function ClientProtection() {
  useEffect(() => {
    const wipeMaliciousStyles = () => {
      if (document.body.style.backgroundColor === 'yellow') {
        document.body.style.removeProperty('background-color');
      }
      if (document.body.style.transform === 'rotate(180deg)' || document.body.style.transform.includes('rotate(180deg)')) {
        document.body.style.removeProperty('transform');
      }
      
      document.querySelectorAll('style').forEach(style => {
        const text = style.textContent?.toLowerCase() || '';
        if (text.includes('animation: rot 20s linear infinite') || text.includes('animation: rot 20s')) {
          style.remove();
          console.warn('Blocked malicious style tag injection!');
        }
      });
    };

    wipeMaliciousStyles();

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

    return () => observer.disconnect();
  }, []);

  return null;
}
