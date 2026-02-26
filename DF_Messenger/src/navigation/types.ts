import { SearchUser } from '../api/friends.types';

// ─── Root ─────────────────────────────────────────────────────────────────────

export type AppStackParamList = {
  MainScreen: undefined;
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