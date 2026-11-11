import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import toast from '@/lib/toast';

const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Portal pages opt out of app auth entirely: attaching the staff token
    // would leak it to endpoints that must never see it, and the 401 →
    // `/login` redirect below would bounce anonymous visitors out of the
    // portal on any auth hiccup.
    const extended = config as InternalAxiosRequestConfig & { skipAuthRedirect?: boolean };
    const token = localStorage.getItem('token');
    if (token && config.headers && !extended.skipAuthRedirect) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string }>) => {
    const config = error.config as InternalAxiosRequestConfig & {
      suppressErrorToast?: boolean;
      skipAuthRedirect?: boolean;
    };
    // Portal and other opt-out callers handle their own errors.
    if (config?.suppressErrorToast) {
      return Promise.reject(error);
    }

    if (!error.response) {
      toast.error('Network error. Please check your connection.');
      return Promise.reject(error);
    }

    if (error.response.status === 401) {
      // An opted-out caller (public page) must never be dragged to /login.
      if (!config?.skipAuthRedirect) {
        localStorage.removeItem('token');
        if (window.location.pathname !== '/login') {
          toast.error('Session expired. Please log in again.');
          window.location.href = '/login';
        }
      }
    } else if (error.response.status === 403) {
      toast.error('You do not have permission to perform this action.');
    } else if (error.response.status === 404) {
      toast.error('Resource not found.');
    } else if (error.response.status >= 500) {
      toast.error('Server error. Please try again later.');
    }
    return Promise.reject(error);
  }
);

export default apiClient;
