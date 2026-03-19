import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

console.log("⚛️ React app starting...");

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error("❌ Root element not found!");
} else {
  console.log("✅ Root element found, rendering...");
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
