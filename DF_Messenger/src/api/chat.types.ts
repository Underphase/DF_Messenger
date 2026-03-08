// ─── Message type enum ────────────────────────────────────────────────────────

export type MessageType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'FILE' | 'AUDIO';

// ─── Chat list (GET /chat/list) ───────────────────────────────────────────────

export interface ChatParticipantUser {
  id: number;
  nickName: string;
  username: string;
  avatarUrl: string | null;
}

export interface ChatParticipant {
  user: ChatParticipantUser;
}

export interface LastMessageSender {
  id: number;
  nickName: string;
}

export interface LastMessage {
  id: number;
  content: string | null;
  type: MessageType;
  createdAt: string;
  sender: LastMessageSender;
}

export interface Chat {
  id: number;
  createdAt: string;
  updatedAt: string;
  participants: ChatParticipant[];
  messages: LastMessage[]; // last 1 message from backend
}

// ─── Message (GET /chat/messages or socket join_chat) ─────────────────────────

export interface MessageReaction {
  id: number;
  messageId: number;
  userId: number;
  emoji: string;
}

export interface MessageReadReceipt {
  id: number;
  messageId: number;
  userId: number;
  readAt: string;
}

export interface MessageSender {
  id: number;
  username: string;
  nickName: string;
  avatarUrl: string | null;
}

export interface Message {
  id: number;
  chatId: number;
  senderId: number;
  content: string | null;
  type: MessageType;
  mediaUrl: string | null;
  forwardedFromId: number | null;
  createdAt: string;
  updatedAt: string;
  sender: MessageSender;
  reactions: MessageReaction[];
  readReceipts: MessageReadReceipt[];
}

// ─── Unread counts ────────────────────────────────────────────────────────────

export interface UnreadCount {
  count: number;
}

export interface UnreadPerChat {
  chatId: number;
  _count: { id: number };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export interface CreateChatResponse {
  id: number;
  createdAt: string;
  updatedAt: string;
  participants: ChatParticipant[];
}

export interface DeleteChatResponse {
  success: boolean;
  deleteForEveryone: boolean;
}

// ─── Socket events ────────────────────────────────────────────────────────────

export interface ReactionEvent {
  messageId: number;
  userId: number;
  emoji: string;
  action: 'added' | 'removed';
}

export interface TypingEvent {
  userId: number;
  chatId: number;
}

export interface MessagesReadEvent {
  chatId: number;
  userId: number;
}

export interface UnreadCountEvent {
  count: number;
}