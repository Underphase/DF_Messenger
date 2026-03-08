import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { ProfileStack } from '../screens/main/ProfileScreen';
import BubbleTabBar from './BubbleTabBar';
import { ChatsStack } from './ChatsStack';
import { SearchStack } from './SearchStack';
import { useRegisterPresence } from '../hooks/presence.hook';
import { useGlobalChatListener } from '../hooks/chat.hook';
import { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

// Mount global listeners here (presence + live chat list refresh)
const GlobalListeners = () => {
  useRegisterPresence();
  useGlobalChatListener();
  return null;
};

const MainNavigator = () => {
  return (
    <>
      <GlobalListeners />
      <Tab.Navigator
        tabBar={(props) => <BubbleTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tab.Screen name="Chats" component={ChatsStack} />
        <Tab.Screen name="Friends" component={SearchStack} />
        <Tab.Screen name="Profile" component={ProfileStack} />
      </Tab.Navigator>
    </>
  );
};

export default MainNavigator;