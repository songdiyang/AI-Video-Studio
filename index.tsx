import React from 'react';
import ReactDOM from 'react-dom/client';
import { HeroUIProvider } from "@heroui/react";
import './index.css';
import App from './App';
import { ToastProvider } from './contexts/ToastContext';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { NotificationProvider } from './contexts/NotificationContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <HeroUIProvider>
          <ToastProvider>
            <NotificationProvider>
              <ConfirmProvider>
                <App />
              </ConfirmProvider>
            </NotificationProvider>
          </ToastProvider>
        </HeroUIProvider>
      </LanguageProvider>
    </ThemeProvider>
  </React.StrictMode>
);
