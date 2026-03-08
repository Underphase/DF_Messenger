import { SearchUser } from '../api/friends.types';

export interface OtherUser {
  id: number;
  nickName: string;
  username: string;
  avatarUrl: string | null;
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export type AppStackParamList = {
  MainScreen: undefined;
  ChatScreen: { chatId: number; otherUser: OtherUser };
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

// ─── Auth ─────────────────────────────────────────────────────────────────────

export type AuthStackParamList = {
  KeyLoginScreen: undefined;
  LoginScreen: undefined;
};

// ─── Main tabs ────────────────────────────────────────────────────────────────

export type MainTabParamList = {
  Chats: undefined;
  Friends: undefined;
  Profile: undefined;
};

// ─── Chats stack (only ChatsScreen now — ChatScreen is in AppStack) ───────────

export type ChatsStackParamList = {
  ChatsScreen: undefined;
};

// ─── Search stack ─────────────────────────────────────────────────────────────

export type SearchStackParamList = {
  SearchScreen: undefined;
  FriendRequestsScreen: undefined;
  UserProfileScreen: { user: SearchUser };
};

// ─── Settings (Profile) stack ─────────────────────────────────────────────────

export type SettingsStackParamList = {
  SettingsScreen: undefined;
  EditProfileScreen: undefined;
  ChangeEmailScreen: undefined;
  ChangePasswordScreen: undefined;
  BlockedUsersScreen: undefined;
};