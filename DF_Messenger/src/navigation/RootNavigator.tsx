import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors } from '../styles/colors';
import { AppStackParamList, AuthStackParamList } from './types';

import KeyScreen from '../screens/KeyScreen';
import LoginScreen from '../screens/LoginScreen';
import MainNavigator from './MainNavigator';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

const RootNavigator = () => {
  const { authState } = useAuth();

  if (authState === 'loading') {
    return <View style={styles.splash} />;
  }

  return (
    <NavigationContainer>
      {authState === 'authenticated' ? (
        <AppStack.Navigator
          screenOptions={{ headerShown: false, animation: 'fade' }}
        >
          <AppStack.Screen name="MainScreen" component={MainNavigator} />
        </AppStack.Navigator>
      ) : (
        <AuthStack.Navigator
          screenOptions={{ headerShown: false, animation: 'fade' }}
        >
          <AuthStack.Screen name="KeyLoginScreen" component={KeyScreen} />
          <AuthStack.Screen name="LoginScreen" component={LoginScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.background,
  },
});

export default RootNavigator;
