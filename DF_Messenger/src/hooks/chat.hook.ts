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
import { useNetwork } from '../context/NetworkContext';
import { useMe } from './user.hook';
import {
  saveChats,
  loadChats,
  saveMessages,
  loadMessages,
  enqueueMessage,
} from '../storage/offlineStore';

// ─── Query keys ───────────────────────────────────────────────────────────────

export const chatQueryKeys = {
  list:          ['chats', 'list']               as const,
  unreadCount:   ['chats', 'unread', 'count']    as const,
  unreadPerChat: ['chats', 'unread', 'per-chat'] as const,
  search:        (chatId: number, q: string) => ['chats', 'search', chatId, q] as const,
};

// ─── Message normalizer ───────────────────────────────────────────────────────

export const normalizeMessage = (msg: any): Message => {
  if (msg.type === 'MUSIC') {
    console.log('[normalizeMessage MUSIC]', JSON.stringify({
      id: msg.id,
      musicTitle: msg.musicTitle,
      musicArtist: msg.musicArtist,
      musicCover: msg.musicCover,
      musicCoverUrl: msg.musicCoverUrl,
    }));
  }
  return {
    ...msg,
    reactions:     Array.isArray(msg.reactions)    ? msg.reactions    : [],
    readReceipts:  Array.isArray(msg.readReceipts) ? msg.readReceipts : [],
    forwardedFrom: msg.forwardedFrom ?? null,
  };
};

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

// ─── Unread helpers ───────────────────────────────────────────────────────────

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

function _markReadIfNeeded(
  socket: any,
  chatId: number,
  messages: Message[],
  myId: number | undefined,
) {
  if (!socket || myId == null) return;
  const hasUnreadFromOther = messages.some(
    (m) =>
      Number(m.senderId) !== Number(myId) &&
      !m.readReceipts.some((r) => Number(r.userId) === Number(myId))
  );
  if (hasUnreadFromOther) socket.emit('mark_read', { chatId });
}

// ─── useChats ─────────────────────────────────────────────────────────────────

export const useChats = () => {
  const queryClient = useQueryClient();
  const { isOnline } = useNetwork();

  // При старте: загружаем персистированный кеш с диска
  // (делаем один раз — если в памяти ещё нет данных)
  useEffect(() => {
    const cached = queryClient.getQueryData<Chat[]>(chatQueryKeys.list);
    if (cached?.length) return;

    loadChats().then((chats) => {
      if (chats?.length) {
        queryClient.setQueryData<Chat[]>(chatQueryKeys.list, chats);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return useQuery({
    queryKey: chatQueryKeys.list,
    queryFn: async () => {
      const data = await chatApi.getUserChats();
      // Персистируем на диск после успешного fetch
      saveChats(data);
      return data;
    },
    staleTime: Infinity,
    gcTime: 300_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    // При оффлайне — не запускаем запрос, данные с диска уже загружены выше
    enabled: isOnline,
    refetchOnReconnect: true,
    refetchInterval: false,
    retry: isOnline ? 3 : 0,
    retryDelay: 1_000,
    placeholderData: (prev: Chat[] | undefined) => prev,
  });
};

// ─── useCreateChat ────────────────────────────────────────────────────────────

export const useCreateChat = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (receiverId: number) => chatApi.createChat(receiverId),
    onSuccess: (newChat) => {
      queryClient.setQueryData<Chat[]>(chatQueryKeys.list, (old) => {
        if (!old) return [newChat as unknown as Chat];
        if (old.some((c) => c.id === (newChat as any).id)) return old;
        const updated = [newChat as unknown as Chat, ...old];
        saveChats(updated); // персистируем обновлённый список
        return updated;
      });
    },
  });
};

// ─── useDeleteChat ────────────────────────────────────────────────────────────

export const useDeleteChat = () => {
  const { socket } = useSocket();
  const queryClient = useQueryClient();

  const mutate = useCallback(({ chatId, forEveryone }: { chatId: number; forEveryone: boolean }) => {
    queryClient.setQueryData<Chat[]>(chatQueryKeys.list, (old) => {
      const updated = old ? old.filter((c) => c.id !== chatId) : [];
      if (updated) saveChats(updated); // персистируем
      return updated.length ? updated : old;
    });
    _clearUnread(queryClient, chatId);

    if (socket?.connected) {
      socket.emit('delete_chat', { chatId, forEveryone });
    } else {
      chatApi.deleteChat(chatId, forEveryone)
        .finally(() => queryClient.refetchQueries({ queryKey: chatQueryKeys.list }));
    }
  }, [socket, queryClient]);

  return { mutate };
};

// ─── useUnreadCount ───────────────────────────────────────────────────────────

export const useUnreadCount = () => {
  const { isOnline } = useNetwork();
  return useQuery({
    queryKey: chatQueryKeys.unreadCount,
    queryFn:  chatApi.getUnreadCount,
    staleTime: 30_000,
    refetchInterval: isOnline ? 30_000 : false,
    refetchIntervalInBackground: false,
    enabled: isOnline,
    placeholderData: (prev: { count: number } | undefined) => prev,
  });
};

// ─── useUnreadPerChat ─────────────────────────────────────────────────────────

export const useUnreadPerChat = () => {
  const { isOnline } = useNetwork();
  return useQuery({
    queryKey: chatQueryKeys.unreadPerChat,
    queryFn:  chatApi.getUnreadPerChat,
    staleTime: 30_000,
    refetchInterval: isOnline ? 30_000 : false,
    refetchIntervalInBackground: false,
    enabled: isOnline,
    placeholderData: (prev: UnreadPerChat[] | undefined) => prev,
  });
};

// ─── useSearchMessages ────────────────────────────────────────────────────────

export const useSearchMessages = (chatId: number, q: string) =>
  useQuery({
    queryKey: chatQueryKeys.search(chatId, q),
    queryFn:  () => chatApi.searchMessages(chatId, q),
    enabled:  q.trim().length > 1,
    staleTime: 30_000,
  });

// ─── useForwardToChat ─────────────────────────────────────────────────────────

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

function _fallbackContentType(mediaType: 'IMAGE' | 'VIDEO' | 'FILE' | 'AUDIO' | 'VOICE' | 'MUSIC'): string {
  switch (mediaType) {
    case 'IMAGE': return 'image/jpeg';
    case 'VIDEO': return 'video/mp4';
    case 'VOICE': return 'audio/wav';
    case 'AUDIO': return 'audio/wav';
    case 'MUSIC': return 'audio/mpeg';
    case 'FILE':  return 'application/octet-stream';
  }
}

const _messagesCache   = new Map<number, Message[]>();
const _pinnedCache     = new Map<number, PinnedMessage[]>();
const _joinedAt        = new Map<number, { socketId: string; ts: number }>();
const CACHE_FRESH_MS   = 30_000;

export const useChatRoom = (chatId: number, options?: { onMessageDeleted?: (messageId: number) => void }) => {
  const { socket, isConnected } = useSocket();
  const { isOnline } = useNetwork();
  const queryClient = useQueryClient();
  const { data: me } = useMe();

  const [messages,       setMessages]       = useState<Message[]>(() => _messagesCache.get(chatId) ?? []);
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>(() => _pinnedCache.get(chatId) ?? []);
  const [isLoading,      setIsLoading]      = useState(() => !_messagesCache.has(chatId));

  const socketRef      = useRef(socket);
  const meRef          = useRef(me);
  const queryClientRef = useRef(queryClient);

  useEffect(() => { socketRef.current = socket; },           [socket]);
  useEffect(() => { meRef.current = me; },                   [me]);
  useEffect(() => { queryClientRef.current = queryClient; }, [queryClient]);

  // ── JOIN — загружаем сообщения ──────────────────────────────────────────────
  useEffect(() => {
    // ОФФЛАЙН-ФОЛЛБЭК: грузим с диска если в памяти пусто
    if (!_messagesCache.has(chatId)) {
      loadMessages(chatId).then((persisted) => {
        if (persisted?.length) {
          // Фильтруем сломанные медиа — S3 presigned URLs протухают,
          // показываем только то что гарантированно откроется оффлайн
          const safe = persisted.filter(
            (m) => m.type === 'TEXT' || (m.mediaUrl != null && m.mediaUrl !== '')
          );
          if (safe.length) {
            _messagesCache.set(chatId, safe);
            setMessages(safe);
            setIsLoading(false);
          }
        }
      });
    }

    if (!socket || !isConnected || !chatId) return;

    const joined = _joinedAt.get(chatId);
    const isFresh = joined &&
      joined.socketId === socket.id &&
      Date.now() - joined.ts < CACHE_FRESH_MS;

    if (isFresh && _messagesCache.has(chatId)) {
      setIsLoading(false);
      return;
    }

    if (!_messagesCache.has(chatId)) setIsLoading(true);

    socket.emit('join_chat', { chatId }, (res: { success: boolean; messages: any[]; pinnedMessages?: PinnedMessage[] }) => {
      if (res?.success) {
        _joinedAt.set(chatId, { socketId: socket.id!, ts: Date.now() });
        const normalized = (res.messages ?? []).map(normalizeMessage);
        setMessages((prev) => {
          const existingIds = new Set(normalized.map((m) => m.id));
          const localOnly = prev.filter((m) => !existingIds.has(m.id) && m.id < 0);
          const merged = [...normalized, ...localOnly].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          if (prev.length === merged.length && prev.every((m, i) => m.id === merged[i].id)) {
            _messagesCache.set(chatId, prev);
            return prev;
          }
          _messagesCache.set(chatId, merged);
          // ── Персистируем на диск ────────────────────────────────────────────
          saveMessages(chatId, merged);
          return merged;
        });
        if (res.pinnedMessages) {
          setPinnedMessages(res.pinnedMessages);
          _pinnedCache.set(chatId, res.pinnedMessages);
        }
      }
      setIsLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, socket?.id]);

  // ── LISTENERS ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const s = socketRef.current;
    if (!s) return;

    const onNewMessage = (raw: any) => {
      if (raw.chatId !== chatId) return;
      const msg = normalizeMessage(raw);
      const senderId = raw.sender?.id ?? raw.senderId;

      let isDuplicate = false;
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) { isDuplicate = true; return prev; }
        const withoutOptimistic = prev.filter((m) => {
          if (m.id >= 0) return true;
          if (Number(m.senderId) !== Number(senderId)) return true;
          if (m.content !== (msg.content ?? null)) return true;
          return false;
        });
        const next = [...withoutOptimistic, msg];
        _messagesCache.set(chatId, next);
        saveMessages(chatId, next); // персистируем новое сообщение
        return next;
      });

      if (isDuplicate) return;
      _incrementUnread(queryClientRef.current, raw.chatId, senderId, meRef.current?.id);
      queryClientRef.current.setQueryData<Chat[]>(chatQueryKeys.list, (old) => {
        if (!old) return old;
        const updated = [...old.map((chat) =>
          chat.id !== raw.chatId ? chat : {
            ...chat,
            updatedAt: raw.createdAt,
            messages: [{ id: raw.id, content: raw.content ?? null, type: raw.type, createdAt: raw.createdAt, sender: raw.sender }],
          },
        )].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        saveChats(updated);
        return updated;
      });
    };

    const onDeleted = (data: MessageDeletedEvent) => {
      if (data.chatId !== chatId) return;
      options?.onMessageDeleted?.(data.messageId);
      setPinnedMessages((prev) => {
        const filtered = prev.filter((p) => p.messageId !== data.messageId);
        if (filtered.length !== prev.length) {
          _pinnedCache.set(chatId, filtered);
          return filtered;
        }
        return prev;
      });
      setMessages((prev) => {
        const next = prev.filter((m) => m.id !== data.messageId);
        _messagesCache.set(chatId, next);
        saveMessages(chatId, next); // персистируем удаление
        return next;
      });
      queryClientRef.current.setQueryData<Chat[]>(chatQueryKeys.list, (old) => {
        if (!old) return old;
        return old.map((chat) =>
          chat.id !== chatId ? chat : { ...chat, messages: chat.messages.filter((m) => m.id !== data.messageId) }
        );
      });
    };

    const onEdited = (raw: MessageEditedEvent) => {
      if (raw.chatId !== chatId) return;
      setMessages((prev) => {
        const next = prev.map((m) => m.id !== raw.id ? m : normalizeMessage({
          ...m, ...raw,
          forwardedFrom: raw.forwardedFrom ?? m.forwardedFrom,
          reactions:    Array.isArray(raw.reactions)    ? raw.reactions    : m.reactions,
          readReceipts: Array.isArray(raw.readReceipts) ? raw.readReceipts : m.readReceipts,
        }));
        _messagesCache.set(chatId, next);
        saveMessages(chatId, next); // персистируем редактирование
        return next;
      });
      queryClientRef.current.setQueryData<Chat[]>(chatQueryKeys.list, (old) => {
        if (!old) return old;
        return old.map((chat) =>
          chat.id !== chatId ? chat : {
            ...chat,
            messages: chat.messages.map((m) => m.id === raw.id ? { ...m, content: raw.content ?? m.content } : m),
          }
        );
      });
    };

    const onPinned = (data: MessagePinnedEvent) => {
      if (data.chatId !== chatId) return;
      setPinnedMessages(data.pinnedMessages ?? []);
      _pinnedCache.set(chatId, data.pinnedMessages ?? []);
    };
    const onUnpinned = (data: MessageUnpinnedEvent) => {
      if (data.chatId !== chatId) return;
      setPinnedMessages(data.pinnedMessages ?? []);
      _pinnedCache.set(chatId, data.pinnedMessages ?? []);
    };

    const onReaction = (data: ReactionEvent) => {
      setMessages((prev) => {
        const next = prev.map((m) => {
          if (m.id !== data.messageId) return m;
          const reactions = Array.isArray(m.reactions) ? m.reactions : [];
          if (data.action === 'added') {
            if (reactions.some((r) => r.userId === data.userId && r.emoji === data.emoji)) return m;
            return { ...m, reactions: [...reactions, { id: Date.now(), messageId: data.messageId, userId: data.userId, emoji: data.emoji }] };
          }
          return { ...m, reactions: reactions.filter((r) => !(r.userId === data.userId && r.emoji === data.emoji)) };
        });
        _messagesCache.set(chatId, next);
        saveMessages(chatId, next);
        return next;
      });
    };

    const onMessagesRead = (data: MessagesReadEvent) => {
      if (data.chatId !== chatId) return;
      if (Number(data.userId) !== Number(meRef.current?.id)) {
        _clearUnread(queryClientRef.current, data.chatId);
      }
      setMessages((prev) => {
        let changed = false;
        const next = prev.map((m) => {
          if (m.senderId === data.userId) return m;
          if (m.readReceipts.some((r) => r.userId === data.userId)) return m;
          changed = true;
          return {
            ...m,
            readReceipts: [
              ...m.readReceipts,
              { id: Date.now() + m.id, messageId: m.id, userId: data.userId, readAt: new Date().toISOString() },
            ],
          };
        });
        if (!changed) return prev;
        _messagesCache.set(chatId, next);
        return next;
      });
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

  // ── sendMessage — поддержка оффлайн-очереди ─────────────────────────────────
  const sendMessage = useCallback((content: string, replyToId?: number) => {
    if (!content.trim() && replyToId == null) return;

    const tempId = -(Date.now());
    const me = meRef.current;

    // Optimistic update — всегда, и онлайн и оффлайн
    if (me) {
      const tempMsg: Message = {
        id: tempId,
        chatId,
        senderId: me.id,
        content: content.trim(),
        type: 'TEXT',
        mediaUrl: null,
        forwardedFromId: null,
        forwardedFrom: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sender: { id: me.id, username: (me as any).username ?? '', nickName: (me as any).nickName ?? '', avatarUrl: (me as any).avatarUrl ?? null },
        reactions: [],
        readReceipts: [],
        musicTitle: null, musicArtist: null, musicCover: null, musicCoverUrl: null,
      };
      setMessages((prev) => {
        const next = [...prev, tempMsg];
        _messagesCache.set(chatId, next);
        saveMessages(chatId, next);
        return next;
      });
    }

    if (!isOnline || !socket) {
      // ── Оффлайн: кладём в очередь ───────────────────────────────────────────
      enqueueMessage({
        id: String(Math.abs(tempId)),
        chatId,
        content: content.trim(),
        ...(replyToId != null ? { replyToId } : {}),
        createdAt: new Date().toISOString(),
      });
      return;
    }

    socket.emit('send_message', { chatId, content: content.trim(), ...(replyToId != null ? { forwardedFromId: replyToId } : {}) });
  }, [socket, chatId, isOnline]);

  const sendMedia = useCallback(async (
    file: { uri: string; name: string; type: string; size?: number },
    mediaType: 'IMAGE' | 'VIDEO' | 'FILE' | 'AUDIO' | 'VOICE' | 'MUSIC',
    forwardedFromId?: number,
  ) => {
    if (!socket) return;

    const contentType = file.type || _fallbackContentType(mediaType);

    const uploadData = await new Promise<{ uploadUrl: string; key: string }>((resolve, reject) => {
      socket.emit(
        'request_upload_url',
        { chatId, filename: file.name, contentType },
        (res: any) => {
          if (res?.uploadUrl) resolve(res);
          else reject(new Error(res?.error ?? 'Не удалось получить URL для загрузки'));
        },
      );
    });

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadData.uploadUrl);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Ошибка загрузки: ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error('Network request failed'));
      xhr.send({ uri: file.uri, type: contentType, name: file.name } as any);
    });

    socket.emit('confirm_media', {
      chatId,
      key: uploadData.key,
      type: mediaType,
      ...(file.size ? { fileSize: file.size } : {}),
      ...(forwardedFromId != null ? { forwardedFromId } : {}),
    });
  }, [socket, chatId]);

  const editMessage   = useCallback((messageId: number, content: string) => {
    if (!socket || !content.trim()) return;
    socket.emit('edit_message', { chatId, messageId, content: content.trim() });
  }, [socket, chatId]);

  const deleteMessage  = useCallback((messageId: number, forEveryone: boolean) => {
    if (!socket) return;
    socket.emit('delete_message', { chatId, messageId, forEveryone });
  }, [socket, chatId]);

  const reactToMessage = useCallback((messageId: number, emoji: string) =>
    socket?.emit('react_message', { chatId, messageId, emoji }), [socket, chatId]);

  const pinMessage     = useCallback((messageId: number, forEveryone: boolean) =>
    socket?.emit('pin_message', { chatId, messageId, forEveryone }), [socket, chatId]);

  const unpinMessage   = useCallback((messageId: number) =>
    socket?.emit('unpin_message', { chatId, messageId }), [socket, chatId]);

  const markRead = useCallback(() =>
    _markReadIfNeeded(socketRef.current, chatId, messages, meRef.current?.id),
  [chatId, messages]);

  return {
    messages, pinnedMessages, setPinnedMessages, isLoading,
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

// ─── useGlobalChatListener ────────────────────────────────────────────────────

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

  const joinAllRooms = useCallback((chats?: Chat[]) => {
    const s = socketRef.current;
    if (!s?.connected) return;
    const list = chats ?? (queryClientRef.current.getQueryData<Chat[]>(chatQueryKeys.list) ?? []);
    for (const chat of list) {
      if (joinedRooms.current.has(chat.id)) continue;
      s.emit('join_chat', { chatId: chat.id }, (res: any) => {
        if (res?.success) joinedRooms.current.add(chat.id);
      });
    }
  }, []);

  useEffect(() => {
    if (!socket || !isConnected) return;
    joinedRooms.current.clear();
    queryClientRef.current
      .refetchQueries({ queryKey: chatQueryKeys.list, type: 'active' })
      .then(() => {
        const chats = queryClientRef.current.getQueryData<Chat[]>(chatQueryKeys.list);
        joinAllRooms(chats ?? []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket?.id]);

  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type === 'updated' &&
        event.query.queryKey[0] === chatQueryKeys.list[0] &&
        event.query.queryKey[1] === chatQueryKeys.list[1]
      ) {
        const chats = event.query.state.data as Chat[] | undefined;
        if (chats?.length) joinAllRooms(chats);
      }
    });
    return unsubscribe;
  }, [queryClient, joinAllRooms]);

  useEffect(() => {
    const s = socketRef.current;
    if (!s) return;

    const onNewMessage = (raw: any) => {
      const qc = queryClientRef.current;
      const chats: Chat[] | undefined = qc.getQueryData(chatQueryKeys.list);
      const chatExists = chats?.some((c) => c.id === raw.chatId);

      if (!chatExists) {
        _incrementUnread(qc, raw.chatId, raw.sender?.id ?? raw.senderId, meRef.current?.id);
        if (!joinedRooms.current.has(raw.chatId)) {
          s.emit('join_chat', { chatId: raw.chatId }, (res: any) => {
            if (res?.success) joinedRooms.current.add(raw.chatId);
            qc.refetchQueries({ queryKey: chatQueryKeys.list });
          });
        } else {
          qc.refetchQueries({ queryKey: chatQueryKeys.list });
        }
        return;
      }

      qc.setQueryData<Chat[]>(chatQueryKeys.list, (old) => {
        if (!old) return old;
        const updated = [...old.map((chat) =>
          chat.id !== raw.chatId ? chat : {
            ...chat,
            updatedAt: raw.createdAt,
            messages: [{ id: raw.id, content: raw.content ?? null, type: raw.type, createdAt: raw.createdAt, sender: raw.sender }],
          },
        )].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        saveChats(updated);
        return updated;
      });
      _incrementUnread(qc, raw.chatId, raw.sender?.id ?? raw.senderId, meRef.current?.id);
    };

    const onMessagesRead = (data: MessagesReadEvent) => {
      // Если читали МЫ сами — не сбрасываем чужие непрочитанные
      if (Number(data.userId) === Number(meRef.current?.id)) return;
      _clearUnread(queryClientRef.current, data.chatId);
    };

    const onChatDeleted = (data: ChatDeletedEvent) => {
      queryClientRef.current.setQueryData<Chat[]>(chatQueryKeys.list, (old) => {
        const updated = old ? old.filter((c) => c.id !== data.chatId) : [];
        if (updated) saveChats(updated);
        return updated;
      });
      joinedRooms.current.delete(data.chatId);
      _clearUnread(queryClientRef.current, data.chatId);
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

    const onMessageDeleted = (data: { messageId: number; chatId: number; forEveryone: boolean }) => {
      queryClientRef.current.setQueryData<Chat[]>(chatQueryKeys.list, (old) => {
        if (!old) return old;
        return old.map((chat) =>
          chat.id !== data.chatId ? chat : { ...chat, messages: chat.messages.filter((m) => m.id !== data.messageId) }
        );
      });
    };

    s.on('new_message',      onNewMessage);
    s.on('messages_read',    onMessagesRead);
    s.on('chat_deleted',     onChatDeleted);
    s.on('user_typing',      onTyping);
    s.on('user_stop_typing', onStopTyping);
    s.on('message_deleted',  onMessageDeleted);

    return () => {
      s.off('new_message',      onNewMessage);
      s.off('messages_read',    onMessagesRead);
      s.off('chat_deleted',     onChatDeleted);
      s.off('user_typing',      onTyping);
      s.off('user_stop_typing', onStopTyping);
      s.off('message_deleted',  onMessageDeleted);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket?.id]);

  useEffect(() => {
    const s = socketRef.current;
    if (!s) return;

    const onNewChat = (data?: { chatId?: number }) => {
      const qc = queryClientRef.current;
      const chatId = data?.chatId;

      if (chatId) {
        joinedRooms.current.delete(chatId);
        s.emit('join_chat', { chatId }, (res: any) => {
          if (res?.success) joinedRooms.current.add(chatId);
          qc.refetchQueries({ queryKey: chatQueryKeys.list });
          qc.refetchQueries({ queryKey: chatQueryKeys.unreadPerChat });
          qc.refetchQueries({ queryKey: chatQueryKeys.unreadCount });
        });
      } else {
        qc.refetchQueries({ queryKey: chatQueryKeys.list });
        qc.refetchQueries({ queryKey: chatQueryKeys.unreadPerChat });
        qc.refetchQueries({ queryKey: chatQueryKeys.unreadCount });
      }
    };

    s.on('new_chat', onNewChat);
    return () => { s.off('new_chat', onNewChat); };
  }, [socket?.id]);

  useEffect(() => {
    if (!isConnected) joinedRooms.current.clear();
  }, [isConnected]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        const s = socketRef.current;
        if (!s?.connected) {
          queryClientRef.current.refetchQueries({ queryKey: chatQueryKeys.list });
        }
        joinAllRooms();
      }
    });
    return () => sub.remove();
  }, [joinAllRooms]);

  useEffect(() => {
    joinAllRooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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