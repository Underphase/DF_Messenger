/**
 * offlineQueue.hook.ts
 * Очередь исходящих сообщений — отправляет накопленное когда появляется инет.
 *
 * Вешается один раз в корне приложения (см. App.tsx).
 * Использует socket из SocketContext — так же как sendMessage в chat.hook.ts.
 */

import { useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { useNetwork } from '../context/NetworkContext';
import {
  loadQueue,
  removeFromQueue,
  QueuedMessage,
} from '../storage/offlineStore';

export const useOfflineQueue = () => {
  const { socket, isConnected } = useSocket();
  const { isOnline, justReconnected } = useNetwork();
  const isFlushing = useRef(false);

  const flushQueue = async () => {
    if (isFlushing.current) return;
    if (!socket || !isConnected) return;

    const queue = await loadQueue();
    if (!queue?.length) return;

    isFlushing.current = true;
    try {
      for (const msg of queue) {
        await sendQueuedMessage(socket, msg);
      }
    } finally {
      isFlushing.current = false;
    }
  };

  // Отправляем очередь при восстановлении соединения
  useEffect(() => {
    if (justReconnected && isConnected) {
      flushQueue();
    }
  }, [justReconnected, isConnected]);

  // Также пробуем отправить сразу после подключения сокета
  useEffect(() => {
    if (isConnected && isOnline) {
      flushQueue();
    }
  }, [isConnected]);
};

async function sendQueuedMessage(socket: any, msg: QueuedMessage): Promise<void> {
  return new Promise((resolve) => {
    // Таймаут — если сокет не ответил за 5с, оставляем в очереди
    const timer = setTimeout(resolve, 5_000);

    socket.emit(
      'send_message',
      {
        chatId: msg.chatId,
        content: msg.content,
        ...(msg.replyToId != null ? { forwardedFromId: msg.replyToId } : {}),
      },
      (ack: any) => {
        clearTimeout(timer);
        if (ack?.success !== false) {
          // Успешно — удаляем из очереди
          removeFromQueue(msg.id).then(resolve);
        } else {
          resolve(); // Оставляем в очереди при явной ошибке
        }
      },
    );
  });
}