import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { chatApi } from '../api';
import {
  Chat,
  ChatDeletedEvent,
  Message,
  MessageDeletedEvent,
  MessageEditedEvent,
  MessagePinnedEvent,
  MessageUnpinnedEvent,
  MessagesReadEvent,
  PinnedMessage,
  ReactionEvent,
  TypingEvent,
  UnreadPerChat,
} from '../api/chat.types';
import { useSocket } from '../context/SocketContext';
import { useMe } from './user.hook';

// ─── Query keys ───────────────────────────────────────────────────────────────

export const chatQueryKeys = {
  list:          ['chats', 'list']               as const,
  unreadCount:   ['chats', 'unread', 'count']    as const,
  unreadPerChat: ['chats', 'unread', 'per-chat'] as const,
  search:        (chatId: number, q: string) => ['chats', 'search', chatId, q] as const,
};

// ─── Message normalizer ───────────────────────────────────────────────────────

export const normalizeMessage = (msg: any): Message => ({
  ...msg,
  reactions:     Array.isArray(msg.reactions)    ? msg.reactions    : [],
  readReceipts:  Array.isArray(msg.readReceipts) ? msg.readReceipts : [],
  forwardedFrom: msg.forwardedFrom ?? null,
});

// ─── Module-level typing state ────────────────────────────────────────────────

const _typingState: Record<number, Set<number>> = {};
const _typingTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const _typingListeners = new Set<() => void>();
let _typingVersion = 0;

function _setTyping(chatId: number, userId: number, active: boolean) {
  if (!_typingState[chatId]) _typingState[chatId] = new Set();
  if (active) {
    _typingState[chatId].add(userId);
  } else {
    _typingState[chatId].delete(userId);
  }
  _typingVersion++;
  _typingListeners.forEach((fn) => fn());
}

// ─── Instant unread helpers ───────────────────────────────────────────────────

function _incrementUnread(
  queryClient: ReturnType<typeof useQueryClient>,
  chatId: number,
  senderId: number | string | undefined,
  myId: number | undefined,
) {
  if (myId == null) return;
  if (Number(senderId) === Number(myId)) return;

  queryClient.setQueryData<UnreadPerChat[]>(chatQueryKeys.unreadPerChat, (old) => {
    if (!old) return [{ chatId, unreadCount: 1 }];
    const exists = old.some((u) => u.chatId === chatId);
    if (exists) return old.map((u) => u.chatId === chatId ? { ...u, unreadCount: u.unreadCount + 1 } : u);
    return [...old, { chatId, unreadCount: 1 }];
  });

  queryClient.setQueryData<{ count: number }>(chatQueryKeys.unreadCount, (old) =>
    old ? { count: old.count + 1 } : { count: 1 },
  );
}

function _clearUnread(
  queryClient: ReturnType<typeof useQueryClient>,
  chatId: number,
) {
  let removed = 0;
  queryClient.setQueryData<UnreadPerChat[]>(chatQueryKeys.unreadPerChat, (old) => {
    if (!old) return old;
    const entry = old.find((u) => u.chatId === chatId);
    removed = entry?.unreadCount ?? 0;
    if (removed === 0) return old;
    return old.map((u) => u.chatId === chatId ? { ...u, unreadCount: 0 } : u);
  });
  if (removed > 0) {
    queryClient.setQueryData<{ count: number }>(chatQueryKeys.unreadCount, (old) =>
      old ? { count: Math.max(0, old.count - removed) } : { count: 0 },
    );
  }
}

// ─── mark_read guard ──────────────────────────────────────────────────────────
// Вызывается только когда есть сообщения от другого пользователя.
// Фикс бага: отправитель не засчитывает себе прочтение своих сообщений.

function _markReadIfNeeded(
  socket: any,
  chatId: number,
  messages: Message[],
  myId: number | undefined,
) {
  if (!socket || myId == null) return;
  const hasFromOther = messages.some((m) => Number(m.senderId) !== Number(myId));
  if (hasFromOther) socket.emit('mark_read', { chatId });
}

// ─── useChats ─────────────────────────────────────────────────────────────────

export const useChats = () =>
  useQuery({
    queryKey: chatQueryKeys.list,
    queryFn:  chatApi.getUserChats,
    staleTime: 30_000,
    gcTime: 120_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

// ─── useCreateChat ────────────────────────────────────────────────────────────

export const useCreateChat = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (receiverId: number) => chatApi.createChat(receiverId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chatQueryKeys.list }),
  });
};

// ─── useDeleteChat ────────────────────────────────────────────────────────────

export const useDeleteChat = () => {
  const { socket } = useSocket();
  const queryClient = useQueryClient();

  const mutate = useCallback(({ chatId, forEveryone }: { chatId: number; forEveryone: boolean }) => {
    queryClient.setQueryData<Chat[]>(chatQueryKeys.list, (old) =>
      old ? old.filter((c) => c.id !== chatId) : old,
    );
    if (socket?.connected) {
      socket.emit('delete_chat', { chatId, forEveryone });
    } else {
      chatApi.deleteChat(chatId, forEveryone).catch(() => {
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.list });
      });
    }
  }, [socket, queryClient]);

  return { mutate };
};

// ─── useUnreadCount ───────────────────────────────────────────────────────────

export const useUnreadCount = () =>
  useQuery({
    queryKey: chatQueryKeys.unreadCount,
    queryFn:  chatApi.getUnreadCount,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

// ─── useUnreadPerChat ─────────────────────────────────────────────────────────

export const useUnreadPerChat = () =>
  useQuery({
    queryKey: chatQueryKeys.unreadPerChat,
    queryFn:  chatApi.getUnreadPerChat,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

// ─── useSearchMessages ────────────────────────────────────────────────────────

export const useSearchMessages = (chatId: number, q: string) =>
  useQuery({
    queryKey: chatQueryKeys.search(chatId, q),
    queryFn:  () => chatApi.searchMessages(chatId, q),
    enabled:  q.trim().length > 1,
    staleTime: 30_000,
  });

// ─── useForwardToChat ─────────────────────────────────────────────────────────
// Пересылка сообщения в произвольный чат (не обязательно текущий).
// Эмитит send_message с нужным chatId и forwardedFromId.

export const useForwardToChat = () => {
  const { socket } = useSocket();

  const forwardToChat = useCallback(
    (targetChatId: number, messageId: number) => {
      if (!socket) return;
      socket.emit('send_message', {
        chatId:          targetChatId,
        content:         '',
        forwardedFromId: messageId,
      });
    },
    [socket],
  );

  return { forwardToChat };
};

// ─── useChatRoom ──────────────────────────────────────────────────────────────

export const useChatRoom = (chatId: number) => {
  const { socket, isConnected } = useSocket();
  const queryClient = useQueryClient();
  const { data: me } = useMe();

  const [messages,      setMessages]      = useState<Message[]>([]);
  const [pinnedMessage, setPinnedMessage] = useState<PinnedMessage | null>(null);
  const [isLoading,     setIsLoading]     = useState(true);

  const socketRef      = useRef(socket);
  const meRef          = useRef(me);
  const queryClientRef = useRef(queryClient);
  useEffect(() => { socketRef.current = socket; },           [socket]);
  useEffect(() => { meRef.current = me; },                   [me]);
  useEffect(() => { queryClientRef.current = queryClient; }, [queryClient]);

  // JOIN
  useEffect(() => {
    if (!socket || !isConnected || !chatId) return;

    setIsLoading(true);
    setMessages([]);
    setPinnedMessage(null);

    socket.emit('join_chat', { chatId }, (res: { success: boolean; messages: any[]; pinnedMessage?: PinnedMessage }) => {
      if (res?.success) {
        const normalized = (res.messages ?? []).map(normalizeMessage);
        setMessages(normalized);
        if (res.pinnedMessage) setPinnedMessage(res.pinnedMessage);
        _markReadIfNeeded(socket, chatId, normalized, meRef.current?.id);
      }
      setIsLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, socket?.id]);

  // LISTENERS
  useEffect(() => {
    const s = socketRef.current;
    if (!s) return;

    const onNewMessage = (raw: any) => {
      if (raw.chatId !== chatId) return;
      const msg = normalizeMessage(raw);

      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        const next = [...prev, msg];
        const senderId = raw.sender?.id ?? raw.senderId;
        if (Number(senderId) !== Number(meRef.current?.id)) {
          socketRef.current?.emit('mark_read', { chatId });
        }
        return next;
      });

      queryClientRef.current.setQueryData<Chat[]>(chatQueryKeys.list, (old) => {
        if (!old) return old;
        const updated = old.map((chat) =>
          chat.id !== raw.chatId ? chat : {
            ...chat,
            updatedAt: raw.createdAt,
            messages: [{ id: raw.id, content: raw.content ?? null, type: raw.type, createdAt: raw.createdAt, sender: raw.sender }],
          },
        );
        return [...updated].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      });

      _incrementUnread(queryClientRef.current, raw.chatId, raw.sender?.id ?? raw.senderId, meRef.current?.id);
    };

    const onDeleted = (data: MessageDeletedEvent) => {
      if (data.chatId !== chatId) return;
      setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
      queryClientRef.current.setQueryData<Chat[]>(chatQueryKeys.list, (old) => {
        if (!old) return old;
        return old.map((chat) => {
          if (chat.id !== chatId) return chat;
          return { ...chat, messages: chat.messages.filter((m) => m.id !== data.messageId) };
        });
      });
    };

    const onEdited = (raw: MessageEditedEvent) => {
      if (raw.chatId !== chatId) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== raw.id) return m;
          return normalizeMessage({
            ...m, ...raw,
            forwardedFrom: raw.forwardedFrom ?? m.forwardedFrom,
            reactions:    Array.isArray(raw.reactions)    ? raw.reactions    : m.reactions,
            readReceipts: Array.isArray(raw.readReceipts) ? raw.readReceipts : m.readReceipts,
          });
        }),
      );
      queryClientRef.current.setQueryData<Chat[]>(chatQueryKeys.list, (old) => {
        if (!old) return old;
        return old.map((chat) => {
          if (chat.id !== chatId) return chat;
          return {
            ...chat,
            messages: chat.messages.map((m) =>
              m.id === raw.id ? { ...m, content: raw.content ?? m.content } : m,
            ),
          };
        });
      });
    };

    const onPinned = (data: MessagePinnedEvent) => {
      if (data.chatId !== chatId) return;
      setPinnedMessage(data.pinnedMessage);
    };

    const onUnpinned = (data: MessageUnpinnedEvent) => {
      if (data.chatId !== chatId) return;
      setPinnedMessage(null);
    };

    const onReaction = (data: ReactionEvent) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== data.messageId) return m;
          const reactions = Array.isArray(m.reactions) ? m.reactions : [];
          if (data.action === 'added') {
            if (reactions.some((r) => r.userId === data.userId && r.emoji === data.emoji)) return m;
            return { ...m, reactions: [...reactions, { id: Date.now(), messageId: data.messageId, userId: data.userId, emoji: data.emoji }] };
          }
          return { ...m, reactions: reactions.filter((r) => !(r.userId === data.userId && r.emoji === data.emoji)) };
        }),
      );
    };

    const onMessagesRead = (data: MessagesReadEvent) => {
      if (data.chatId !== chatId) return;
      _clearUnread(queryClientRef.current, data.chatId);
    };

    s.on('new_message',      onNewMessage);
    s.on('message_deleted',  onDeleted);
    s.on('message_edited',   onEdited);
    s.on('message_pinned',   onPinned);
    s.on('message_unpinned', onUnpinned);
    s.on('message_reaction', onReaction);
    s.on('messages_read',    onMessagesRead);

    return () => {
      s.off('new_message',      onNewMessage);
      s.off('message_deleted',  onDeleted);
      s.off('message_edited',   onEdited);
      s.off('message_pinned',   onPinned);
      s.off('message_unpinned', onUnpinned);
      s.off('message_reaction', onReaction);
      s.off('messages_read',    onMessagesRead);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, socket?.id]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const sendMessage = useCallback((content: string, forwardedFromId?: number) => {
    if (!socket) return;
    if (!content.trim() && forwardedFromId == null) return;
    socket.emit('send_message', {
      chatId,
      content: content.trim(),
      ...(forwardedFromId != null ? { forwardedFromId } : {}),
    });
  }, [socket, chatId]);

  const sendMedia = useCallback(async (
    file: { uri: string; name: string; type: string },
    mediaType: 'IMAGE' | 'VIDEO' | 'FILE' | 'AUDIO',
    forwardedFromId?: number,
  ) => {
    if (!socket) return;
    const uploadData = await new Promise<{ uploadUrl: string; key: string }>((resolve, reject) => {
      socket.emit('request_upload_url', { chatId, filename: file.name }, (res: any) => {
        if (res?.uploadUrl) resolve(res);
        else reject(new Error('Не удалось получить URL для загрузки'));
      });
    });
    const blob = await (await fetch(file.uri)).blob();
    const response = await fetch(uploadData.uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': file.type } });
    if (!response.ok) throw new Error('Ошибка загрузки файла');
    socket.emit('confirm_media', {
      chatId,
      key: uploadData.key,
      type: mediaType,
      ...(forwardedFromId != null ? { forwardedFromId } : {}),
    });
  }, [socket, chatId]);

  const editMessage = useCallback((messageId: number, content: string) => {
    if (!socket || !content.trim()) return;
    socket.emit('edit_message', { chatId, messageId, content: content.trim() });
  }, [socket, chatId]);

  // forEveryone: true  = удалить у всех (доступно любому участнику 1:1 чата)
  // forEveryone: false = скрыть только у себя
  const deleteMessage = useCallback((messageId: number, forEveryone: boolean) => {
    if (!socket) return;
    socket.emit('delete_message', { chatId, messageId, forEveryone });
  }, [socket, chatId]);

  const reactToMessage = useCallback((messageId: number, emoji: string) =>
    socket?.emit('react_message', { chatId, messageId, emoji }), [socket, chatId]);

  const pinMessage   = useCallback((messageId: number) =>
    socket?.emit('pin_message',   { chatId, messageId }), [socket, chatId]);

  const unpinMessage = useCallback(() =>
    socket?.emit('unpin_message', { chatId }), [socket, chatId]);

  const markRead = useCallback(() => {
    _markReadIfNeeded(socketRef.current, chatId, messages, meRef.current?.id);
  }, [chatId, messages]);

  return {
    messages, pinnedMessage, setPinnedMessage, isLoading,
    sendMessage, sendMedia, editMessage, deleteMessage,
    reactToMessage, pinMessage, unpinMessage, markRead,
  };
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
      setTypingUserIds((prev) => (prev.includes(data.userId) ? prev : [...prev, data.userId]));
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

    socket.on('user_typing',      onTyping);
    socket.on('user_stop_typing', onStop);

    return () => {
      socket.off('user_typing',      onTyping);
      socket.off('user_stop_typing', onStop);
      Object.values(timers.current).forEach(clearTimeout);
    };
  }, [socket, chatId]);

  const startTyping = useCallback(() => socket?.emit('typing',      { chatId }), [socket, chatId]);
  const stopTyping  = useCallback(() => socket?.emit('stop_typing', { chatId }), [socket, chatId]);

  return { typingUserIds, startTyping, stopTyping };
};

// ─── useGlobalChatListener ───────────────────────────────────────────────────

export const useGlobalChatListener = () => {
  const { socket, isConnected } = useSocket();
  const { data: me }  = useMe();
  const queryClient   = useQueryClient();

  const socketRef      = useRef(socket);
  const meRef          = useRef(me);
  const queryClientRef = useRef(queryClient);
  const joinedRooms    = useRef<Set<number>>(new Set());

  useEffect(() => { socketRef.current = socket; },           [socket]);
  useEffect(() => { meRef.current = me; },                   [me]);
  useEffect(() => { queryClientRef.current = queryClient; }, [queryClient]);

  const joinAllRooms = useCallback(async () => {
    const s = socketRef.current;
    if (!s?.connected) return;
    try {
      const cached: Chat[] | undefined = queryClientRef.current.getQueryData(chatQueryKeys.list);
      let chats: Chat[];
      if (cached && cached.length > 0) {
        chats = cached;
      } else {
        chats = await chatApi.getUserChats();
        queryClientRef.current.setQueryData(chatQueryKeys.list, chats);
      }
      for (const chat of chats) {
        s.emit('join_chat', { chatId: chat.id }, (res: any) => {
          if (res?.success) joinedRooms.current.add(chat.id);
        });
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!socket || !isConnected) return;
    joinedRooms.current.clear();
    joinAllRooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket?.id]);

  useEffect(() => {
    const s = socketRef.current;
    if (!s) return;

    const onNewMessage = (raw: any) => {
      const qc = queryClientRef.current;
      qc.setQueryData<Chat[]>(chatQueryKeys.list, (old) => {
        if (!old || old.length === 0) {
          qc.invalidateQueries({ queryKey: chatQueryKeys.list });
          return old;
        }
        const chatExists = old.some((c) => c.id === raw.chatId);
        if (!chatExists) {
          if (!joinedRooms.current.has(raw.chatId)) {
            s.emit('join_chat', { chatId: raw.chatId }, (res: any) => {
              if (res?.success) {
                joinedRooms.current.add(raw.chatId);
                qc.invalidateQueries({ queryKey: chatQueryKeys.list });
              }
            });
          }
          return old;
        }
        const updated = old.map((chat) =>
          chat.id !== raw.chatId ? chat : {
            ...chat,
            updatedAt: raw.createdAt,
            messages: [{ id: raw.id, content: raw.content ?? null, type: raw.type, createdAt: raw.createdAt, sender: raw.sender }],
          },
        );
        return [...updated].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      });
      _incrementUnread(queryClientRef.current, raw.chatId, raw.sender?.id ?? raw.senderId, meRef.current?.id);
    };

    const onMessagesRead = (data: MessagesReadEvent) => {
      _clearUnread(queryClientRef.current, data.chatId);
    };

    const onChatDeleted = (data: ChatDeletedEvent) => {
      queryClientRef.current.setQueryData<Chat[]>(chatQueryKeys.list, (old) =>
        old ? old.filter((c) => c.id !== data.chatId) : old,
      );
      joinedRooms.current.delete(data.chatId);
    };

    const onNewChat = () => {
      queryClientRef.current.invalidateQueries({ queryKey: chatQueryKeys.list });
      joinAllRooms();
    };

    const onTyping = (d: TypingEvent) => {
      const key = `${d.chatId}_${d.userId}`;
      clearTimeout(_typingTimers[key]);
      _setTyping(d.chatId, d.userId, true);
      _typingTimers[key] = setTimeout(() => _setTyping(d.chatId, d.userId, false), 3_500);
    };

    const onStopTyping = (d: TypingEvent) => {
      const key = `${d.chatId}_${d.userId}`;
      clearTimeout(_typingTimers[key]);
      _setTyping(d.chatId, d.userId, false);
    };

    s.on('new_message',      onNewMessage);
    s.on('messages_read',    onMessagesRead);
    s.on('chat_deleted',     onChatDeleted);
    s.on('user_typing',      onTyping);
    s.on('user_stop_typing', onStopTyping);

    const myId = meRef.current?.id;
    if (myId) s.on(`new_chat:${myId}`, onNewChat);

    return () => {
      s.off('new_message',      onNewMessage);
      s.off('messages_read',    onMessagesRead);
      s.off('chat_deleted',     onChatDeleted);
      s.off('user_typing',      onTyping);
      s.off('user_stop_typing', onStopTyping);
      if (myId) s.off(`new_chat:${myId}`, onNewChat);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket?.id]);

  useEffect(() => {
    if (!isConnected) joinedRooms.current.clear();
  }, [isConnected]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        queryClientRef.current.invalidateQueries({ queryKey: chatQueryKeys.list });
        joinAllRooms();
      }
    });
    return () => sub.remove();
  }, [joinAllRooms]);
};

// ─── useGlobalTyping ─────────────────────────────────────────────────────────

export const useGlobalTyping = () => {
  const [version, setVersion] = useState(_typingVersion);

  useEffect(() => {
    const notify = () => setVersion(_typingVersion);
    _typingListeners.add(notify);
    notify();
    return () => { _typingListeners.delete(notify); };
  }, []);

  return useCallback(
    (chatId: number) => (_typingState[chatId]?.size ?? 0) > 0,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );
};