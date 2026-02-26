import React, { useRef } from 'react';
import {
  Animated,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { SearchUser } from '../api/friends.types';
import {
  useRelationshipStatus,
  useSendFriendRequest,
  useCancelFriendRequest,
  useRemoveFriend,
  useBlockUser,
} from '../hooks/friends.hook';
import { colors } from '../styles/colors'

interface UserCardProps {
  user: SearchUser;
  onPress?: (user: SearchUser) => void;
}

const UserCard: React.FC<UserCardProps> = ({ user, onPress }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const { data: status, isLoading: statusLoading } = useRelationshipStatus(user.id);
  const { mutate: sendRequest, isPending: isSending } = useSendFriendRequest();
  const { mutate: cancelRequest, isPending: isCanceling } = useCancelFriendRequest();
  const { mutate: removeFriend, isPending: isRemoving } = useRemoveFriend();
  const { mutate: blockUser, isPending: isBlocking } = useBlockUser();

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      friction: 8,
      tension: 100,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 8,
      tension: 100,
      useNativeDriver: true,
    }).start();
  };

  const initials = user.nickName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const renderActionButton = () => {
    if (statusLoading) {
      return (
        <View style={styles.actionBtn}>
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      );
    }

    switch (status) {
      case 'BLOCKED_BY_ME':
        return (
          <View style={[styles.actionBtn, styles.disabledBtn]}>
            <Icon name="slash" size={15} color={colors.primary + '50'} />
          </View>
        );

      case 'BLOCKED_BY_THEM':
        return (
          <View style={[styles.actionBtn, styles.disabledBtn]}>
            <Icon name="lock" size={15} color={colors.primary + '50'} />
          </View>
        );

      case 'FRIENDS':
        return (
          <TouchableOpacity
            style={[styles.actionBtn, styles.friendsBtn]}
            onPress={() => removeFriend(user.id)}
            disabled={isRemoving}
            activeOpacity={0.8}
          >
            {isRemoving ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Icon name="user-check" size={15} color={colors.accent} />
            )}
          </TouchableOpacity>
        );

      case 'REQUEST_SENT':
        return (
          <TouchableOpacity
            style={[styles.actionBtn, styles.pendingBtn]}
            onPress={() => cancelRequest({ requestId: user.id, targetId: user.id })}
            disabled={isCanceling}
            activeOpacity={0.8}
          >
            {isCanceling ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Icon name="clock" size={15} color={colors.primary} />
            )}
          </TouchableOpacity>
        );

      case 'REQUEST_RECEIVED':
        return (
          <TouchableOpacity
            style={[styles.actionBtn, styles.addBtn]}
            onPress={() => sendRequest(user.id)}
            disabled={isSending}
            activeOpacity={0.8}
          >
            {isSending ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <Icon name="user-plus" size={15} color={colors.text} />
            )}
          </TouchableOpacity>
        );

      // 'NONE' или undefined
      default:
        return (
          <TouchableOpacity
            style={[styles.actionBtn, styles.addBtn]}
            onPress={() => sendRequest(user.id)}
            disabled={isSending}
            activeOpacity={0.8}
          >
            {isSending ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <Icon name="user-plus" size={15} color={colors.text} />
            )}
          </TouchableOpacity>
        );
    }
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={styles.card}
        onPress={() => onPress?.(user)}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        {/* Avatar */}
        <View style={styles.avatarWrapper}>
          {user.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
          {status === 'FRIENDS' && <View style={styles.friendDot} />}
        </View>

        {/* Info */}
        <View style={styles.info}>
          <Text style={styles.nickName} numberOfLines={1}>
            {user.nickName}
          </Text>
          <Text style={styles.username} numberOfLines={1}>
            @{user.username}
          </Text>
          {user.description ? (
            <Text style={styles.description} numberOfLines={1}>
              {user.description}
            </Text>
          ) : null}
        </View>

        {/* Action */}
        {renderActionButton()}
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondary + '18',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.primary + '18',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
    gap: 14,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: colors.accent + '50',
  },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.secondary + '60',
    borderWidth: 2,
    borderColor: colors.accent + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.5,
  },
  friendDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4ade80',
    borderWidth: 2,
    borderColor: colors.background,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  nickName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.2,
  },
  username: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: '500',
  },
  description: {
    fontSize: 12,
    color: colors.primary + '80',
    marginTop: 2,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    backgroundColor: colors.accent,
  },
  friendsBtn: {
    backgroundColor: colors.accent + '25',
    borderWidth: 1.5,
    borderColor: colors.accent + '50',
  },
  pendingBtn: {
    backgroundColor: colors.secondary + '40',
    borderWidth: 1.5,
    borderColor: colors.primary + '30',
  },
  disabledBtn: {
    backgroundColor: colors.secondary + '20',
    borderWidth: 1.5,
    borderColor: colors.primary + '15',
  },
});

export default UserCard;