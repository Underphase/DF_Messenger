import { useNavigation } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useLogout, useMe } from '../hooks/user.hook';
import BlockedUsersScreen from '../screens/friends/BlockedUsersScreen';
import ChangeEmailScreen from '../screens/settings/ChangeEmailScreen';
import ChangePasswordScreen from '../screens/settings/ChangePasswordScreen';
import EditProfileScreen from '../screens/settings/EditProfileScreen';
import { colors } from '../styles/colors';
import { SettingsStackParamList } from './types';

// ─── Settings stack (nested inside Profile tab) ───────────────────────────────

const Stack = createNativeStackNavigator<SettingsStackParamList>();

const ProfileHome = () => {
  const { data: user, isLoading } = useMe();
  const { mutate: logout, isPending: isLoggingOut } = useLogout();
  const navigation =
    useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();

  // Entrance animations
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(30)).current;
  const avatarScale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideUp, {
        toValue: 0,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(avatarScale, {
        toValue: 1,
        friction: 7,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const initials = user
    ? user.nickName
        .split(' ')
        .map(w => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '?';

  const joinedDate = user
    ? new Date(user.createdAt).toLocaleDateString('ru-RU', {
        month: 'long',
        year: 'numeric',
      })
    : '';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header card ── */}
      <Animated.View
        style={[
          styles.headerCard,
          { opacity: fadeIn, transform: [{ translateY: slideUp }] },
        ]}
      >
        {/* Avatar */}
        <Animated.View
          style={[
            styles.avatarWrapper,
            { transform: [{ scale: avatarScale }] },
          ]}
        >
          {user?.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
        </Animated.View>

        {/* Name & username */}
        <Text style={styles.nickName}>{user?.nickName}</Text>
        <Text style={styles.username}>@{user?.username}</Text>

        {/* Description */}
        {user?.description ? (
          <Text style={styles.description}>{user.description}</Text>
        ) : (
          <Text style={styles.descriptionEmpty}>Нет описания</Text>
        )}

        {/* Joined */}
        <View style={styles.joinedRow}>
          <Icon name="calendar" size={13} color={colors.primary + '80'} />
          <Text style={styles.joinedText}>С нами с {joinedDate}</Text>
        </View>
      </Animated.View>

      {/* ── Info row ── */}
      <Animated.View style={[styles.infoRow, { opacity: fadeIn }]}>
        <View style={styles.infoItem}>
          <Icon name="mail" size={16} color={colors.accent} />
          <Text style={styles.infoText} numberOfLines={1}>
            {user?.email}
          </Text>
        </View>
      </Animated.View>

      {/* ── Action buttons ── */}
      <Animated.View
        style={[
          styles.actionsContainer,
          { opacity: fadeIn, transform: [{ translateY: slideUp }] },
        ]}
      >
        <Text style={styles.sectionLabel}>Настройки</Text>

        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => navigation.navigate('EditProfileScreen')}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.actionIcon,
              { backgroundColor: colors.accent + '25' },
            ]}
          >
            <Icon name="edit-2" size={18} color={colors.accent} />
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Редактировать профиль</Text>
            <Text style={styles.actionSubtitle}>Имя, никнейм, описание</Text>
          </View>
          <Icon name="chevron-right" size={18} color={colors.primary + '50'} />
        </TouchableOpacity>

        <View style={styles.separator} />

        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => navigation.navigate('ChangeEmailScreen')}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.actionIcon,
              { backgroundColor: colors.primary + '20' },
            ]}
          >
            <Icon name="mail" size={18} color={colors.primary} />
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Сменить email</Text>
            <Text style={styles.actionSubtitle}>{user?.email}</Text>
          </View>
          <Icon name="chevron-right" size={18} color={colors.primary + '50'} />
        </TouchableOpacity>

        <View style={styles.separator} />

        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => navigation.navigate('ChangePasswordScreen')}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.actionIcon,
              { backgroundColor: colors.secondary + '50' },
            ]}
          >
            <Icon name="lock" size={18} color={colors.primary} />
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Сменить пароль</Text>
            <Text style={styles.actionSubtitle}>
              Изменить пароль от аккаунта
            </Text>
          </View>
          <Icon name="chevron-right" size={18} color={colors.primary + '50'} />
        </TouchableOpacity>

        <View style={styles.separator} />

        {/* ── Заблокированные (НОВОЕ) ── */}
        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => navigation.navigate('BlockedUsersScreen')}
          activeOpacity={0.7}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#ff6b6b15' }]}>
            <Icon name="slash" size={18} color="#ff6b6b" />
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Заблокированные</Text>
            <Text style={styles.actionSubtitle}>Управление блокировками</Text>
          </View>
          <Icon name="chevron-right" size={18} color={colors.primary + '50'} />
        </TouchableOpacity>
      </Animated.View>

      {/* ── Logout ── */}
      <Animated.View style={{ opacity: fadeIn }}>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => logout()}
          disabled={isLoggingOut}
          activeOpacity={0.8}
        >
          {isLoggingOut ? (
            <ActivityIndicator color="#ff6b6b" size="small" />
          ) : (
            <>
              <Icon
                name="log-out"
                size={18}
                color="#ff6b6b"
                style={{ marginRight: 10 }}
              />
              <Text style={styles.logoutText}>Выйти из аккаунта</Text>
            </>
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* Bottom padding for floating tab bar */}
      <View style={{ height: 100 }} />
    </ScrollView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Header card
  headerCard: {
    alignItems: 'center',
    backgroundColor: colors.secondary + '25',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.primary + '15',
    paddingVertical: 32,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  avatarWrapper: {
    marginBottom: 16,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: colors.accent + '60',
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.secondary + '60',
    borderWidth: 3,
    borderColor: colors.accent + '40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 1,
  },
  nickName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  username: {
    fontSize: 15,
    color: colors.accent,
    fontWeight: '600',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: colors.primary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  descriptionEmpty: {
    fontSize: 14,
    color: colors.primary + '50',
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  joinedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  joinedText: {
    fontSize: 13,
    color: colors.primary + '70',
    fontWeight: '500',
  },

  // Info row
  infoRow: {
    backgroundColor: colors.secondary + '20',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.primary + '15',
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },

  // Actions
  actionsContainer: {
    backgroundColor: colors.secondary + '25',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primary + '15',
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary + '60',
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 14,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  actionSubtitle: {
    fontSize: 13,
    color: colors.primary + '70',
  },
  separator: {
    height: 1,
    backgroundColor: colors.primary + '10',
    marginLeft: 70,
    marginRight: 16,
  },

  // Logout
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff6b6b15',
    borderWidth: 1.5,
    borderColor: '#ff6b6b40',
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 8,
  },
  logoutText: {
    color: '#ff6b6b',
    fontSize: 16,
    fontWeight: '700',
  },
});

// ─── Settings stack (exported for MainNavigator) ──────────────────────────────

export const ProfileStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="SettingsScreen" component={ProfileHome} />
    <Stack.Screen name="EditProfileScreen" component={EditProfileScreen} />
    <Stack.Screen name="ChangeEmailScreen" component={ChangeEmailScreen} />
    <Stack.Screen
      name="ChangePasswordScreen"
      component={ChangePasswordScreen}
    />
    <Stack.Screen name="BlockedUsersScreen" component={BlockedUsersScreen} />
  </Stack.Navigator>
);

export default ProfileHome;
