import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getTokens, clearTokens } from '../api/client';
import { registerDeviceToken, unregisterDeviceToken } from '../services/notifications';

type AuthState = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextType {
  authState: AuthState;
  signIn: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  authState: 'loading',
  signIn: () => {},
  signOut: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>('loading');

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const tokens = await getTokens();
        if (tokens?.accessToken && tokens?.refreshToken) {
          setAuthState('authenticated');
          // Уже залогинен — регистрируем токен
          await registerDeviceToken();
        } else {
          setAuthState('unauthenticated');
        }
      } catch {
        setAuthState('unauthenticated');
      }
    };
    bootstrap();
  }, []);

  const signIn = useCallback(() => {
    setAuthState('authenticated');
    setTimeout(() => registerDeviceToken(), 500);
  }, []);

  const signOut = useCallback(async () => {
    // Удаляем токен с бэка перед выходом
    await unregisterDeviceToken();
    await clearTokens();
    setAuthState('unauthenticated');
  }, []);

  return (
    <AuthContext.Provider value={{ authState, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);