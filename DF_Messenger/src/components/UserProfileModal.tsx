import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Dimensions,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { colors } from '../styles/colors';
import { SearchUser } from '../api/friends.types';
import {
  useRelationshipStatus,
  useSendFriendRequest,
  useCancelFriendRequest,
  useRemoveFriend,
  useBlockUser,
  useUnblockUser,
  useRespondFriendRequest,
  useMutualFriends,
} from '../hooks/friends.hook';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface UserProfileModalProps {
  user: SearchUser | null;
  visible: boolean;
  onClose: () => void;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({ user, visible, onClose }) => {
  const navigation = useNavigation<any>();
  const slideAnim   = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, friction: 20, tension: 80, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 280, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const { data: status, isLoading: statusLoading } = useRelationshipStatus(user?.id ?? 0);
  const { data: mutuals }                          = useMutualFriends(user?.id ?? 0);

  const { mutate: sendRequest,    isPending: isSending    } = useSendFriendRequest();
  const { mutate: cancelRequest,  isPending: isCanceling  } = useCancelFriendRequest();
  const { mutate: removeFriend,   isPending: isRemoving   } = useRemoveFriend();
  const { mutate: blockUser,      isPending: isBlocking   } = useBlockUser();
  const { mutate: unblockUser,    isPending: isUnblocking } = useUnblockUser();
  const { mutate: respondRequest, isPending: isResponding } = useRespondFriendRequest();

  if (!user) return null;

  const initials = user.nickName
    .split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  const handleOpenProfile = () => {
    onClose();
    // небольшая задержка чтобы modal успел закрыться
    setTimeout(() => {
      navigation.navigate('UserProfileScreen', { user });
    }, 300);
  };

  const handleBlock = () => {
    Alert.alert(
      'Заблокировать пользователя',
      `Заблокировать @${user.username}?`,
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Заблокировать', style: 'destructive', onPress: () => { blockUser(user.id); onClose(); } },
      ],
    );
  };

  const handleRemoveFriend = () => {
    Alert.alert(
      'Удалить из друзей',
      `Удалить @${user.username} из друзей?`,
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Удалить', style: 'destructive', onPress: () => removeFriend(user.id) },
      ],
    );
  };

  const renderMainAction = () => {
    if (statusLoading)
      return <View style={[styles.mainBtn, { opacity: 0.5 }]}><ActivityIndicator color={colors.text} /></View>;

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
              : <><Icon name="slash" size={17} color="#ff6b6b" /><Text style={[styles.mainBtnText, { color: '#ff6b6b' }]}>Разблокировать</Text></>}
          </TouchableOpacity>
        );

      case 'BLOCKED_BY_THEM':
        return (
          <View style={[styles.mainBtn, { opacity: 0.4, backgroundColor: colors.secondary + '30' }]}>
            <Icon name="lock" size={17} color={colors.primary} />
            <Text style={[styles.mainBtnText, { color: colors.primary }]}>Недоступно</Text>
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
              : <><Icon name="user-check" size={17} color={colors.accent} /><Text style={[styles.mainBtnText, { color: colors.accent }]}>Вы друзья</Text></>}
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
              : <><Icon name="x-circle" size={17} color="#ff6b6b" /><Text style={[styles.mainBtnText, { color: '#ff6b6b' }]}>Отменить запрос</Text></>}
          </TouchableOpacity>
        );

      case 'REQUEST_RECEIVED':
        return (
          <View style={styles.respondRow}>
            <TouchableOpacity
              style={[styles.mainBtn, styles.acceptBtn, { flex: 1 }]}
              onPress={() => respondRequest({ friendshipId: user.id, action: 'ACCEPTED', targetId: user.id })}
              disabled={isResponding}
              activeOpacity={0.8}
            >
              {isResponding
                ? <ActivityIndicator color={colors.text} />
                : <><Icon name="check" size={17} color={colors.text} /><Text style={styles.mainBtnText}>Принять</Text></>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.mainBtn, styles.declineBtn, { flex: 1 }]}
              onPress={() => respondRequest({ friendshipId: user.id, action: 'DECLINED', targetId: user.id })}
              disabled={isResponding}
              activeOpacity={0.8}
            >
              <Icon name="x" size={17} color={colors.primary} />
              <Text style={[styles.mainBtnText, { color: colors.primary }]}>Отклонить</Text>
            </TouchableOpacity>
          </View>
        );

      default:
        return (
          <TouchableOpacity
            style={[styles.mainBtn, styles.addBtn]}
            onPress={() => sendRequest(user.id)}
            disabled={isSending}
            activeOpacity={0.8}
          >
            {isSending
              ? <ActivityIndicator color={colors.text} />
              : <><Icon name="user-plus" size={17} color={colors.text} /><Text style={styles.mainBtnText}>Добавить в друзья</Text></>}
          </TouchableOpacity>
        );
    }
  };

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.handle} />

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Header row: close + open profile */}
          <View style={styles.sheetHeader}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Icon name="x" size={18} color={colors.text} />
            </TouchableOpacity>
            {/* Кнопка перехода на полный профиль */}
            <TouchableOpacity style={styles.openProfileBtn} onPress={handleOpenProfile} activeOpacity={0.8}>
              <Icon name="external-link" size={15} color={colors.accent} />
              <Text style={styles.openProfileText}>Открыть профиль</Text>
            </TouchableOpacity>
          </View>

          {/* Avatar */}
          <View style={styles.avatarSection}>
            {user.avatarUrl
              ? <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
              : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitials}>{initials}</Text>
                </View>
              )}
          </View>

          <Text style={styles.nickName}>{user.nickName}</Text>
          <Text style={styles.username}>@{user.username}</Text>

          {user.description
            ? <Text style={styles.description}>{user.description}</Text>
            : <Text style={styles.descriptionEmpty}>Нет описания</Text>}

          {/* Mutual friends */}
          {mutuals && mutuals.length > 0 && (
            <View style={styles.mutualRow}>
              <View style={styles.mutualAvatars}>
                {mutuals.slice(0, 3).map((m, i) => (
                  <View key={m.id} style={[styles.mutualAvatar, { marginLeft: i > 0 ? -8 : 0 }]}>
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
              <Text style={styles.mutualText}>
                {mutuals.length} общих {mutuals.length === 1 ? 'друг' : 'друга'}
              </Text>
            </View>
          )}

          {/* Main action */}
          <View style={styles.actionsSection}>{renderMainAction()}</View>

          {/* Block */}
          {status !== 'BLOCKED_BY_THEM' && status !== 'BLOCKED_BY_ME' && (
            <TouchableOpacity style={styles.blockBtn} onPress={handleBlock} disabled={isBlocking} activeOpacity={0.7}>
              <Icon name="slash" size={16} color="#ff6b6b" />
              <Text style={styles.blockBtnText}>Заблокировать</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderWidth: 1, borderColor: colors.primary + '20',
    minHeight: SCREEN_HEIGHT * 0.5,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.primary + '40',
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingTop: 8, paddingBottom: 4,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.secondary + '40',
    alignItems: 'center', justifyContent: 'center',
  },
  openProfileBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: colors.accent + '18',
    borderRadius: 12, borderWidth: 1, borderColor: colors.accent + '35',
  },
  openProfileText: {
    fontSize: 13, fontWeight: '700', color: colors.accent,
  },
  avatarSection: { alignItems: 'center', marginBottom: 16, marginTop: 8 },
  avatar: {
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 3, borderColor: colors.accent + '60',
  },
  avatarPlaceholder: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: colors.secondary + '60',
    borderWidth: 3, borderColor: colors.accent + '40',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontSize: 30, fontWeight: '700', color: colors.text },
  nickName: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center', letterSpacing: -0.3 },
  username: { fontSize: 14, color: colors.accent, fontWeight: '600', textAlign: 'center', marginTop: 4, marginBottom: 12 },
  description: { fontSize: 14, color: colors.primary, textAlign: 'center', lineHeight: 20, marginBottom: 16, paddingHorizontal: 8 },
  descriptionEmpty: { fontSize: 14, color: colors.primary + '40', textAlign: 'center', fontStyle: 'italic', marginBottom: 16 },
  mutualRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20 },
  mutualAvatars: { flexDirection: 'row', alignItems: 'center' },
  mutualAvatar: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.background },
  mutualAvatarImg: { width: 24, height: 24, borderRadius: 12 },
  mutualAvatarPlaceholder: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.secondary + '80', alignItems: 'center', justifyContent: 'center',
  },
  mutualAvatarText: { fontSize: 9, fontWeight: '700', color: colors.text },
  mutualText: { fontSize: 13, color: colors.primary + '80', fontWeight: '500' },
  actionsSection: { marginBottom: 12 },
  respondRow: { flexDirection: 'row', gap: 10 },
  mainBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 15, borderRadius: 16,
  },
  mainBtnText: { fontSize: 15, fontWeight: '700', color: colors.text },
  addBtn: {
    backgroundColor: colors.accent,
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 8,
  },
  friendsBtn: { backgroundColor: colors.accent + '20', borderWidth: 1.5, borderColor: colors.accent + '50' },
  cancelBtn: { backgroundColor: '#ff6b6b12', borderWidth: 1.5, borderColor: '#ff6b6b40' },
  acceptBtn: { backgroundColor: colors.accent },
  declineBtn: { backgroundColor: colors.secondary + '40', borderWidth: 1.5, borderColor: colors.primary + '30' },
  dangerOutline: { backgroundColor: '#ff6b6b12', borderWidth: 1.5, borderColor: '#ff6b6b40' },
  blockBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 14, paddingHorizontal: 16,
    backgroundColor: '#ff6b6b08', borderRadius: 14,
    borderWidth: 1, borderColor: '#ff6b6b20',
  },
  blockBtnText: { fontSize: 15, fontWeight: '600', color: '#ff6b6b' },
});

export default UserProfileModal;