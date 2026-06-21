import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import App from '@/App';
import { runEnboxPromise, runEnboxSync } from '@/enbox/effect/runtime';
import { localStorageGetEffect, registerServiceWorkerEffect } from '@/lib/browser-effects';
import '@/app.css';

// Apply theme from localStorage before first paint to avoid flash
const savedTheme = runEnboxSync(localStorageGetEffect('enbox:theme'));
if (savedTheme === 'light') {
  document.documentElement.setAttribute('data-theme', 'light');
}

// Apply product theme from build-time env var
const productTheme = import.meta.env.VITE_PRODUCT_THEME;
if (productTheme) {
  document.documentElement.setAttribute('data-product', productTheme);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

// Register service worker
window.addEventListener('load', () => {
  runEnboxPromise(
    registerServiceWorkerEffect('/sw.js', { type: 'module' }),
  ).catch((error: unknown) => {
    console.warn('Service worker registration failed:', error);
  });
});
