import { create } from 'zustand';
import { authApi } from '@/api/auth';
import { User } from '@/types';
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
  hasPermission: (name: string) => boolean;
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

  hasRole: (name: string) => {
    const { user } = get();
    if (!user || !user.roles) return false;
    return user.roles.some((role) =>
      typeof role === 'string' ? role === name : role.name === name
    );
  },

  hasPermission: (name: string) => {
    const { user } = get();
    if (!user || !user.permissions) return false;
    return user.permissions.some((permission) =>
      typeof permission === 'string' ? permission === name : permission.name === name
    );
  },

  setUser: (user: User | null) => set({ user }),
  setToken: (token: string | null) => set({ token }),
}));
