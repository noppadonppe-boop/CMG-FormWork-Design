import React from 'react';
import {AccountLoadError, LoadingScreen, LoginPage, PendingApprovalPage, ProtectedRoute, RegisterPage, useAuth, usePathname} from './auth';

export function AppRouter({children}: React.PropsWithChildren) {
  const path = usePathname();
  const {loading, authError} = useAuth();
  if (loading) return <LoadingScreen/>;
  if (authError) return <AccountLoadError/>;
  // LoginPage owns the redirect effect. It must mount even when a signed-in
  // user's profile is ready, otherwise /login can remain on a spinner forever.
  if (path === '/login') return <LoginPage/>;
  if (path === '/register') return <RegisterPage/>;
  if (path === '/pending') return <PendingApprovalPage/>;
  return <ProtectedRoute requireRoles={path === '/admin' ? ['MasterAdmin', 'SuperAdmin', 'Admin'] : undefined}>{children}</ProtectedRoute>;
}
