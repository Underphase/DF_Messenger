export interface UserMe {
  id: number;
  email: string;
  nickName: string;
  username: string;
  description: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  createdAt: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LogoutResponse {
  success: boolean;
}

export interface ProfileUpdateDto {
  nickName?: string;
  username?: string;
  description?: string;
}

export interface ProfileUpdateResponse {
  message: string;
}

export interface AvatarUploadResponse {
  message: string;
  avatarUrl: string;
}

export interface ChangeEmailDto {
  oldEmail: string;
  newEmail: string;
}

export interface ChangeEmailResponse {
  message: string;
  expiresIn: number;
}

export interface ConfirmChangeEmailDto {
  newEmail: string;
  code: string;
}

export interface ConfirmChangeEmailResponse {
  message: string;
}

export interface ChangePasswordDto {
  oldPassword: string;
  newPassword: string;
  ConfirmPassword: string;
}

export interface ChangePasswordResponse {
  message: string;
  expiresIn: number;
}

export interface ConfirmChangePasswordDto {
  newPassword: string;
  code: string;
}

export interface ConfirmChangePasswordResponse {
  message: string;
}