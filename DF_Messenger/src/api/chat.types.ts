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

export interface PinnedMessageSender {
  id: number;
  nickName: string;
  username: string;
}

/** Одна запись закрепа (вложенная структура от GET /chat/list и join_chat) */
export interface PinnedMessage {
  id: number;
  chatId: number;
  messageId: number;
  userId: number;
  createdAt: string;
  message: {
    id: number;
    content: string | null;
    type: MessageType;
    sender: PinnedMessageSender;
  };
}

export interface Chat {
  id: number;
  createdAt: string;
  updatedAt: string;
  participants: ChatParticipant[];
  messages: LastMessage[];
  pinnedMessages: PinnedMessage[];
}

// ─── Message ──────────────────────────────────────────────────────────────────
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

export interface ForwardedFrom {
  id: number;
  content: string | null;
  type: MessageType;
  mediaUrl: string | null;
  sender: {
    id: number;
    nickName: string;
    username: string;
  };
}

export interface Message {
  id: number;
  chatId: number;
  senderId: number;
  content: string | null;
  type: MessageType;
  mediaUrl: string | null;
  forwardedFromId: number | null;
  forwardedFrom: ForwardedFrom | null;
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
  unreadCount: number;
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

export interface EditMessageResponse {
  id: number;
  content: string;
  updatedAt: string;
  sender: MessageSender;
}

export interface PinMessageResponse {
  id: number;
  pinnedMessages: PinnedMessage[];
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

export interface MessageDeletedEvent {
  messageId: number;
  chatId: number;
  forEveryone: boolean;
}

export interface MessageEditedEvent extends Message {}

export interface MessagePinnedEvent {
  chatId: number;
  pinnedMessages: PinnedMessage[];
}

export interface MessageUnpinnedEvent {
  chatId: number;
  messageId: number;
  pinnedMessages: PinnedMessage[];
}

export interface ChatDeletedEvent {
  chatId: number;
  forEveryone: boolean;
}