import React, { useRef, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { colors } from '../../styles/colors';
import { SearchUser } from '../../api/friends.types';
import {
  useRelationshipStatus,
  useSendFriendRequest,
  useCancelFriendRequest,
  useRemoveFriend,
  useBlockUser,
  useUnblockUser,
  useRespondFriendRequest,
  useMutualFriends,
} from '../../hooks/friends.hook';

// Добавь в SearchStackParamList:
// UserProfileScreen: { user: SearchUser }

type RouteParams = {
  UserProfileScreen: { user: SearchUser };
};

const UserProfileScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'UserProfileScreen'>>();
  const { user } = route.params;

  // ── Animations ────────────────────────────────────────────────────────────────
  const fadeIn      = useRef(new Animated.Value(0)).current;
  const slideUp     = useRef(new Animated.Value(40)).current;
  const avatarScale = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, {
        toValue: 1, duration: 500, useNativeDriver: true,
      }),
      Animated.timing(slideUp, {
        toValue: 0, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
      Animated.spring(avatarScale, {
        toValue: 1, friction: 7, tension: 50, useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // ── Data ──────────────────────────────────────────────────────────────────────
  const { data: status, isLoading: statusLoading } = useRelationshipStatus(user.id);
  const { data: mutuals }                          = useMutualFriends(user.id);

  const { mutate: sendRequest,    isPending: isSending    } = useSendFriendRequest();
  const { mutate: cancelRequest,  isPending: isCanceling  } = useCancelFriendRequest();
  const { mutate: removeFriend,   isPending: isRemoving   } = useRemoveFriend();
  const { mutate: blockUser,      isPending: isBlocking   } = useBlockUser();
  const { mutate: unblockUser,    isPending: isUnblocking } = useUnblockUser();
  const { mutate: respondRequest, isPending: isResponding } = useRespondFriendRequest();

  const initials = user.nickName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleRemoveFriend = () => {
    Alert.alert('Удалить из друзей', `Удалить @${user.username} из друзей?`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeFriend(user.id) },
    ]);
  };

  const handleBlock = () => {
    Alert.alert(
      'Заблокировать',
      `Заблокировать @${user.username}? Он не сможет найти вас в поиске.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Заблокировать',
          style: 'destructive',
          onPress: () => {
            blockUser(user.id);
            navigation.goBack();
          },
        },
      ],
    );
  };

  // ── Main action button ────────────────────────────────────────────────────────
  const renderMainAction = () => {
    if (statusLoading)
      return (
        <View style={[styles.mainBtn, { opacity: 0.5 }]}>
          <ActivityIndicator color={colors.text} />
        </View>
      );

    switch (status) {
      case 'BLOCKED_BY_ME':
        return (
          <TouchableOpacity
            style={[styles.mainBtn, styles.dangerOutline]}
            onPress={() => unblockUser(user.id)}
            disabled={isUnblocking}
            activeOpacity={0.8}
          >
            {isUnblocking
              ? <ActivityIndicator color="#ff6b6b" />
              : <>
                  <Icon name="slash" size={18} color="#ff6b6b" />
                  <Text style={[styles.mainBtnText, { color: '#ff6b6b' }]}>Разблокировать</Text>
                </>}
          </TouchableOpacity>
        );

      case 'BLOCKED_BY_THEM':
        return (
          <View style={[styles.mainBtn, styles.disabledBtn]}>
            <Icon name="lock" size={18} color={colors.primary + '60'} />
            <Text style={[styles.mainBtnText, { color: colors.primary + '60' }]}>Недоступно</Text>
          </View>
        );

      case 'FRIENDS':
        return (
          <TouchableOpacity
            style={[styles.mainBtn, styles.friendsBtn]}
            onPress={handleRemoveFriend}
            disabled={isRemoving}
            activeOpacity={0.8}
          >
            {isRemoving
              ? <ActivityIndicator color={colors.accent} />
              : <>
                  <Icon name="user-check" size={18} color={colors.accent} />
                  <Text style={[styles.mainBtnText, { color: colors.accent }]}>Вы друзья</Text>
                </>}
          </TouchableOpacity>
        );

      case 'REQUEST_SENT':
        return (
          <TouchableOpacity
            style={[styles.mainBtn, styles.cancelBtn]}
            onPress={() => cancelRequest({ requestId: user.id, targetId: user.id })}
            disabled={isCanceling}
            activeOpacity={0.8}
          >
            {isCanceling
              ? <ActivityIndicator color="#ff6b6b" />
              : <>
                  <Icon name="x-circle" size={18} color="#ff6b6b" />
                  <Text style={[styles.mainBtnText, { color: '#ff6b6b' }]}>Отменить запрос</Text>
                </>}
          </TouchableOpacity>
        );

      case 'REQUEST_RECEIVED':
        return (
          <View style={styles.respondRow}>
            <TouchableOpacity
              style={[styles.mainBtn, styles.acceptBtn, { flex: 1 }]}
              onPress={() =>
                respondRequest({ friendshipId: user.id, action: 'ACCEPTED', targetId: user.id })
              }
              disabled={isResponding}
              activeOpacity={0.8}
            >
              {isResponding
                ? <ActivityIndicator color={colors.text} />
                : <>
                    <Icon name="check" size={18} color={colors.text} />
                    <Text style={styles.mainBtnText}>Принять</Text>
                  </>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.mainBtn, styles.declineBtn, { flex: 1 }]}
              onPress={() =>
                respondRequest({ friendshipId: user.id, action: 'DECLINED', targetId: user.id })
              }
              disabled={isResponding}
              activeOpacity={0.8}
            >
              <Icon name="x" size={18} color={colors.primary} />
              <Text style={[styles.mainBtnText, { color: colors.primary }]}>Отклонить</Text>
            </TouchableOpacity>
          </View>
        );

      default: // NONE
        return (
          <TouchableOpacity
            style={[styles.mainBtn, styles.addBtn]}
            onPress={() => sendRequest(user.id)}
            disabled={isSending}
            activeOpacity={0.8}
          >
            {isSending
              ? <ActivityIndicator color={colors.text} />
              : <>
                  <Icon name="user-plus" size={18} color={colors.text} />
                  <Text style={styles.mainBtnText}>Добавить в друзья</Text>
                </>}
          </TouchableOpacity>
        );
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>@{user.username}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar */}
        <Animated.View
          style={[styles.avatarSection, { opacity: fadeIn, transform: [{ scale: avatarScale }] }]}
        >
          {user.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
        </Animated.View>

        {/* Name */}
        <Animated.View style={[styles.nameSection, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>
          <Text style={styles.nickName}>{user.nickName}</Text>
          <Text style={styles.username}>@{user.username}</Text>
          {user.description
            ? <Text style={styles.description}>{user.description}</Text>
            : <Text style={styles.descriptionEmpty}>Нет описания</Text>}
        </Animated.View>

        {/* Mutual friends */}
        {mutuals && mutuals.length > 0 && (
          <Animated.View style={[styles.mutualCard, { opacity: fadeIn }]}>
            <View style={styles.mutualAvatars}>
              {mutuals.slice(0, 4).map((m, i) => (
                <View
                  key={m.id}
                  style={[styles.mutualAvatar, { marginLeft: i > 0 ? -10 : 0, zIndex: 4 - i }]}
                >
                  {m.avatarUrl
                    ? <Image source={{ uri: m.avatarUrl }} style={styles.mutualAvatarImg} />
                    : (
                      <View style={styles.mutualAvatarPlaceholder}>
                        <Text style={styles.mutualAvatarText}>{m.nickName[0].toUpperCase()}</Text>
                      </View>
                    )}
                </View>
              ))}
            </View>
            <View style={styles.mutualInfo}>
              <Text style={styles.mutualTitle}>
                {mutuals.length} общих {mutuals.length === 1 ? 'друг' : mutuals.length < 5 ? 'друга' : 'друзей'}
              </Text>
              {mutuals.length > 0 && (
                <Text style={styles.mutualNames} numberOfLines={1}>
                  {mutuals.slice(0, 2).map(m => m.nickName).join(', ')}
                  {mutuals.length > 2 ? ` и ещё ${mutuals.length - 2}` : ''}
                </Text>
              )}
            </View>
          </Animated.View>
        )}

        {/* Actions */}
        <Animated.View style={[styles.actionsSection, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>
          {renderMainAction()}

          {/* Block / Unblock — не показываем если уже заблокирован ими */}
          {status !== 'BLOCKED_BY_THEM' && status !== 'BLOCKED_BY_ME' && (
            <TouchableOpacity
              style={styles.blockBtn}
              onPress={handleBlock}
              disabled={isBlocking}
              activeOpacity={0.7}
            >
              {isBlocking
                ? <ActivityIndicator size="small" color="#ff6b6b" />
                : <>
                    <Icon name="slash" size={16} color="#ff6b6b" />
                    <Text style={styles.blockBtnText}>Заблокировать</Text>
                  </>}
            </TouchableOpacity>
          )}
        </Animated.View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 56 : 36,
    paddingBottom: 16, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: colors.primary + '15',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: colors.secondary + '40',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '600', color: colors.primary },

  scrollContent: { paddingHorizontal: 24, paddingTop: 32 },

  // Avatar
  avatarSection: { alignItems: 'center', marginBottom: 20 },
  avatar: {
    width: 108, height: 108, borderRadius: 54,
    borderWidth: 3, borderColor: colors.accent + '60',
  },
  avatarPlaceholder: {
    width: 108, height: 108, borderRadius: 54,
    backgroundColor: colors.secondary + '60',
    borderWidth: 3, borderColor: colors.accent + '40',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontSize: 36, fontWeight: '700', color: colors.text },

  // Name
  nameSection: { alignItems: 'center', marginBottom: 24 },
  nickName: {
    fontSize: 26, fontWeight: '700', color: colors.text,
    letterSpacing: -0.3, marginBottom: 4,
  },
  username: { fontSize: 15, color: colors.accent, fontWeight: '600', marginBottom: 12 },
  description: {
    fontSize: 15, color: colors.primary, textAlign: 'center',
    lineHeight: 22, paddingHorizontal: 8,
  },
  descriptionEmpty: {
    fontSize: 14, color: colors.primary + '40',
    textAlign: 'center', fontStyle: 'italic',
  },

  // Mutual friends card
  mutualCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.secondary + '25',
    borderRadius: 16, borderWidth: 1, borderColor: colors.primary + '15',
    paddingHorizontal: 16, paddingVertical: 14, marginBottom: 20,
  },
  mutualAvatars: { flexDirection: 'row', alignItems: 'center' },
  mutualAvatar: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 2, borderColor: colors.background,
  },
  mutualAvatarImg: { width: 32, height: 32, borderRadius: 16 },
  mutualAvatarPlaceholder: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.secondary + '80',
    alignItems: 'center', justifyContent: 'center',
  },
  mutualAvatarText: { fontSize: 11, fontWeight: '700', color: colors.text },
  mutualInfo: { flex: 1 },
  mutualTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  mutualNames: { fontSize: 12, color: colors.primary + '70' },

  // Actions
  actionsSection: { gap: 10 },
  respondRow: { flexDirection: 'row', gap: 10 },
  mainBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 16,
  },
  mainBtnText: { fontSize: 16, fontWeight: '700', color: colors.text },
  addBtn: {
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 8,
  },
  friendsBtn: {
    backgroundColor: colors.accent + '20',
    borderWidth: 1.5, borderColor: colors.accent + '50',
  },
  cancelBtn: {
    backgroundColor: '#ff6b6b12',
    borderWidth: 1.5, borderColor: '#ff6b6b40',
  },
  acceptBtn: { backgroundColor: colors.accent },
  declineBtn: {
    backgroundColor: colors.secondary + '40',
    borderWidth: 1.5, borderColor: colors.primary + '30',
  },
  dangerOutline: {
    backgroundColor: '#ff6b6b12',
    borderWidth: 1.5, borderColor: '#ff6b6b40',
  },
  disabledBtn: {
    backgroundColor: colors.secondary + '20',
    borderWidth: 1.5, borderColor: colors.primary + '15',
  },
  blockBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 14,
    backgroundColor: '#ff6b6b08',
    borderWidth: 1, borderColor: '#ff6b6b20',
  },
  blockBtnText: { fontSize: 15, fontWeight: '600', color: '#ff6b6b' },
});

export default UserProfileScreen;