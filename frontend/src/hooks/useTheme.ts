import { useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'system';

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  let effectiveTheme: 'light' | 'dark';

  if (theme === 'system') {
    effectiveTheme = getSystemTheme();
  } else {
    effectiveTheme = theme;
  }

  root.classList.remove('light', 'dark');
  root.classList.add(effectiveTheme);
}

// Apply theme synchronously before first render so LoadingScreen picks it up
const initialTheme = (localStorage.getItem('theme') as Theme) || 'system';
applyTheme(initialTheme);

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => {
      if (prev === 'dark') return 'light';
      if (prev === 'light') return 'dark';
      return getSystemTheme() === 'dark' ? 'light' : 'dark';
    });
  }, []);

  const effectiveTheme = theme === 'system' ? getSystemTheme() : theme;

  return { theme, setTheme, toggleTheme, effectiveTheme };
}
