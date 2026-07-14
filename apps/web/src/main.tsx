import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './theme';
import { ToastProvider } from './ui';
import { AuthProvider } from './auth';
import { useHashRoute } from './router';
import { Marketing } from './marketing';
import { AppShell } from './app';
import './styles.css';

function Root() {
  const [route] = useHashRoute();
  const isApp = route.segments[0] === 'app';
  return isApp ? <AppShell /> : <Marketing />;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <Root />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>
);
