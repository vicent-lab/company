import { useEffect, useState } from 'react';

export interface Route {
  segments: string[];
  param?: string;
}

function parse(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  const parts = clean.split('/').filter(Boolean);
  if (parts.length === 0) return { segments: ['landing'] };
  // Public-facing animal URLs use the database UUID. Internally they render through
  // the existing authenticated app shell, so direct refreshes keep the same security
  // and selected-farm context as navigation from the Animals list.
  if (parts[0] === 'animals') {
    return parts[1] ? { segments: ['app', 'cow'], param: parts[1] } : { segments: ['app', 'cows'] };
  }
  if (parts[0] === 'app' && parts.length >= 2) {
    const sub = parts[1];
    if ((sub === 'cow' || sub === 'gallery') && parts[2]) {
      return { segments: ['app', sub], param: parts[2] };
    }
    return { segments: ['app', sub] };
  }
  return { segments: parts };
}

export function useHashRoute(): [Route, (path: string) => void] {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onChange);
    if (!window.location.hash) window.location.hash = '#/';
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = (path: string) => {
    window.location.hash = path.startsWith('#') ? path : '#' + path;
  };
  return [route, navigate];
}
