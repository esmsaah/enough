import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/landing-fonts.css'; // self-hosted Archivo + IBM Plex Mono, loaded app-wide
import './styles/tokens.css';
import './styles/base.css';
import './styles/board.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
