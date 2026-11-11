import { Outlet, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Headphones } from 'lucide-react';
import apiClient from '@/api/client';

interface Branding {
  name: string;
  logoUrl: string;
}

/**
 * Standalone shell for the public portal — no AppLayout, no sidebar, and no
 * `useSocket()`: socket.io requires a staff JWT, and an anonymous connect
 * attempt would 401-loop. The portal is deliberately quiet and stateless.
 *
 * Company branding comes from the public GET /api/branding endpoint; when
 * nothing is configured the built-in icon and "Support Portal" title remain,
 * so an unbranded portal never looks broken.
 */
export function PortalLayout() {
  const { data: branding } = useQuery({
    queryKey: ['public-branding'],
    queryFn: async () => {
      const res = await apiClient.get('/branding');
      return res.data.data as Branding;
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          {branding?.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={branding.name || 'Company logo'}
              className="h-8 w-auto max-w-[160px] object-contain"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Headphones className="h-4 w-4 text-primary" />
            </div>
          )}
          <Link to="/portal" className="text-lg font-semibold">
            {branding?.name || 'Support Portal'}
          </Link>
          <nav className="ml-auto flex items-center gap-4 text-sm">
            <Link to="/portal" className="text-muted-foreground transition-colors hover:text-foreground">
              Submit a ticket
            </Link>
            <Link to="/portal/track" className="text-muted-foreground transition-colors hover:text-foreground">
              Track tickets
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t py-4">
        <p className="mx-auto max-w-5xl px-4 text-xs text-muted-foreground">
          {branding?.name && `© ${new Date().getFullYear()} ${branding.name}. `}
          Support requests submitted here go directly to our team. Keep your ticket number to follow up.
        </p>
      </footer>
    </div>
  );
}
