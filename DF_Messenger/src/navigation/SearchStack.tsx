import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SearchStackParamList } from './types';
import SearchScreen from '../screens/main/SearchScreen';
import FriendRequestsScreen from '../screens/friends/FriendRequestsScreen';
import UserProfileScreen from '../screens/friends/UserProfileScreen';

const Stack = createNativeStackNavigator<SearchStackParamList>();

export const SearchStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="SearchScreen"        component={SearchScreen} />
    <Stack.Screen name="FriendRequestsScreen" component={FriendRequestsScreen} />
    <Stack.Screen
      name="UserProfileScreen"
      component={UserProfileScreen}
      options={{
        animation: 'slide_from_right', // нативный слайд как обычный экран
      }}
    />
  </Stack.Navigator>
);