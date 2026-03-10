import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '@env';
import { getTokens } from '../api/client';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
});

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authState } = useAuth();
  // ВАЖНО: socket хранится в useState, а не только в ref
  // Только useState триггерит ре-рендер потребителей контекста
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (authState !== 'authenticated') {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    const connect = async () => {
      const tokens = await getTokens();
      if (!tokens?.accessToken) return;

      const s = io(API_BASE_URL, {
        transports: ['websocket'],
        auth: { token: tokens.accessToken },
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
      });

      socketRef.current = s;

      s.on('connect', () => {
        console.log('[Socket] подключён:', s.id);
        setIsConnected(true);
        setSocket(s); // ← это ключевое: обновляем state → все потребители получают сокет
      });

      s.on('disconnect', () => {
        console.log('[Socket] отключён');
        setIsConnected(false);
      });

      s.on('connect_error', (err) => {
        console.warn('[Socket] ошибка:', err.message);
      });
    };

    connect();

    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
    };
  }, [authState]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);