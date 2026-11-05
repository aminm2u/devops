import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { NotificationProvider } from '@/shared/notifications/NotificationProvider';

/**
 * Authenticated shell.
 *
 * `NotificationProvider` sits here rather than in `main.tsx` because it needs
 * a signed-in session: it opens the socket and reads the caller's notification
 * preferences. Mounting it above the router would have it connecting during
 * the splash screen and on the login page.
 */
export function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <NotificationProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Desktop Sidebar */}
        <div className="hidden lg:flex">
          <Sidebar isCollapsed={sidebarCollapsed} />
        </div>

        {/* Mobile Sidebar Overlay */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="fixed inset-0 bg-black/50"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="fixed inset-y-0 left-0 z-50 w-64">
              <Sidebar isCollapsed={false} />
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopNav
            onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
            isSidebarCollapsed={sidebarCollapsed}
            onSidebarToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
          <main className="flex-1 overflow-y-auto px-5 py-4 lg:px-8 lg:py-5">
            <Outlet />
          </main>
        </div>
      </div>
    </NotificationProvider>
  );
}
