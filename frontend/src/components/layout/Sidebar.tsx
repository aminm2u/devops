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
  ShoppingCart,
  Package,
  Truck,
  CreditCard,
  Building2,
  ClipboardList,
  MessageSquare,
  SlidersHorizontal,
  Shapes,
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
  adminOnly?: boolean;
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
    label: 'Finance & Procurement',
    items: [
      { name: 'Budget Control', href: '/budget', icon: DollarSign },
      { name: 'Requisitions', href: '/requisitions', icon: FileText },
      { name: 'Requisition Approve', href: '/requisitions/manage', icon: ClipboardCheck },
      { name: 'RFQ / Tendering', href: '/rfq', icon: MessageSquare },
      { name: 'Vendors', href: '/vendors', icon: Building2 },
      { name: 'Purchase Orders', href: '/purchase-orders', icon: ShoppingCart },
      { name: 'Direct Purchases', href: '/direct-purchases', icon: Package },
      { name: 'Goods Receipts', href: '/goods-receipts', icon: Truck },
      { name: 'Payments', href: '/payments', icon: CreditCard },
      { name: 'Assets', href: '/assets', icon: ClipboardList },
      { name: 'Internal Projects', href: '/internal-projects', icon: FolderKanban },
      { name: 'Procurement Settings', href: '/settings/procurement', icon: SlidersHorizontal, adminOnly: true },
    ],
  },
  {
    label: 'Helpdesk',
    items: [
      { name: 'Tickets', href: '/helpdesk', icon: Headphones },
      { name: 'Manage', href: '/helpdesk/manage', icon: Settings, adminOnly: true },
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
      { name: 'Users', href: '/admin/users', icon: Users, adminOnly: true },
      { name: 'Profile', href: '/profile', icon: User },
      { name: 'Settings', href: '/settings', icon: Settings },
    ],
  },
  {
    label: 'Developer',
    items: [{ name: 'Components', href: '/components', icon: Shapes }],
  },
];

/**
 * A nav item is active only when its href is the longest matching prefix of
 * the current path — so "/requisitions/manage" activates "Requisition Approve"
 * without also activating "Requisitions".
 */
function isNavActive(pathname: string, href: string, allHrefs: string[]): boolean {
  const isPrefix = (candidate: string) =>
    candidate === '/'
      ? pathname === '/'
      : pathname === candidate || pathname.startsWith(candidate + '/');
  if (!isPrefix(href)) return false;
  return !allHrefs.some(
    (other) => other !== href && other.length > href.length && isPrefix(other)
  );
}

export function Sidebar({ isCollapsed }: SidebarProps) {
  const location = useLocation();
  const { user } = useAuth();
  const { effectiveTheme } = useTheme();
  const isAdmin = user?.roles?.some((r: any) => ['super-admin', 'devops-admin'].includes(r.name));
  const logo = effectiveTheme === 'dark' ? mwpLogoWhite : mwpLogoBlack;
  const allHrefs = navigation.flatMap((g) => g.items.map((i) => i.href));

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
                  if (item.adminOnly && !isAdmin) return false;
                  return true;
                })
                .map((item) => {
                  const isActive = isNavActive(location.pathname, item.href, allHrefs);
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
