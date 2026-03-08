import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { chatApi } from '../api';
import {
  Chat,
  Message,
  MessagesReadEvent,
  ReactionEvent,
  TypingEvent,
} from '../api/chat.types';
import { useSocket } from '../context/SocketContext';
import { useMe } from './user.hook';

// ─── Query keys ───────────────────────────────────────────────────────────────

export const chatQueryKeys = {
  list: ['chats', 'list'] as const,
  unreadCount: ['chats', 'unread', 'count'] as const,
  unreadPerChat: ['chats', 'unread', 'per-chat'] as const,
};

// ─── Helper: normalize a message from the socket ─────────────────────────────

const normalizeMessage = (msg: any): Message => ({
  ...msg,
  reactions:    Array.isArray(msg.reactions)    ? msg.reactions    : [],
  readReceipts: Array.isArray(msg.readReceipts) ? msg.readReceipts : [],
});

// ─── useChats ─────────────────────────────────────────────────────────────────

export const useChats = () =>
  useQuery({
    queryKey: chatQueryKeys.list,
    queryFn: chatApi.getUserChats,
    staleTime: 2_000,
    // Poll every 3s — catches new chats created by other users in real-time
    // (socket only delivers to rooms you've already joined)
    refetchInterval: 3_000,
    refetchIntervalInBackground: false,
  });

// ─── useCreateChat ────────────────────────────────────────────────────────────

export const useCreateChat = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (receiverId: number) => chatApi.createChat(receiverId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.list }),
  });
};

// ─── useDeleteChat ────────────────────────────────────────────────────────────

export const useDeleteChat = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, forEveryone }: { chatId: number; forEveryone: boolean }) =>
      chatApi.deleteChat(chatId, forEveryone),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.list }),
  });
};

// ─── useUnreadCount ───────────────────────────────────────────────────────────

export const useUnreadCount = () =>
  useQuery({
    queryKey: chatQueryKeys.unreadCount,
    queryFn: chatApi.getUnreadCount,
    staleTime: 2_000,
    refetchInterval: 3_000,
    refetchIntervalInBackground: false,
  });

// ─── useUnreadPerChat ─────────────────────────────────────────────────────────

export const useUnreadPerChat = () =>
  useQuery({
    queryKey: chatQueryKeys.unreadPerChat,
    queryFn: chatApi.getUnreadPerChat,
    staleTime: 2_000,
    refetchInterval: 3_000,
    refetchIntervalInBackground: false,
  });

// ─── useChatRoom ──────────────────────────────────────────────────────────────

export const useChatRoom = (chatId: number) => {
  const { socket, isConnected } = useSocket();
  const queryClient = useQueryClient();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const joinedRef = useRef(false);

  useEffect(() => {
    if (!socket || !isConnected || !chatId) return;

    if (!joinedRef.current) {
      setIsLoading(true);
      socket.emit(
        'join_chat',
        { chatId },
        (res: { success: boolean; messages: any[] }) => {
          if (res?.success) {
            setMessages((res.messages ?? []).map(normalizeMessage));
          }
          setIsLoading(false);
          joinedRef.current = true;
        },
      );
    }

    const onNewMessage = (raw: any) => {
      if (raw.chatId !== chatId) return;
      const msg = normalizeMessage(raw);
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.list });
    };

    const onReaction = (data: ReactionEvent) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== data.messageId) return m;
          const reactions = Array.isArray(m.reactions) ? m.reactions : [];
          if (data.action === 'added') {
            if (reactions.some((r) => r.userId === data.userId && r.emoji === data.emoji)) return m;
            return {
              ...m,
              reactions: [...reactions, { id: Date.now(), messageId: data.messageId, userId: data.userId, emoji: data.emoji }],
            };
          }
          return { ...m, reactions: reactions.filter((r) => !(r.userId === data.userId && r.emoji === data.emoji)) };
        }),
      );
    };

    const onMessagesRead = (data: MessagesReadEvent) => {
      if (data.chatId !== chatId) return;
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.unreadCount });
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.unreadPerChat });
    };

    const onUnreadCount = () => {
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.unreadCount });
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.unreadPerChat });
    };

    socket.on('new_message', onNewMessage);
    socket.on('message_reaction', onReaction);
    socket.on('messages_read', onMessagesRead);
    socket.on('unread_count', onUnreadCount);

    return () => {
      socket.off('new_message', onNewMessage);
      socket.off('message_reaction', onReaction);
      socket.off('messages_read', onMessagesRead);
      socket.off('unread_count', onUnreadCount);
    };
  }, [socket, isConnected, chatId]);

  useEffect(() => {
    return () => {
      if (socket && chatId) {
        socket.emit('leave_chat', { chatId });
        joinedRef.current = false;
      }
    };
  }, [socket, chatId]);

  const sendMessage = useCallback(
    (content: string) => {
      if (!socket || !content.trim()) return;
      socket.emit('send_message', { chatId, content: content.trim() });
    },
    [socket, chatId],
  );

  const reactToMessage = useCallback(
    (messageId: number, emoji: string) => {
      socket?.emit('react_message', { chatId, messageId, emoji });
    },
    [socket, chatId],
  );

  const markRead = useCallback(() => {
    socket?.emit('mark_read', { chatId });
  }, [socket, chatId]);

  return { messages, isLoading, sendMessage, reactToMessage, markRead };
};

// ─── useTyping ────────────────────────────────────────────────────────────────

export const useTyping = (chatId: number) => {
  const { socket } = useSocket();
  const [typingUserIds, setTypingUserIds] = useState<number[]>([]);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!socket) return;

    const onTyping = (data: TypingEvent) => {
      if (data.chatId !== chatId) return;
      setTypingUserIds((prev) =>
        prev.includes(data.userId) ? prev : [...prev, data.userId],
      );
      clearTimeout(timers.current[data.userId]);
      timers.current[data.userId] = setTimeout(() => {
        setTypingUserIds((prev) => prev.filter((id) => id !== data.userId));
      }, 3_000);
    };

    const onStop = (data: TypingEvent) => {
      if (data.chatId !== chatId) return;
      clearTimeout(timers.current[data.userId]);
      setTypingUserIds((prev) => prev.filter((id) => id !== data.userId));
    };

    socket.on('user_typing', onTyping);
    socket.on('user_stop_typing', onStop);

    return () => {
      socket.off('user_typing', onTyping);
      socket.off('user_stop_typing', onStop);
      Object.values(timers.current).forEach(clearTimeout);
    };
  }, [socket, chatId]);

  const startTyping = useCallback(
    () => socket?.emit('typing', { chatId }),
    [socket, chatId],
  );

  const stopTyping = useCallback(
    () => socket?.emit('stop_typing', { chatId }),
    [socket, chatId],
  );

  return { typingUserIds, startTyping, stopTyping };
};

// ─── useGlobalChatListener ────────────────────────────────────────────────────
// Mount ONCE in MainNavigator.
//
// Core problem: Socket.io only delivers `new_message` to users who have
// called `join_chat` for that room. A recipient never joins a room until
// they open it. So we can't rely on sockets alone for "new chat" detection.
//
// Solution:
//   1. On connect → join ALL existing rooms (so existing chats work in RT)
//   2. Poll chat list every 3s (useChats refetchInterval) — catches brand-new chats
//   3. When new_message arrives for an unknown room → join it immediately
//   4. Listen on personal user room (user:{id}) if backend supports it

export const useGlobalChatListener = () => {
  const { socket, isConnected } = useSocket();
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const joinedRoomsRef = useRef<Set<number>>(new Set());

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: chatQueryKeys.list });
    queryClient.invalidateQueries({ queryKey: chatQueryKeys.unreadCount });
    queryClient.invalidateQueries({ queryKey: chatQueryKeys.unreadPerChat });
  }, [queryClient]);

  // Join all known chat rooms
  const joinAllRooms = useCallback(async () => {
    if (!socket || !isConnected) return;
    try {
      const chats: Chat[] = await chatApi.getUserChats();
      for (const chat of chats) {
        if (joinedRoomsRef.current.has(chat.id)) continue;
        socket.emit('join_chat', { chatId: chat.id }, (res: any) => {
          if (res?.success) joinedRoomsRef.current.add(chat.id);
        });
      }
    } catch { /* polling covers it */ }
  }, [socket, isConnected]);

  // Join rooms immediately on connect
  useEffect(() => {
    if (!socket || !isConnected) return;
    joinAllRooms();
  }, [socket, isConnected, joinAllRooms]);

  // Re-check for new rooms every 5s (complements the 3s REST poll)
  useEffect(() => {
    if (!socket || !isConnected) return;
    const interval = setInterval(joinAllRooms, 5_000);
    return () => clearInterval(interval);
  }, [socket, isConnected, joinAllRooms]);

  // Socket event listeners
  useEffect(() => {
    if (!socket || !isConnected) return;

    const onNewMessage = (raw: any) => {
      invalidateAll();
      // Join unknown room immediately so future messages arrive in RT
      if (raw?.chatId && !joinedRoomsRef.current.has(raw.chatId)) {
        socket.emit('join_chat', { chatId: raw.chatId }, (res: any) => {
          if (res?.success) joinedRoomsRef.current.add(raw.chatId);
        });
      }
    };

    socket.on('new_message',   onNewMessage);
    socket.on('messages_read', invalidateAll);
    socket.on('unread_count',  invalidateAll);

    // Some backends emit to a personal room — listen just in case
    if (me?.id) {
      socket.on(`new_chat:${me.id}`, () => {
        invalidateAll();
        joinAllRooms();
      });
    }

    return () => {
      socket.off('new_message',   onNewMessage);
      socket.off('messages_read', invalidateAll);
      socket.off('unread_count',  invalidateAll);
      if (me?.id) socket.off(`new_chat:${me.id}`);
    };
  }, [socket, isConnected, me?.id, invalidateAll, joinAllRooms]);

  // Clear joined set on disconnect so we re-join on reconnect
  useEffect(() => {
    if (!isConnected) joinedRoomsRef.current.clear();
  }, [isConnected]);

  // Refetch on app foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        invalidateAll();
        joinAllRooms();
      }
    });
    return () => sub.remove();
  }, [invalidateAll, joinAllRooms]);
};