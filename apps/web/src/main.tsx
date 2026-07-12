import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

// Self-hosted fonts (DESIGN.md §2). Same-origin → satisfies CSP `font-src 'self'`
// and keeps the app fully offline. Import only latin + latin-ext subsets (Polish
// diacritics live in latin-ext); skips Rajdhani's Devanagari from the bundle.
import '@fontsource/rajdhani/latin-400.css';
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import '@fontsource/rajdhani/latin-ext-400.css';
import '@fontsource/rajdhani/latin-ext-500.css';
import '@fontsource/rajdhani/latin-ext-600.css';
import '@fontsource/rajdhani/latin-ext-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-700.css';

import App from './App';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
