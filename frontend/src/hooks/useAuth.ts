import { useAuthStore } from '@/stores/auth';

export function useAuth() {
  const {
    user,
    token,
    isLoading,
    isAuthenticated,
    login,
    register,
    logout,
    fetchUser,
    setUser,
    hasRole,
    hasAnyRole,
    hasPermission,
    can,
    scopeOf,
    isSuperAdmin,
  } = useAuthStore();

  return {
    user,
    token,
    isLoading,
    isAuthenticated,
    login,
    register,
    logout,
    fetchUser,
    setUser,
    hasRole,
    hasAnyRole,
    hasPermission,
    can,
    scopeOf,
    isSuperAdmin: isSuperAdmin(),
  };
}
