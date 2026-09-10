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
    hasRole,
    hasPermission,
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
    hasRole,
    hasPermission,
  };
}
