import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import mwpLogoWhite from '@/assets/mwp_logo_white.png';
import mwpLogoBlack from '@/assets/mwp_logo_black.png';

export function AuthLayout() {
  const { theme, setTheme, effectiveTheme } = useTheme();
  const logo = effectiveTheme === 'dark' ? mwpLogoWhite : mwpLogoBlack;

  const cycleTheme = () => {
    if (theme === 'dark') setTheme('light');
    else if (theme === 'light') setTheme('system');
    else setTheme('dark');
  };

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
      <div className="w-full max-w-md">
        {/* Logo and Tagline */}
        <div className="mb-8 text-center">
          <img src={logo} alt="MyWorkPortal2.0" className="mx-auto mb-4 h-14 w-auto" />
          <p className="mt-2 text-sm text-muted-foreground">
            Your unified platform for work and project management
          </p>
        </div>

        {/* Auth Form Card */}
        <div className="rounded-xl bg-card p-6 shadow-lg">
          <Outlet />
        </div>

        {/* Footer with theme toggle */}
        <div className="mt-6 flex items-center justify-center gap-3">
          <p className="text-xs text-muted-foreground">
            Secure, scalable, and built for modern teams.
          </p>
          <button
            onClick={cycleTheme}
            className="rounded-lg bg-card p-1.5 text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
            title={`Theme: ${theme}`}
          >
            <ThemeIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
