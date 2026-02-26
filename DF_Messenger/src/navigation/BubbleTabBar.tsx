import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors } from '../styles/colors';

const TAB_ICONS: Record<string, string> = {
  Chats: 'message-circle',
  Friends: 'users',
  Profile: 'user',
};

const TAB_LABELS: Record<string, string> = {
  Chats: 'Чаты',
  Friends: 'Друзья',
  Profile: 'Профиль',
};

// ─── Single tab item ──────────────────────────────────────────────────────────

interface TabItemProps {
  name: string;
  focused: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

const TabItem: React.FC<TabItemProps> = ({ name, focused, onPress, onLongPress }) => {
  return (
    <TouchableOpacity
      style={[styles.tabItem, focused && styles.tabItemFocused]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      <Icon
        name={TAB_ICONS[name]}
        size={20}
        color={focused ? colors.text : colors.primary + '60'}
      />
      <Text style={[styles.tabLabel, focused && styles.tabLabelFocused]}>
        {TAB_LABELS[name]}
      </Text>
    </TouchableOpacity>
  );
};

// ─── Tab bar ──────────────────────────────────────────────────────────────────

const BubbleTabBar: React.FC<BottomTabBarProps> = ({ state, descriptors, navigation }) => {
  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <View style={styles.container}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          return (
            <TabItem
              key={route.key}
              name={route.name}
              focused={focused}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          );
        })}
      </View>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondary + 'EE',
    borderRadius: 28,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.primary + '18',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 3,
  },
  tabItemFocused: {
    backgroundColor: colors.accent,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.primary + '60',
  },
  tabLabelFocused: {
    color: colors.text,
    fontWeight: '700',
  },
});

export default BubbleTabBar;