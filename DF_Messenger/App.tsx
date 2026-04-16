import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './src/context/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';
import { SocketProvider } from './src/context/SocketContext';
import { GlobalPlayerProvider } from './src/context/GlobalPlayerContext';
import { NetworkProvider } from './src/context/NetworkContext';
import { useOfflineQueue } from './src/hooks/offlineQueue.hook';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 0 },
    mutations: { retry: 1 },
  },
});

const AppInner: React.FC = () => {
  useOfflineQueue();
  return <RootNavigator />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <NetworkProvider>
      <AuthProvider>
        <SocketProvider>
          <GlobalPlayerProvider>
            <AppInner />
          </GlobalPlayerProvider>
        </SocketProvider>
      </AuthProvider>
    </NetworkProvider>
  </QueryClientProvider>
);

export default App;