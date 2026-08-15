import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './theme';
import { ToastProvider } from './ui';
import { AuthProvider } from './auth';
import { useHashRoute } from './router';
import { Marketing } from './marketing';
import { AppShell } from './app';
import { ResetPasswordPage } from './pages/auth-flows';
import { GetStarted, SignUp } from './pages/signup';
import { OAuthCallback } from './auth';
import './styles.css';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

function Root() {
  const [route] = useHashRoute();
  // router.ts only parses path segments, so a query string (?token=...) rides along on
  // the first segment — strip it off before matching the route name.
  const base = (route.segments[0] || '').split('?')[0];
  if (base === 'reset-password') return <ResetPasswordPage />;
  if (base === 'get-started') return <GetStarted />;
  if (base === 'signup') return <SignUp />;
  if (base === 'oauth-callback') return <OAuthCallback />;
  if (base === 'app') return <AppShell />;
  return <Marketing />;
}

import { PlanProvider } from './plans';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <PlanProvider>
            <Root />
          </PlanProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>
);
