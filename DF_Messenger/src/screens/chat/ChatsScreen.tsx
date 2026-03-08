import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Feather';
import { colors } from '../../styles/colors';
import { useChats, useDeleteChat, useUnreadPerChat, useCreateChat } from '../../hooks/chat.hook';
import { useFriends } from '../../hooks/friends.hook';
import { useMe } from '../../hooks/user.hook';
import { useUserOnlineStatus } from '../../hooks/presence.hook';
import { Chat } from '../../api/chat.types';
import { Friend } from '../../api/friends.types';
import { AppStackParamList, OtherUser } from '../../navigation/types';

type NavProp = NativeStackNavigationProp<AppStackParamList>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getOtherUser = (chat: Chat, myId: number): OtherUser => {
  const other = chat.participants.find((p) => p.user.id !== myId);
  const u = other?.user ?? chat.participants[0]?.user;
  return { id: u.id, nickName: u.nickName, username: u.username, avatarUrl: u.avatarUrl };
};

const formatTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (diffDays === 0)
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Вчера';
  if (diffDays < 7) return date.toLocaleDateString('ru-RU', { weekday: 'short' });
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
};

// ─── Chat item ────────────────────────────────────────────────────────────────

interface ChatItemProps {
  chat: Chat;
  myId: number;
  unreadCount: number;
  onPress: () => void;
  onLongPress: () => void;
}

const ChatItem: React.FC<ChatItemProps> = ({
  chat, myId, unreadCount, onPress, onLongPress,
}) => {
  const otherUser = getOtherUser(chat, myId);
  const { isOnline } = useUserOnlineStatus(otherUser.id);
  const lastMessage = chat.messages[0];
  const hasUnread = unreadCount > 0;

  const initials = otherUser.nickName
    .split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  const lastMessageText = (): string => {
    if (!lastMessage) return 'Нет сообщений';
    if (lastMessage.type !== 'TEXT') {
      const icons: Record<string, string> = {
        IMAGE: '🖼 Фото', VIDEO: '🎥 Видео', FILE: '📎 Файл', AUDIO: '🎵 Аудио',
      };
      return icons[lastMessage.type] ?? '📎 Файл';
    }
    return (lastMessage.sender.id === myId ? 'Вы: ' : '') + (lastMessage.content ?? '');
  };

  return (
    <TouchableOpacity
      style={styles.chatItem}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      <View style={styles.avatarWrapper}>
        {otherUser.avatarUrl ? (
          <Image source={{ uri: otherUser.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </View>
        )}
        {isOnline && <View style={styles.onlineDot} />}
      </View>

      <View style={styles.chatInfo}>
        <View style={styles.chatTop}>
          <Text
            style={[styles.chatName, hasUnread && styles.chatNameUnread]}
            numberOfLines={1}
          >
            {otherUser.nickName}
          </Text>
          {lastMessage && (
            <Text style={[styles.chatTime, hasUnread && styles.chatTimeUnread]}>
              {formatTime(lastMessage.createdAt)}
            </Text>
          )}
        </View>
        <View style={styles.chatBottom}>
          <Text
            style={[styles.chatPreview, hasUnread && styles.chatPreviewUnread]}
            numberOfLines={1}
          >
            {lastMessageText()}
          </Text>
          {hasUnread && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ─── Friends picker sheet ─────────────────────────────────────────────────────

interface FriendsPickerProps {
  visible: boolean;
  onClose: () => void;
  existingChats: Chat[];
  myId: number;
  onSelect: (friend: Friend, existingChatId?: number) => void;
}

const FriendsPicker: React.FC<FriendsPickerProps> = ({
  visible, onClose, existingChats, myId, onSelect,
}) => {
  const { data: friends, isLoading } = useFriends();

  const findExistingChat = (friendId: number): number | undefined =>
    existingChats.find(
      (c) =>
        c.participants.some((p) => p.user.id === myId) &&
        c.participants.some((p) => p.user.id === friendId),
    )?.id;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={pickerStyles.backdrop} />
      </TouchableWithoutFeedback>

      <View style={pickerStyles.sheet}>
        <View style={pickerStyles.handle} />

        <View style={pickerStyles.header}>
          <Text style={pickerStyles.headerTitle}>Написать другу</Text>
          <TouchableOpacity style={pickerStyles.closeBtn} onPress={onClose}>
            <Icon name="x" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={pickerStyles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : !friends?.length ? (
          <View style={pickerStyles.empty}>
            <Icon name="users" size={32} color={colors.primary + '40'} />
            <Text style={pickerStyles.emptyText}>У вас пока нет друзей</Text>
            <Text style={pickerStyles.emptySubtext}>
              Добавьте друзей на вкладке «Друзья»
            </Text>
          </View>
        ) : (
          <FlatList
            data={friends}
            keyExtractor={(item) => String(item.id)}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={pickerStyles.list}
            renderItem={({ item }) => {
              const existingChatId = findExistingChat(item.id);
              const initials = item.nickName
                .split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

              return (
                <TouchableOpacity
                  style={pickerStyles.friendRow}
                  onPress={() => { onSelect(item, existingChatId); onClose(); }}
                  activeOpacity={0.7}
                >
                  {item.avatarUrl ? (
                    <Image source={{ uri: item.avatarUrl }} style={pickerStyles.avatar} />
                  ) : (
                    <View style={pickerStyles.avatarPlaceholder}>
                      <Text style={pickerStyles.avatarInitials}>{initials}</Text>
                    </View>
                  )}

                  <View style={pickerStyles.friendInfo}>
                    <Text style={pickerStyles.friendName} numberOfLines={1}>
                      {item.nickName}
                    </Text>
                    <Text style={pickerStyles.friendUsername}>@{item.username}</Text>
                  </View>

                  <View style={[
                    pickerStyles.actionChip,
                    !!existingChatId && pickerStyles.actionChipOpen,
                  ]}>
                    <Icon
                      name={existingChatId ? 'message-circle' : 'edit-2'}
                      size={13}
                      color={existingChatId ? colors.accent : colors.text}
                    />
                    <Text style={[
                      pickerStyles.actionChipText,
                      !!existingChatId && pickerStyles.actionChipTextOpen,
                    ]}>
                      {existingChatId ? 'Открыть' : 'Написать'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
        <View style={{ height: 34 }} />
      </View>
    </Modal>
  );
};

const pickerStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderWidth: 1, borderColor: colors.primary + '20',
    maxHeight: '72%', paddingHorizontal: 20,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.primary + '40',
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingVertical: 16,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.secondary + '40',
    alignItems: 'center', justifyContent: 'center',
  },
  center: { paddingVertical: 40, alignItems: 'center' },
  empty: { paddingVertical: 40, alignItems: 'center', gap: 10 },
  emptyText: { fontSize: 16, fontWeight: '700', color: colors.text },
  emptySubtext: { fontSize: 13, color: colors.primary + '60', textAlign: 'center' },
  list: { paddingBottom: 8 },
  friendRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, gap: 12,
    borderBottomWidth: 1, borderBottomColor: colors.primary + '10',
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    borderWidth: 2, borderColor: colors.accent + '40',
  },
  avatarPlaceholder: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.secondary + '60',
    borderWidth: 2, borderColor: colors.accent + '30',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontSize: 16, fontWeight: '700', color: colors.text },
  friendInfo: { flex: 1 },
  friendName: { fontSize: 15, fontWeight: '700', color: colors.text },
  friendUsername: { fontSize: 13, color: colors.accent, fontWeight: '500', marginTop: 2 },
  actionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.accent,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
  },
  actionChipOpen: {
    backgroundColor: colors.accent + '20',
    borderWidth: 1.5, borderColor: colors.accent + '50',
  },
  actionChipText: { fontSize: 12, fontWeight: '700', color: colors.text },
  actionChipTextOpen: { color: colors.accent },
});

// ─── ChatsScreen ──────────────────────────────────────────────────────────────

const ChatsScreen = () => {
  const navigation = useNavigation<NavProp>();
  const [refreshing, setRefreshing] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);

  const { data: me } = useMe();
  const { data: chats, isLoading, refetch } = useChats();
  const { data: unreadPerChat } = useUnreadPerChat();
  const { mutate: deleteChat } = useDeleteChat();
  const { mutateAsync: createChat, isPending: isCreating } = useCreateChat();

  const getUnread = (chatId: number) =>
    unreadPerChat?.find((u) => u.chatId === chatId)?._count.id ?? 0;

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const openChat = (chatId: number, otherUser: OtherUser) =>
    navigation.navigate('ChatScreen', { chatId, otherUser });

  const handleChatPress = (chat: Chat) => {
    if (!me) return;
    openChat(chat.id, getOtherUser(chat, me.id));
  };

  const handleChatLongPress = (chat: Chat) => {
    if (!me) return;
    const other = getOtherUser(chat, me.id);
    Alert.alert(other.nickName, undefined, [
      {
        text: 'Удалить у себя', style: 'destructive',
        onPress: () => deleteChat({ chatId: chat.id, forEveryone: false }),
      },
      {
        text: 'Удалить у всех', style: 'destructive',
        onPress: () => deleteChat({ chatId: chat.id, forEveryone: true }),
      },
      { text: 'Отмена', style: 'cancel' },
    ]);
  };

  const handleFriendSelect = async (friend: Friend, existingChatId?: number) => {
    const otherUser: OtherUser = {
      id: friend.id,
      nickName: friend.nickName,
      username: friend.username,
      avatarUrl: friend.avatarUrl,
    };

    if (existingChatId) {
      openChat(existingChatId, otherUser);
      return;
    }

    try {
      const chat = await createChat(friend.id);
      openChat(chat.id, otherUser);
    } catch {
      Alert.alert('Ошибка', 'Не удалось создать чат');
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Чаты</Text>
        <TouchableOpacity
          style={styles.newChatBtn}
          onPress={() => setPickerVisible(true)}
          disabled={isCreating}
          activeOpacity={0.8}
        >
          {isCreating
            ? <ActivityIndicator size="small" color={colors.text} />
            : <Icon name="edit" size={19} color={colors.text} />}
        </TouchableOpacity>
      </View>

      {!chats?.length ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}>
            <Icon name="message-circle" size={36} color={colors.accent + '70'} />
          </View>
          <Text style={styles.emptyTitle}>Нет чатов</Text>
          <Text style={styles.emptySubtitle}>
            Нажмите на карандаш справа вверху чтобы написать другу
          </Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          renderItem={({ item }) => (
            <ChatItem
              chat={item}
              myId={me?.id ?? 0}
              unreadCount={getUnread(item.id)}
              onPress={() => handleChatPress(item)}
              onLongPress={() => handleChatLongPress(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      <FriendsPicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        existingChats={chats ?? []}
        myId={me?.id ?? 0}
        onSelect={handleFriendSelect}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: {
    flex: 1, backgroundColor: colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: colors.primary + '12',
  },
  headerTitle: { fontSize: 28, fontWeight: '700', color: colors.text, letterSpacing: -0.5 },
  newChatBtn: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  listContent: { paddingVertical: 8, paddingHorizontal: 16 },
  separator: { height: 1, backgroundColor: colors.primary + '10', marginLeft: 84 },
  chatItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 4, gap: 14,
  },
  avatarWrapper: { position: 'relative' },
  avatar: { width: 54, height: 54, borderRadius: 27, borderWidth: 2, borderColor: colors.accent + '40' },
  avatarPlaceholder: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: colors.secondary + '60', borderWidth: 2, borderColor: colors.accent + '30',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontSize: 18, fontWeight: '700', color: colors.text },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 13, height: 13, borderRadius: 6.5,
    backgroundColor: colors.onlineColor, borderWidth: 2, borderColor: colors.background,
  },
  chatInfo: { flex: 1, gap: 4 },
  chatTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chatName: { fontSize: 15, fontWeight: '600', color: colors.text, flex: 1, marginRight: 8 },
  chatNameUnread: { fontWeight: '700' },
  chatTime: { fontSize: 12, color: colors.primary + '60' },
  chatTimeUnread: { color: colors.accent, fontWeight: '600' },
  chatBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chatPreview: { fontSize: 13, color: colors.primary + '70', flex: 1, marginRight: 8 },
  chatPreviewUnread: { color: colors.primary, fontWeight: '500' },
  unreadBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  unreadBadgeText: { fontSize: 11, fontWeight: '700', color: colors.text },
  emptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, gap: 12,
  },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 28,
    backgroundColor: colors.secondary + '30', borderWidth: 1, borderColor: colors.primary + '20',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  emptySubtitle: {
    fontSize: 14, color: colors.primary + '70', textAlign: 'center', lineHeight: 20,
  },
});

export default ChatsScreen;