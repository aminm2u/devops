import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Menu,
  Search,
  Moon,
  Sun,
  LogOut,
  User,
  Settings,
} from 'lucide-react';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

interface TopNavProps {
  onMobileMenuToggle: () => void;
}

const getPageTitle = (pathname: string): string => {
  if (pathname === '/') return 'Dashboard';
  if (pathname.startsWith('/projects')) return 'Projects';
  if (pathname.startsWith('/infrastructure')) return 'Infrastructure';
  if (pathname.startsWith('/settings')) return 'Settings';
  if (pathname.startsWith('/profile')) return 'Profile';
  if (pathname.startsWith('/budget')) return 'Budget Control';
  if (pathname === '/requisitions/manage') return 'Requisition Management';
  if (pathname.startsWith('/requisitions')) return 'Requisition Form';
  if (pathname === '/helpdesk/manage') return 'Helpdesk Management';
  if (pathname === '/helpdesk/reports') return 'Helpdesk Reports';
  if (pathname.startsWith('/helpdesk/')) return 'Ticket Details';
  if (pathname.startsWith('/helpdesk')) return 'Helpdesk';
  return 'DevOps Central';
};

export function TopNav({ onMobileMenuToggle }: TopNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { effectiveTheme, toggleTheme } = useTheme();

  const pageTitle = getPageTitle(location.pathname);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const userInitials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-card px-4 lg:px-6">
      {/* Mobile Menu Toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMobileMenuToggle}
        aria-label="Toggle menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Page Title */}
      <h1 className="text-lg font-semibold">{pageTitle}</h1>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search */}
      <div className="relative hidden md:block">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search..."
          className="w-64 pl-8"
        />
      </div>

      {/* Notification Bell */}
      <NotificationBell />

      {/* Theme Toggle */}
      <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
        {effectiveTheme === 'dark' ? (
          <Sun className="h-5 w-5" />
        ) : (
          <Moon className="h-5 w-5" />
        )}
      </Button>

      {/* User Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-8 w-8 rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarImage src={undefined} alt={user?.name} />
              <AvatarFallback>{userInitials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{user?.name}</p>
              <p className="text-xs leading-none text-muted-foreground">
                {user?.email}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate('/profile')}>
            <User className="mr-2 h-4 w-4" />
            <span>Profile</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/settings')}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
