import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '@env';
import { getTokens } from '../api/client';
import { useAuth } from './AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { authState } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (authState !== 'authenticated') {
      // Если разлогинились — отключаем сокет
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    const connect = async () => {
      const tokens = await getTokens();
      if (!tokens?.accessToken) return;

      const socket = io(API_BASE_URL, {
        transports: ['websocket'],
        auth: { token: tokens.accessToken },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        setIsConnected(true);
        console.log('[Socket] подключён:', socket.id);
      });

      socket.on('disconnect', () => {
        setIsConnected(false);
        console.log('[Socket] отключён');
      });

      socket.on('connect_error', (err) => {
        console.warn('[Socket] ошибка подключения:', err.message);
      });
    };

    connect();

    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [authState]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useSocket = () => useContext(SocketContext);