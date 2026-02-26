import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi, getTokens, clearTokens } from '../api';
import { ProfileUpdateDto, ChangeEmailDto, ConfirmChangeEmailDto, ChangePasswordDto, ConfirmChangePasswordDto } from '../api/user.types';
import { useAuth } from '../context/AuthContext';

// ─── Query keys ───────────────────────────────────────────────────────────────

export const userQueryKeys = {
  me: ['user', 'me'] as const,
};

// ─── useMe ────────────────────────────────────────────────────────────────────

export const useMe = () => {
  return useQuery({
    queryKey: userQueryKeys.me,
    queryFn: userApi.me,
    staleTime: 1000 * 60 * 5,
    retry: (failureCount, error: any) => {
      if (error?.response?.status === 401) return false;
      return failureCount < 2;
    },
  });
};

// ─── useRefreshToken ──────────────────────────────────────────────────────────

export const useRefreshToken = () => {
  return useMutation({
    mutationFn: async () => {
      const tokens = await getTokens();
      if (!tokens?.refreshToken) throw new Error('No refresh token stored');
      return userApi.refresh(tokens.refreshToken);
    },
  });
};

// ─── useLogout ────────────────────────────────────────────────────────────────

export const useLogout = () => {
  const queryClient = useQueryClient();
  const { signOut } = useAuth();

  return useMutation({
    mutationFn: async () => {
      const tokens = await getTokens();
      if (tokens?.refreshToken) {
        try {
          await userApi.logout(tokens.refreshToken);
        } catch (err) {
          console.warn('[useLogout] Server revocation failed:', err);
        }
      }
      // signOut clears tokens + sets authState → unauthenticated
      // RootNavigator reacts and switches to LoginScreen automatically
      await signOut();
    },
    onSuccess: () => {
      queryClient.clear();
    },
  });
};

// ─── useUpdateProfile ─────────────────────────────────────────────────────────

export const useUpdateProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: ProfileUpdateDto) => userApi.updateProfile(dto),
    onSuccess: () => {
      // Refetch fresh user data after update
      queryClient.invalidateQueries({ queryKey: userQueryKeys.me });
    },
  });
};

// ─── useUploadAvatar ──────────────────────────────────────────────────────────

export const useUploadAvatar = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: { uri: string; name: string; type: string }) =>
      userApi.uploadAvatar(file),
    onSuccess: (data) => {
      // Update the cached user directly — no extra network request needed
      queryClient.setQueryData(userQueryKeys.me, (old: any) => {
        if (!old) return old;
        return { ...old, avatarUrl: data.avatarUrl };
      });
    },
  });
};

// ─── useChangeEmail ───────────────────────────────────────────────────────────

export const useChangeEmail = () => {
  return useMutation({
    mutationFn: (dto: ChangeEmailDto) => userApi.changeEmail(dto),
  });
};

export const useConfirmChangeEmail = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: ConfirmChangeEmailDto) => userApi.confirmChangeEmail(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userQueryKeys.me });
    },
  });
};

// ─── useChangePassword ────────────────────────────────────────────────────────

export const useChangePassword = () => {
  return useMutation({
    mutationFn: (dto: ChangePasswordDto) => userApi.changePassword(dto),
  });
};

export const useConfirmChangePassword = () => {
  return useMutation({
    mutationFn: (dto: ConfirmChangePasswordDto) => userApi.confirmChangePassword(dto),
  });
};