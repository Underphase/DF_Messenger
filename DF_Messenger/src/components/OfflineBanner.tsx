/**
 * OfflineBanner.tsx
 * Полоска сверху списка чатов и внутри чата когда нет интернета.
 * Показывает статус "оффлайн" и "синхронизация..." при восстановлении.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useNetwork } from '../context/NetworkContext';
import { colors } from '../styles/colors';

export const OfflineBanner: React.FC = () => {
  const { isOnline, justReconnected } = useNetwork();
  const slideY = useRef(new Animated.Value(-40)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const shouldShow = !isOnline || justReconnected;

  useEffect(() => {
    if (shouldShow) {
      Animated.parallel([
        Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY, { toValue: -40, duration: 250, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [shouldShow]);

  if (!shouldShow) return null;

  const isReconnecting = justReconnected && isOnline;

  return (
    <Animated.View
      style={[
        s.banner,
        isReconnecting ? s.bannerSync : s.bannerOffline,
        { transform: [{ translateY: slideY }], opacity },
      ]}
    >
      <View style={[s.dot, isReconnecting ? s.dotSync : s.dotOffline]} />
      <Text style={s.text}>
        {isReconnecting ? 'Синхронизация...' : 'Нет подключения · показаны кешированные данные'}
      </Text>
    </Animated.View>
  );
};

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  bannerOffline: {
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 107, 107, 0.3)',
  },
  bannerSync: {
    backgroundColor: `${colors.accent}22`,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.accent}40`,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  dotOffline: { backgroundColor: '#ff6b6b' },
  dotSync: { backgroundColor: colors.accent },
  text: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
    flexShrink: 1,
  },
});