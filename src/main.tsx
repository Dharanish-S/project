import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

window.onerror = function(message, source, lineno, colno, error) {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="padding: 20px; color: red; font-family: sans-serif;">
        <h1>App Crash Detected</h1>
        <p>${message}</p>
        <pre>${error?.stack || ''}</pre>
        <button onclick="location.reload()" style="padding: 10px; background: #4f46e5; color: white; border: none; border-radius: 5px;">Reload App</button>
        <button onclick="if(window.caches) caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key)))); localStorage.clear(); sessionStorage.clear(); location.reload();" style="padding: 10px; background: #ef4444; color: white; border: none; border-radius: 5px; margin-left: 10px;">Clear Data & Reload</button>
      </div>
    `;
  }
  return false;
};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(
      (registration) => {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
        registration.onupdatefound = () => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  console.log('New content is available; please refresh.');
                } else {
                  console.log('Content is cached for offline use.');
                }
              }
            };
          }
        };
      },
      (err) => {
        console.error('ServiceWorker registration failed: ', err);
      }
    );
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
