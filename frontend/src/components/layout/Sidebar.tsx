import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderKanban,
  Settings,
  User,
  Server,
  AlertTriangle,
  Rocket,
  Activity,
  Users,
  BarChart3,
  Shield,
  Globe,
  Bell,
  DollarSign,
  FileText,
  ClipboardCheck,
  Headphones,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import mwpLogoWhite from '@/assets/mwp_logo_white.png';
import mwpLogoBlack from '@/assets/mwp_logo_black.png';

interface SidebarProps {
  isCollapsed: boolean;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navigation: NavGroup[] = [
  {
    label: 'Main',
    items: [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Projects & Assets',
    items: [
      { name: 'Projects', href: '/projects', icon: FolderKanban },
      { name: 'Infrastructure', href: '/infrastructure', icon: Server },
      { name: 'Deployments', href: '/deployments', icon: Rocket },
    ],
  },
  {
    label: 'Network & Security',
    items: [
      { name: 'SSL Certificates', href: '/ssl', icon: Shield },
      { name: 'Domains', href: '/domains', icon: Globe },
    ],
  },
  {
    label: 'Finance',
    items: [
      { name: 'Budget Control', href: '/budget', icon: DollarSign },
      { name: 'Requisitions', href: '/requisitions', icon: FileText },
      { name: 'Requisition Manage', href: '/requisitions/manage', icon: ClipboardCheck },
    ],
  },
  {
    label: 'Helpdesk',
    items: [
      { name: 'Tickets', href: '/helpdesk', icon: Headphones },
      { name: 'Manage', href: '/helpdesk/manage', icon: Settings },
      { name: 'Reports', href: '/helpdesk/reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Operations',
    items: [
      { name: 'Incidents', href: '/incidents', icon: AlertTriangle },
      { name: 'Grafana', href: '/grafana', icon: BarChart3 },
      { name: 'Activity Log', href: '/activity-log', icon: Activity },
    ],
  },
  {
    label: 'Account',
    items: [
      { name: 'Notifications', href: '/notifications', icon: Bell },
      { name: 'Users', href: '/admin/users', icon: Users },
      { name: 'Profile', href: '/profile', icon: User },
      { name: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

export function Sidebar({ isCollapsed }: SidebarProps) {
  const location = useLocation();
  const { user } = useAuth();
  const { effectiveTheme } = useTheme();
  const isAdmin = user?.roles?.some((r: any) => ['super-admin', 'devops-admin'].includes(r.name));
  const logo = effectiveTheme === 'dark' ? mwpLogoWhite : mwpLogoBlack;

  return (
    <aside
      className={cn(
        'relative flex flex-col bg-secondary transition-all duration-300',
        isCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo — same height as navbar */}
      <div className="flex h-14 mt-2 shrink-0 items-center border-b border-border/40 justify-center">
        {!isCollapsed ? (
          <img
            src={logo}
            alt="MyWorkPortal2.0"
            className="h-12 w-auto object-contain px-12"
          />
        ) : (
          <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-[11px] p-4">
            MWP
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-none">
        {navigation.map((group, gi) => (
          <div key={group.label} className={cn(gi > 0 && 'mt-4')}>
            {!isCollapsed && (
              <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                {group.label}
              </div>
            )}
            {isCollapsed && gi > 0 && (
              <div className="mx-3 my-2 border-t border-border/40" />
            )}
            <div className="space-y-0.5">
              {group.items
                .filter((item) => {
                  if ((item.name === 'Manage' || item.name === 'Users') && !isAdmin) return false;
                  return true;
                })
                .map((item) => {
                  const isActive = location.pathname === item.href ||
                    (item.href !== '/' && location.pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-[7px] text-[13px] font-medium transition-colors',
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                        isCollapsed && 'justify-center px-2'
                      )}
                      title={isCollapsed ? item.name : undefined}
                    >
                      <item.icon className="h-[18px] w-[18px] shrink-0" />
                      {!isCollapsed && <span>{item.name}</span>}
                    </Link>
                  );
                })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
