import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import ChatsScreen from '../screens/main/ChatsScreen';
import { ProfileStack } from '../screens/main/ProfileScreen';
import BubbleTabBar from './BubbleTabBar';
import { SearchStack } from './SearchStack';
import { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

const MainNavigator = () => {
  return (
    <Tab.Navigator
      tabBar={props => <BubbleTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Chats" component={ChatsScreen} />
      <Tab.Screen name="Friends" component={SearchStack} />
      <Tab.Screen name="Profile" component={ProfileStack} />
    </Tab.Navigator>
  );
};

export default MainNavigator;