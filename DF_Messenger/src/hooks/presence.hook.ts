import { useEffect, useRef, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useMe } from './user.hook';

// ─── Регистрация себя как онлайн ──────────────────────────────────────────────

/**
 * Вызывай этот хук ОДИН РАЗ в корневом компоненте после логина
 * (например в MainNavigator).
 * Он отправляет setOnline на сервер и переотправляет при реконнекте.
 */
export const useRegisterPresence = () => {
  const { socket, isConnected } = useSocket();
  const { data: me } = useMe();

  useEffect(() => {
    if (!socket || !isConnected || !me?.id) return;

    socket.emit('setOnline', { userId: me.id });

    // При реконнекте socket.io сам восстановит соединение,
    // но нужно переотправить setOnline
    const handleReconnect = () => {
      socket.emit('setOnline', { userId: me.id });
    };

    socket.on('connect', handleReconnect);

    return () => {
      socket.off('connect', handleReconnect);
    };
  }, [socket, isConnected, me?.id]);
};

// ─── Слушать онлайн-статус конкретного пользователя ──────────────────────────

/**
 * Возвращает { isOnline } для заданного userId.
 * Сначала запрашивает начальный статус через getOnlineStatus,
 * затем слушает события userOnline / userOffline в реальном времени.
 */
export const useUserOnlineStatus = (userId: number | undefined) => {
  const { socket, isConnected } = useSocket();
  const [isOnline, setIsOnline] = useState(false);
  const resolvedRef = useRef(false);

  useEffect(() => {
    if (!socket || !isConnected || !userId) {
      setIsOnline(false);
      return;
    }

    resolvedRef.current = false;

    // Запрашиваем начальный статус (ack-ответ от сервера)
    socket.emit(
      'getOnlineStatus',
      { userId },
      (response: { userId: number; isOnline: boolean }) => {
        if (!resolvedRef.current) {
          setIsOnline(response.isOnline);
          resolvedRef.current = true;
        }
      },
    );

    const handleOnline = (data: { userId: number }) => {
      if (data.userId === userId) setIsOnline(true);
    };

    const handleOffline = (data: { userId: number }) => {
      if (data.userId === userId) setIsOnline(false);
    };

    socket.on('userOnline', handleOnline);
    socket.on('userOffline', handleOffline);

    return () => {
      socket.off('userOnline', handleOnline);
      socket.off('userOffline', handleOffline);
    };
  }, [socket, isConnected, userId]);

  return { isOnline };
};