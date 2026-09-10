import apiClient from './client';
import { ApiResponse, User } from '@/types';

export const profileApi = {
  getProfile: async (): Promise<ApiResponse<User>> => {
    const response = await apiClient.get<ApiResponse<User>>('/profile');
    return response.data;
  },

  updateProfile: async (data: { name?: string; email?: string }): Promise<ApiResponse<User>> => {
    const response = await apiClient.put<ApiResponse<User>>('/profile', data);
    return response.data;
  },

  updatePassword: async (data: { current_password: string; password: string; password_confirmation: string }): Promise<void> => {
    await apiClient.put('/profile/password', data);
  },

  deleteAccount: async (password: string): Promise<void> => {
    await apiClient.delete('/profile', { data: { password } });
  },
};
