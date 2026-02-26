// ─── Status string (GET /friends/status/:targetId) ───────────────────────────

export type FriendshipStatus =
  | 'FRIENDS'
  | 'REQUEST_SENT'
  | 'REQUEST_RECEIVED'
  | 'BLOCKED_BY_ME'
  | 'BLOCKED_BY_THEM'
  | 'NONE';

// ─── User in search results (GET /friends/search) ────────────────────────────

export interface SearchUser {
  id: number;
  nickName: string;
  username: string;
  description: string | null;
  avatarUrl: string | null;
}

// ─── Friend (GET /friends) ────────────────────────────────────────────────────

export interface Friend {
  id: number;
  nickName: string;
  username: string;
  description: string | null;
  avatarUrl: string | null;
}

// ─── Sent request (GET /friends/requests/sent) ───────────────────────────────
// бэкенд: { friendshipId: f.id, ...f.receiver }

export interface SentRequest {
  friendshipId: number;
  id: number;
  nickName: string;
  username: string;
  description: string | null;
  avatarUrl: string | null;
}

// ─── Received request (GET /friends/requests/received) ───────────────────────
// бэкенд: { friendshipId: f.id, ...f.sender }

export interface ReceivedRequest {
  friendshipId: number;
  id: number;
  nickName: string;
  username: string;
  description: string | null;
  avatarUrl: string | null;
}

// ─── Blocked user (GET /friends/block) ───────────────────────────────────────

export interface BlockedUser {
  id: number;
  nickName: string;
  username: string;
  avatarUrl: string | null;
}

// ─── Requests count (GET /friends/requests/count) ────────────────────────────
// бэкенд: return { count }

export interface RequestsCount {
  count: number;
}

// ─── Mutual friends (GET /friends/mutual/:targetId) ──────────────────────────

export interface MutualFriend {
  id: number;
  nickName: string;
  username: string;
  avatarUrl: string | null;
}