import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppLayout } from '@/components/layout/AppLayout';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { ProjectDetailPage } from '@/pages/ProjectDetailPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { InfrastructurePage } from '@/pages/InfrastructurePage';
import { SettingsPage } from '@/pages/SettingsPage';
import { IncidentsPage } from '@/pages/IncidentsPage';
import { DeploymentsPage } from '@/pages/DeploymentsPage';
import { ActivityLogPage } from '@/pages/ActivityLogPage';
import { UsersPage } from '@/pages/UsersPage';
import { GrafanaPage } from '@/pages/GrafanaPage';
import { SslCertificatesPage } from '@/pages/SslCertificatesPage';
import { DomainsPage } from '@/pages/DomainsPage';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { BudgetPage } from '@/pages/BudgetPage';
import { RequisitionsPage } from '@/pages/RequisitionsPage';
import { RequisitionManagePage } from '@/pages/RequisitionManagePage';
import { HelpdeskPage } from '@/pages/HelpdeskPage';
import { HelpdeskTicketDetailPage } from '@/pages/HelpdeskTicketDetailPage';
import { HelpdeskReportPage } from '@/pages/HelpdeskReportPage';
import { HelpdeskManagePage } from '@/pages/HelpdeskManagePage';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const isAdmin = user?.roles?.some((r: any) => ['super-admin', 'devops-admin'].includes(r.name));

  if (!isAdmin) {
    return <Navigate to="/helpdesk" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function App() {
  const { fetchUser, token } = useAuth();
  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        await fetchUser();
      }
      setInitialLoad(false);
    };
    initAuth();
  }, []);

  if (initialLoad) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <TooltipProvider>
    <Routes>
      {/* Auth Routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <AuthLayout />
          </PublicRoute>
        }
      >
        <Route index element={<LoginPage />} />
      </Route>
      <Route
        path="/register"
        element={
          <PublicRoute>
            <AuthLayout />
          </PublicRoute>
        }
      >
        <Route index element={<RegisterPage />} />
      </Route>

      {/* Protected Routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="infrastructure" element={<InfrastructurePage />} />
        <Route path="ssl" element={<SslCertificatesPage />} />
        <Route path="domains" element={<DomainsPage />} />
        <Route path="budget" element={<BudgetPage />} />
        <Route path="requisitions" element={<RequisitionsPage />} />
        <Route path="requisitions/manage" element={<RequisitionManagePage />} />
        <Route path="helpdesk" element={<HelpdeskPage />} />
        <Route path="helpdesk/manage" element={<AdminRoute><HelpdeskManagePage /></AdminRoute>} />
        <Route path="helpdesk/reports" element={<HelpdeskReportPage />} />
        <Route path="helpdesk/:id" element={<HelpdeskTicketDetailPage />} />
        <Route path="incidents" element={<IncidentsPage />} />
        <Route path="deployments" element={<DeploymentsPage />} />
        <Route path="activity-log" element={<ActivityLogPage />} />
        <Route path="admin/users" element={<UsersPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="grafana" element={<GrafanaPage />} />
      </Route>

      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </TooltipProvider>
  );
}

export default App;
