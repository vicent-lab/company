import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type ThemeName = 'light' | 'dark' | 'contrast';

interface ThemeCtx {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
}

const Ctx = createContext<ThemeCtx>({ theme: 'light', setTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('dairy-theme') : null;
    return (saved as ThemeName) || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('dairy-theme', theme);
  }, [theme]);

  return <Ctx.Provider value={{ theme, setTheme: setThemeState }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
