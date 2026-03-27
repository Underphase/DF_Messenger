import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './src/context/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';
import { SocketProvider } from './src/context/SocketContext'
import { GlobalPlayerProvider } from './src/context/GlobalPlayerContext'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 0 },
    mutations: { retry: 1 },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <SocketProvider>
        <GlobalPlayerProvider>
          <RootNavigator />
        </GlobalPlayerProvider>
      </SocketProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;