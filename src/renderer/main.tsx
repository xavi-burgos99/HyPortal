import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/root.scss';
import './i18n';
import './icons/fontawesome';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container missing');
}

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
