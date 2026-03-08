import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ChatsStackParamList } from './types';
import ChatsScreen from '../screens/chat/ChatsScreen';

const Stack = createNativeStackNavigator<ChatsStackParamList>();

// ChatScreen lives in AppStack (RootNavigator) so the tab bar hides automatically
export const ChatsStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="ChatsScreen" component={ChatsScreen} />
  </Stack.Navigator>
);