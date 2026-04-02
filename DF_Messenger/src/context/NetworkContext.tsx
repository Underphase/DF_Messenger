/**
 * NetworkContext.tsx
 * Глобальный детектор сетевого подключения.
 *
 * Установи пакет: npm install @react-native-community/netinfo
 * iOS: cd ios && pod install
 * Android: ничего дополнительно не нужно
 *
 * Использование:
 *   const { isOnline } = useNetwork();
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

interface NetworkContextType {
  isOnline: boolean;
  /** Был ли только что восстановлен интернет (сбрасывается через 3с) */
  justReconnected: boolean;
}

const NetworkContext = createContext<NetworkContextType>({
  isOnline: true,
  justReconnected: false,
});

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState(true);
  const [justReconnected, setJustReconnected] = useState(false);

  const prevOnline = useRef(true);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback((state: NetInfoState) => {
    const online = !!(state.isConnected && state.isInternetReachable !== false);

    setIsOnline(online);

    // Флаг "только что восстановлено" — нужен для триггера синхронизации
    if (online && !prevOnline.current) {
      setJustReconnected(true);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => setJustReconnected(false), 3_000);
    }

    prevOnline.current = online;
  }, []);

  useEffect(() => {
    // Сразу проверяем текущее состояние
    NetInfo.fetch().then(handleChange);

    // Подписываемся на изменения
    const unsubscribe = NetInfo.addEventListener(handleChange);
    return () => {
      unsubscribe();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [handleChange]);

  return (
    <NetworkContext.Provider value={{ isOnline, justReconnected }}>
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = () => useContext(NetworkContext);