import React from 'react';
import { Outlet } from 'react-router-dom';
import { Server } from 'lucide-react';

export function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
      <div className="w-full max-w-md">
        {/* Logo and Tagline */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Server className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold">DevOps Central</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your unified platform for DevOps management
          </p>
        </div>

        {/* Auth Form Card */}
        <div className="rounded-xl border bg-card p-6 shadow-lg">
          <Outlet />
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Secure, scalable, and built for modern teams.
        </p>
      </div>
    </div>
  );
}
