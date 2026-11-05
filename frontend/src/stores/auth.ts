import { create } from 'zustand';
import { authApi } from '@/api/auth';
import { User } from '@/types';
import { can, hasAnyRole, hasRole, isSuperAdmin, scopeOf } from '@/lib/roles';
import { disconnectSocket } from '@/hooks/useSocket';
import toast from 'react-hot-toast';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  hasRole: (name: string) => boolean;
  hasAnyRole: (names: string[]) => boolean;
  hasPermission: (name: string) => boolean;
  /** Scope-aware capability check against the resolved access payload. */
  can: (permission: string, scope?: 'self' | 'team' | 'department' | 'all') => boolean;
  scopeOf: (permission: string) => 'self' | 'team' | 'department' | 'all' | null;
  isSuperAdmin: () => boolean;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem('token'),
  isLoading: false,
  isAuthenticated: !!localStorage.getItem('token'),

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const response = await authApi.login({ email, password });
      const { user, accessToken } = response.data;
      localStorage.setItem('token', accessToken);
      set({ user, token: accessToken, isAuthenticated: true, isLoading: false });
      toast.success('Welcome back!');
    } catch (error: any) {
      set({ isLoading: false });
      const message = error?.response?.data?.message || error?.response?.data?.error || 'Login failed';
      toast.error(message);
      throw error;
    }
  },

  register: async (name: string, email: string, password: string) => {
    set({ isLoading: true });
    try {
      const response = await authApi.register({
        name,
        email,
        password,
        password_confirmation: password,
      });
      const { user, accessToken } = response.data;
      localStorage.setItem('token', accessToken);
      set({ user, token: accessToken, isAuthenticated: true, isLoading: false });
      toast.success('Account created successfully!');
    } catch (error: unknown) {
      set({ isLoading: false });
      const axiosError = error as { response?: { data?: { message?: string } } };
      const message = axiosError.response?.data?.message || 'Registration failed';
      toast.error(message);
      throw error;
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // Logout even if API call fails
    } finally {
      localStorage.removeItem('token');
      // The socket is authenticated with the old token's identity; leaving it
      // open would keep a room membership for a session that no longer exists.
      disconnectSocket();
      set({ user: null, token: null, isAuthenticated: false });
      toast.success('Logged out successfully');
    }
  },

  fetchUser: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ isAuthenticated: false, user: null });
      return;
    }

    set({ isLoading: true });
    try {
      const response = await authApi.getMe();
      set({ user: response.data, isAuthenticated: true, isLoading: false });
    } catch {
      localStorage.removeItem('token');
      set({ user: null, token: null, isAuthenticated: false, isLoading: false });
    }
  },

  hasRole: (name: string) => hasRole(get().user, name),
  hasAnyRole: (names: string[]) => hasAnyRole(get().user, names),
  hasPermission: (name: string) => can(get().user, name),
  can: (permission, scope = 'self') => can(get().user, permission, scope),
  scopeOf: (permission) => scopeOf(get().user, permission),
  isSuperAdmin: () => isSuperAdmin(get().user),

  setUser: (user: User | null) => set({ user }),
  setToken: (token: string | null) => set({ token }),
}));
