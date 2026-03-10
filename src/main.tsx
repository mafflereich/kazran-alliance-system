import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@app/App';
import './index.css';
import '@shared/i18n';
import { initGA } from '@/analytics';

initGA();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);