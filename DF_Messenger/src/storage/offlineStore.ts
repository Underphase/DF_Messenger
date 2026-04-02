/**
 * offlineStore.ts
 * Персистентное хранилище для оффлайн-режима.
 * Использует AsyncStorage — уже установлен, нативная сборка не нужна.
 *
 * Ключи:
 *   offline:chats          → Chat[]
 *   offline:messages:{id}  → Message[]
 *   offline:me             → UserMe
 *   offline:friends        → Friend[]
 *   offline:queue          → QueuedMessage[]
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Chat, Message } from '../api/chat.types';
import { Friend } from '../api/friends.types';

// ─── Типы ─────────────────────────────────────────────────────────────────────

export interface QueuedMessage {
  id: string;           // uuid — локальный id для дедупликации
  chatId: number;
  content: string;
  replyToId?: number;
  createdAt: string;    // ISO — для сортировки в UI
}

// ─── Ключи ────────────────────────────────────────────────────────────────────

const KEY = {
  chats:    'offline:chats',
  messages: (chatId: number) => `offline:messages:${chatId}`,
  me:       'offline:me',
  friends:  'offline:friends',
  queue:    'offline:queue',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function read<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function write(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // AsyncStorage может упасть при заполненном хранилище — молча игнорируем
  }
}

// ─── Чаты ─────────────────────────────────────────────────────────────────────

/** Сохранить список чатов на диск */
export const saveChats = (chats: Chat[]) => write(KEY.chats, chats);

/** Загрузить список чатов с диска */
export const loadChats = () => read<Chat[]>(KEY.chats);

// ─── Сообщения ────────────────────────────────────────────────────────────────

/** Сохранить сообщения чата (кладём только последние MAX_MESSAGES штук) */
const MAX_MESSAGES = 200;

export const saveMessages = (chatId: number, messages: Message[]) => {
  const toSave = messages
    // Не сохраняем optimistic-сообщения (id < 0) — они ещё не на сервере
    .filter((m) => m.id >= 0)
    // Не сохраняем медиа без URL — при загрузке с диска они будут сломаны
    .filter((m) => m.type === 'TEXT' || (m.mediaUrl != null && m.mediaUrl !== ''))
    .slice(-MAX_MESSAGES);
  return write(KEY.messages(chatId), toSave);
};

/** Загрузить сообщения чата с диска */
export const loadMessages = (chatId: number) =>
  read<Message[]>(KEY.messages(chatId));

// ─── Профиль ──────────────────────────────────────────────────────────────────

export const saveMe = (me: unknown) => write(KEY.me, me);
export const loadMe = <T>() => read<T>(KEY.me);

// ─── Друзья ───────────────────────────────────────────────────────────────────

export const saveFriends = (friends: Friend[]) => write(KEY.friends, friends);
export const loadFriends = () => read<Friend[]>(KEY.friends);

// ─── Очередь исходящих сообщений ─────────────────────────────────────────────

export const loadQueue = () => read<QueuedMessage[]>(KEY.queue);

export const enqueueMessage = async (msg: QueuedMessage): Promise<void> => {
  const current = (await loadQueue()) ?? [];
  // Не добавляем дубликаты
  if (current.some((m) => m.id === msg.id)) return;
  await write(KEY.queue, [...current, msg]);
};

export const removeFromQueue = async (msgId: string): Promise<void> => {
  const current = (await loadQueue()) ?? [];
  await write(KEY.queue, current.filter((m) => m.id !== msgId));
};

export const clearQueue = async (): Promise<void> => {
  await write(KEY.queue, []);
};