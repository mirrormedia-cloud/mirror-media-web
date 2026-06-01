import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './context/ThemeContext';
import { OTTProvider } from './context/OTTContext';
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <OTTProvider>
        <App />
        <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
      </OTTProvider>
    </ThemeProvider>
  </StrictMode>,
);
