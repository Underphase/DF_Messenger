export { api } from './client';
export { getTokens, saveTokens, clearTokens } from './client';
import { DeviceCreate, DeviceGet, Key } from './key.types';
import { register, login, verify, sendCode } from './login.types';
import {
  UserMe,
  TokenPair,
  LogoutResponse,
  ProfileUpdateDto,
  ProfileUpdateResponse,
  AvatarUploadResponse,
  ChangeEmailDto,
  ChangeEmailResponse,
  ConfirmChangeEmailDto,
  ConfirmChangeEmailResponse,
  ChangePasswordDto,
  ChangePasswordResponse,
  ConfirmChangePasswordDto,
  ConfirmChangePasswordResponse,
} from './user.types';

import { api } from './client';
import {
  SearchUser,
  Friend,
  ReceivedRequest,
  SentRequest,
  FriendshipStatus,
  MutualFriend,
  BlockedUser,
  RequestsCount,
} from './friends.types';

export const keys = {
  createDevice: (deviceKey: string) =>
    api.post<DeviceCreate>('/keys/createDevice', { key: deviceKey })
      .then(res => res.data),

  getDevice: (deviceId: number) =>
    api.get<DeviceGet>(`keys/device/${deviceId}`)
      .then(res => res.data),

  verify: (deviceKey: string) =>
    api.post<Key>('keys/verify', { key: deviceKey })
      .then(res => res.data),
};

export const loginApi = {
  register: (email: string, nickName: string, password: string) =>
    api.post<register>('/auth/register', { email, nickName, password })
      .then(res => res.data),

  login: (email: string, password: string) =>
    api.post<login>('/auth/login', { email, password })
      .then(res => res.data),

  verify: (email: string, code: string) =>
    api.post<verify>('/auth/verify', { email, code })
      .then(res => res.data),

  sendCode: (email: string) =>
    api.post<sendCode>('/auth/sendCode', { email })
      .then(res => res.data),
};

export const userApi = {
  // ── Auth ────────────────────────────────────────────────────────────────────
  me: () =>
    api.get<UserMe>('/user/me')
      .then(res => res.data),

  refresh: (oldRefreshToken: string) =>
    api.post<TokenPair>('/user/refresh', { oldRefreshToken })
      .then(res => res.data),

  logout: (oldRefreshToken: string) =>
    api.post<LogoutResponse>('/user/logout', { oldRefreshToken })
      .then(res => res.data),

  // ── Profile ─────────────────────────────────────────────────────────────────
  updateProfile: (dto: ProfileUpdateDto) =>
    api.put<ProfileUpdateResponse>('/user/me/update', dto)
      .then(res => res.data),

  uploadAvatar: (file: { uri: string; name: string; type: string }) => {
    const form = new FormData();
    form.append('file', file as any);
    return api.post<AvatarUploadResponse>('/user/me/avatarUpload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(res => res.data);
  },

  // ── Email ───────────────────────────────────────────────────────────────────
  changeEmail: (dto: ChangeEmailDto) =>
    api.put<ChangeEmailResponse>('/user/me/email-change', dto)
      .then(res => res.data),

  confirmChangeEmail: (dto: ConfirmChangeEmailDto) =>
    api.put<ConfirmChangeEmailResponse>('/user/me/email-change/confirm', dto)
      .then(res => res.data),

  // ── Password ────────────────────────────────────────────────────────────────
  changePassword: (dto: ChangePasswordDto) =>
    api.put<ChangePasswordResponse>('/user/me/password-change', dto)
      .then(res => res.data),

  confirmChangePassword: (dto: ConfirmChangePasswordDto) =>
    api.put<ConfirmChangePasswordResponse>('/user/me/password-change/confirm', dto)
      .then(res => res.data),
};

export const friendsApi = {
  // ── Search ───────────────────────────────────────────────────────────────────
  search: (q: string, skip = 0) =>
    api
      .get<SearchUser[]>('/friends/search', { params: { q, skip } })
      .then((res) => res.data),

  // ── Friends list ─────────────────────────────────────────────────────────────
  getFriends: () =>
    api.get<Friend[]>('/friends').then((res) => res.data),

  removeFriend: (friendId: number) =>
    api.delete(`/friends/${friendId}`).then((res) => res.data),

  // ── Mutual ───────────────────────────────────────────────────────────────────
  getMutual: (targetId: number) =>
    api
      .get<MutualFriend[]>(`/friends/mutual/${targetId}`)
      .then((res) => res.data),

  // ── Status — возвращает строку напрямую ──────────────────────────────────────
  getStatus: (targetId: number) =>
    api
      .get<FriendshipStatus>(`/friends/status/${targetId}`)
      .then((res) => res.data),

  // ── Requests ─────────────────────────────────────────────────────────────────
  sendRequest: (receiverId: number) =>
    api.post(`/friends/requests/${receiverId}`).then((res) => res.data),

  cancelRequest: (requestId: number) =>
    api
      .delete(`/friends/requests/${requestId}/cancel`)
      .then((res) => res.data),

  respondRequest: (friendshipId: number, action: 'ACCEPTED' | 'DECLINED') =>
    api
      .patch(`/friends/requests/${friendshipId}`, { action })
      .then((res) => res.data),

  // { friendshipId, ...receiver }
  getSentRequests: () =>
    api.get<SentRequest[]>('/friends/requests/sent').then((res) => res.data),

  // { friendshipId, ...sender }
  getReceivedRequests: () =>
    api
      .get<ReceivedRequest[]>('/friends/requests/received')
      .then((res) => res.data),

  // { count: number }
  getRequestsCount: () =>
    api
      .get<RequestsCount>('/friends/requests/count')
      .then((res) => res.data),

  // ── Block ────────────────────────────────────────────────────────────────────
  blockUser: (blockedId: number) =>
    api.post(`/friends/block/${blockedId}`).then((res) => res.data),

  unblockUser: (blockedId: number) =>
    api.delete(`/friends/block/${blockedId}`).then((res) => res.data),

  getBlockedList: () =>
    api.get<BlockedUser[]>('/friends/block').then((res) => res.data),
};