import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadTheme } from './theme';
import './styles.css';

// 첫 화면부터 저장된 테마로 그린다
document.documentElement.dataset.theme = loadTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
