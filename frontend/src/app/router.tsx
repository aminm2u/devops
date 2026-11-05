import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppLayout } from '@/components/layout/AppLayout';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { PermissionRoute, ProtectedRoute, PublicRoute, SuperAdminRoute } from '@/app/guards';
import { AUTH_ROUTES, APP_ROUTES, LEGACY_REDIRECTS, type AppRoute } from '@/app/routes.config';

/**
 * Router.
 *
 * The route table lives in `routes.config.tsx` because the sidebar reads the
 * same entries. This file only decides *how* each entry is guarded, so a page
 * cannot be added to navigation without also being guarded, and the guard and
 * the nav label can never drift apart.
 */
function guard(route: AppRoute): ReactNode {
  const { meta, element } = route;

  // Super admin is a protected system role, not a permission — it is the one
  // thing that genuinely cannot be expressed in the grant matrix.
  if (meta.superAdminOnly) return <SuperAdminRoute>{element}</SuperAdminRoute>;
  if (meta.permission) return <PermissionRoute permission={meta.permission}>{element}</PermissionRoute>;
  if (meta.anyOf?.length) return <PermissionRoute anyOf={meta.anyOf}>{element}</PermissionRoute>;
  return element;
}

export function AppRouter() {
  return (
    <TooltipProvider>
      <Routes>
        {AUTH_ROUTES.map((route) => (
          <Route
            key={route.path}
            path={route.path}
            element={
              <PublicRoute>
                <AuthLayout />
              </PublicRoute>
            }
          >
            <Route index element={route.element} />
          </Route>
        ))}

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          {APP_ROUTES.map((route) => (
            <Route
              key={route.path || 'index'}
              index={route.path === ''}
              path={route.path === '' ? undefined : route.path}
              element={guard(route)}
            />
          ))}

          {/* Old addresses keep working — a bookmark or an old notification
              link should land on the page it named, not on the dashboard. */}
          {LEGACY_REDIRECTS.map((redirect) => (
            <Route
              key={redirect.from}
              path={redirect.from}
              element={<Navigate to={redirect.to} replace />}
            />
          ))}

          {/* Legacy paths that carry an id need it carried across. */}
          <Route path="rfq/:id" element={<PrefixedRedirect to="/procurement/rfq" />} />
          <Route
            path="purchase-orders/:id"
            element={<PrefixedRedirect to="/procurement/purchase-orders" />}
          />
          <Route path="admin/users/:id" element={<PrefixedRedirect to="/hr/users" />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </TooltipProvider>
  );
}

/** Redirects to `to/:id`, preserving the id from the old address. */
function PrefixedRedirect({ to }: { to: string }) {
  const { id } = useParams();
  return <Navigate to={id ? `${to}/${id}` : to} replace />;
}
