import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import {
  useChats,
  useDeleteChat,
  useUnreadCount,
  useUnreadPerChat,
  useCreateChat,
  useGlobalTyping,
} from '../../hooks/chat.hook';
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
  const u     = other?.user ?? chat.participants[0]?.user;
  return { id: u.id, nickName: u.nickName, username: u.username, avatarUrl: u.avatarUrl };
};

const formatTime = (dateStr: string) => {
  const date = new Date(dateStr);
  const now  = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (diff === 0) return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (diff === 1) return 'Вчера';
  if (diff < 7)   return date.toLocaleDateString('ru-RU', { weekday: 'short' });
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
};

// ─── Delete bottom sheet ──────────────────────────────────────────────────────

interface DeleteMenuProps {
  chat: Chat | null;
  myId: number;
  onClose: () => void;
  onDeleteSelf: () => void;
  onDeleteAll:  () => void;
}

const DeleteMenu: React.FC<DeleteMenuProps> = ({ chat, myId, onClose, onDeleteSelf, onDeleteAll }) => {
  const translateY = useRef(new Animated.Value(400)).current;
  const opacity    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (chat) {
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 70, friction: 11 }),
        Animated.timing(opacity,    { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      translateY.setValue(400);
      opacity.setValue(0);
    }
  }, [!!chat]);

  const dismiss = (action?: () => void) => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: 400, duration: 220, useNativeDriver: true }),
      Animated.timing(opacity,    { toValue: 0,   duration: 180, useNativeDriver: true }),
    ]).start(() => { onClose(); action && setTimeout(action, 50); });
  };

  if (!chat) return null;
  const other    = getOtherUser(chat, myId);
  const initials = other.nickName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <Modal transparent animationType="none" visible={!!chat} onRequestClose={() => dismiss()}>
      <Animated.View style={[dm.backdrop, { opacity }]} pointerEvents="box-none">
        <TouchableWithoutFeedback onPress={() => dismiss()}>
          <View style={StyleSheet.absoluteFillObject} />
        </TouchableWithoutFeedback>
      </Animated.View>

      <Animated.View style={[dm.sheet, { transform: [{ translateY }] }]}>
        <View style={dm.pill} />

        <View style={dm.chatRow}>
          {other.avatarUrl
            ? <Image source={{ uri: other.avatarUrl }} style={dm.avatar} />
            : <View style={dm.avatarPh}><Text style={dm.avatarIn}>{initials}</Text></View>}
          <View>
            <Text style={dm.chatName}>{other.nickName}</Text>
            <Text style={dm.chatSub}>@{other.username}</Text>
          </View>
        </View>

        <View style={dm.sep} />

        <TouchableOpacity style={dm.row} onPress={() => dismiss(onDeleteSelf)} activeOpacity={0.7}>
          <View style={[dm.icon, { backgroundColor: 'rgba(255,107,107,0.12)' }]}>
            <Icon name="trash-2" size={18} color="#ff6b6b" />
          </View>
          <View style={dm.rowText}>
            <Text style={dm.rowTitle}>Удалить у меня</Text>
            <Text style={dm.rowSub}>Только вы не будете видеть этот чат</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={dm.row} onPress={() => dismiss(onDeleteAll)} activeOpacity={0.7}>
          <View style={[dm.icon, { backgroundColor: 'rgba(255,59,48,0.12)' }]}>
            <Icon name="x-circle" size={18} color="#ff3b30" />
          </View>
          <View style={dm.rowText}>
            <Text style={[dm.rowTitle, { color: '#ff3b30' }]}>Удалить у всех</Text>
            <Text style={dm.rowSub}>Исчезнет у {other.nickName} тоже</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={dm.cancel} onPress={() => dismiss()} activeOpacity={0.7}>
          <Text style={dm.cancelText}>Отмена</Text>
        </TouchableOpacity>

        <View style={{ height: Platform.OS === 'ios' ? 28 : 14 }} />
      </Animated.View>
    </Modal>
  );
};

const dm = StyleSheet.create({
  backdrop:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet:      { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.background, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.primary + '18', paddingHorizontal: 20, paddingTop: 10, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 12 },
  pill:       { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.primary + '30', alignSelf: 'center', marginBottom: 18 },
  chatRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  avatar:     { width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: colors.accent + '50' },
  avatarPh:   { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.secondary + '60', borderWidth: 2, borderColor: colors.accent + '35', alignItems: 'center', justifyContent: 'center' },
  avatarIn:   { fontSize: 15, fontWeight: '700', color: colors.text },
  chatName:   { fontSize: 16, fontWeight: '700', color: colors.text },
  chatSub:    { fontSize: 12, color: colors.accent, marginTop: 2 },
  sep:        { height: 1, backgroundColor: colors.primary + '12', marginBottom: 8 },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13 },
  icon:       { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowText:    { flex: 1 },
  rowTitle:   { fontSize: 15, fontWeight: '600', color: colors.text },
  rowSub:     { fontSize: 12, color: colors.primary + '55', marginTop: 2 },
  cancel:     { marginTop: 6, backgroundColor: colors.secondary + '35', borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.primary + '12' },
  cancelText: { fontSize: 15, fontWeight: '600', color: colors.primary + 'CC' },
});

// ─── ChatItem ─────────────────────────────────────────────────────────────────

const ChatItem: React.FC<{
  chat: Chat;
  myId: number;
  unreadCount: number;
  isTyping: boolean;
  onPress: () => void;
  onLongPress: () => void;
}> = ({ chat, myId, unreadCount, isTyping, onPress, onLongPress }) => {
  const other     = getOtherUser(chat, myId);
  const { isOnline } = useUserOnlineStatus(other.id);
  const last      = chat.messages[0];
  const hasUnread = unreadCount > 0;
  const initials  = other.nickName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const hasPinned = !!chat.pinnedMessage;

  const preview = (): string => {
    if (isTyping) return 'печатает...';
    if (!last)    return 'Нет сообщений';
    if (last.type !== 'TEXT') {
      return ({ IMAGE: '🖼 Фото', VIDEO: '🎥 Видео', FILE: '📎 Файл', AUDIO: '🎵 Аудио' } as Record<string, string>)[last.type] ?? '📎';
    }
    return (last.sender.id === myId ? 'Вы: ' : '') + (last.content ?? '');
  };

  return (
    <TouchableOpacity style={cs.item} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.72}>
      <View style={cs.avWrap}>
        {other.avatarUrl
          ? <Image source={{ uri: other.avatarUrl }} style={cs.av} />
          : <View style={cs.avPh}><Text style={cs.avIn}>{initials}</Text></View>}
        {isOnline && <View style={cs.dot} />}
      </View>

      <View style={cs.info}>
        <View style={cs.top}>
          <View style={cs.nameRow}>
            <Text style={[cs.name, hasUnread && cs.nameBold]} numberOfLines={1}>{other.nickName}</Text>
            {hasPinned && <Icon name="bookmark" size={11} color={colors.accent + '80'} />}
          </View>
          {/* ⚠️  Время показывается всегда если есть сообщение — не скрываем при typing */}
          {last && (
            <Text style={[cs.time, hasUnread && cs.timeAccent]}>{formatTime(last.createdAt)}</Text>
          )}
        </View>
        <View style={cs.bottom}>
          <Text
            style={[cs.preview, hasUnread && !isTyping && cs.previewBold, isTyping && cs.previewTyping]}
            numberOfLines={1}
          >
            {preview()}
          </Text>
          {hasUnread && (
            <View style={cs.badge}>
              <Text style={cs.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const cs = StyleSheet.create({
  item:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 4, gap: 13 },
  avWrap:        { position: 'relative' },
  av:            { width: 54, height: 54, borderRadius: 27, borderWidth: 2, borderColor: colors.accent + '40' },
  avPh:          { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.secondary + '60', borderWidth: 2, borderColor: colors.accent + '30', alignItems: 'center', justifyContent: 'center' },
  avIn:          { fontSize: 18, fontWeight: '700', color: colors.text },
  dot:           { position: 'absolute', bottom: 1, right: 1, width: 13, height: 13, borderRadius: 6.5, backgroundColor: colors.onlineColor, borderWidth: 2, borderColor: colors.background },
  info:          { flex: 1, gap: 4 },
  top:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nameRow:       { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, marginRight: 8 },
  name:          { fontSize: 15, fontWeight: '600', color: colors.text, flexShrink: 1 },
  nameBold:      { fontWeight: '700' },
  time:          { fontSize: 12, color: colors.primary + '60' },
  timeAccent:    { color: colors.accent, fontWeight: '600' },
  bottom:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  preview:       { fontSize: 13, color: colors.primary + '70', flex: 1, marginRight: 8 },
  previewBold:   { color: colors.primary, fontWeight: '500' },
  previewTyping: { color: colors.accent, fontWeight: '500', fontStyle: 'italic' },
  badge:         { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText:     { fontSize: 11, fontWeight: '700', color: colors.text },
});

// ─── FriendsPicker ────────────────────────────────────────────────────────────

const FriendsPicker: React.FC<{
  visible: boolean;
  onClose: () => void;
  existingChats: Chat[];
  myId: number;
  onSelect: (f: Friend, existingChatId?: number) => void;
}> = ({ visible, onClose, existingChats, myId, onSelect }) => {
  const { data: friends, isLoading } = useFriends();

  const findExisting = (fid: number) =>
    existingChats.find((c) =>
      c.participants.some((p) => p.user.id === myId) &&
      c.participants.some((p) => p.user.id === fid),
    )?.id;

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}><View style={fp.backdrop} /></TouchableWithoutFeedback>
      <View style={fp.sheet}>
        <View style={fp.pill} />
        <View style={fp.hdr}>
          <Text style={fp.hdrTitle}>Написать другу</Text>
          <TouchableOpacity style={fp.closeBtn} onPress={onClose}>
            <Icon name="x" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>
        {isLoading ? (
          <View style={fp.center}><ActivityIndicator color={colors.accent} /></View>
        ) : !friends?.length ? (
          <View style={fp.empty}>
            <Icon name="users" size={32} color={colors.primary + '40'} />
            <Text style={fp.emptyT}>У вас пока нет друзей</Text>
            <Text style={fp.emptySub}>Добавьте друзей на вкладке «Друзья»</Text>
          </View>
        ) : (
          <FlatList
            data={friends}
            keyExtractor={(i) => String(i.id)}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 8 }}
            renderItem={({ item }) => {
              const eid = findExisting(item.id);
              const ini = item.nickName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
              return (
                <TouchableOpacity
                  style={fp.fRow}
                  onPress={() => { onSelect(item, eid); onClose(); }}
                  activeOpacity={0.7}
                >
                  {item.avatarUrl
                    ? <Image source={{ uri: item.avatarUrl }} style={fp.fAv} />
                    : <View style={fp.fAvPh}><Text style={fp.fAvIn}>{ini}</Text></View>}
                  <View style={{ flex: 1 }}>
                    <Text style={fp.fName} numberOfLines={1}>{item.nickName}</Text>
                    <Text style={fp.fUser}>@{item.username}</Text>
                  </View>
                  <View style={[fp.chip, !!eid && fp.chipOpen]}>
                    <Icon name={eid ? 'message-circle' : 'edit-2'} size={13} color={eid ? colors.accent : colors.text} />
                    <Text style={[fp.chipT, !!eid && fp.chipTOpen]}>{eid ? 'Открыть' : 'Написать'}</Text>
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

const fp = StyleSheet.create({
  backdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet:     { backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.primary + '20', maxHeight: '72%', paddingHorizontal: 20 },
  pill:      { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.primary + '40', alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  hdr:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 },
  hdrTitle:  { fontSize: 18, fontWeight: '700', color: colors.text },
  closeBtn:  { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.secondary + '40', alignItems: 'center', justifyContent: 'center' },
  center:    { paddingVertical: 40, alignItems: 'center' },
  empty:     { paddingVertical: 40, alignItems: 'center', gap: 10 },
  emptyT:    { fontSize: 16, fontWeight: '700', color: colors.text },
  emptySub:  { fontSize: 13, color: colors.primary + '60', textAlign: 'center' },
  fRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.primary + '10' },
  fAv:       { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: colors.accent + '40' },
  fAvPh:     { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.secondary + '60', borderWidth: 2, borderColor: colors.accent + '30', alignItems: 'center', justifyContent: 'center' },
  fAvIn:     { fontSize: 16, fontWeight: '700', color: colors.text },
  fName:     { fontSize: 15, fontWeight: '700', color: colors.text },
  fUser:     { fontSize: 13, color: colors.accent, fontWeight: '500', marginTop: 2 },
  chip:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.accent, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  chipOpen:  { backgroundColor: colors.accent + '20', borderWidth: 1.5, borderColor: colors.accent + '50' },
  chipT:     { fontSize: 12, fontWeight: '700', color: colors.text },
  chipTOpen: { color: colors.accent },
});

// ─── ChatsScreen ──────────────────────────────────────────────────────────────

const ChatsScreen = () => {
  const navigation = useNavigation<NavProp>();
  const [refreshing,     setRefreshing]     = useState(false);
  const [pickerVisible,  setPickerVisible]  = useState(false);
  const [menuChat,       setMenuChat]       = useState<Chat | null>(null);

  const { data: me }    = useMe();
  const { data: chats, isLoading, refetch } = useChats();
  const { data: unreadPerChat } = useUnreadPerChat();
  const { data: totalUnread }   = useUnreadCount();
  const { mutate: deleteChat }  = useDeleteChat();
  const { mutateAsync: createChat, isPending: isCreating } = useCreateChat();
  const isTypingInChat = useGlobalTyping();

  const getUnread = (chatId: number) =>
    unreadPerChat?.find((u) => u.chatId === chatId)?.unreadCount ?? 0;

  const handleRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };

  const openChat = (chatId: number, otherUser: OtherUser) =>
    navigation.navigate('ChatScreen', { chatId, otherUser });

  const handleChatPress = (chat: Chat) => {
    if (!me) return;
    openChat(chat.id, getOtherUser(chat, me.id));
  };

  const handleFriendSelect = async (friend: Friend, existingChatId?: number) => {
    const ou: OtherUser = { id: friend.id, nickName: friend.nickName, username: friend.username, avatarUrl: friend.avatarUrl };
    if (existingChatId) { openChat(existingChatId, ou); return; }
    try { const chat = await createChat(friend.id); openChat(chat.id, ou); } catch {}
  };

  if (isLoading) {
    return <View style={ss.loading}><ActivityIndicator size="large" color={colors.accent} /></View>;
  }

  const totalCount = totalUnread?.count ?? 0;

  return (
    <View style={ss.container}>
      {/* Header */}
      <View style={ss.header}>
        <View style={ss.headerLeft}>
          <Text style={ss.headerTitle}>Чаты</Text>
          {totalCount > 0 && (
            <View style={ss.totalBadge}>
              <Text style={ss.totalBadgeText}>{totalCount > 99 ? '99+' : totalCount}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          style={ss.newBtn}
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
        <View style={ss.empty}>
          <View style={ss.emptyIcon}><Icon name="message-circle" size={36} color={colors.accent + '70'} /></View>
          <Text style={ss.emptyTitle}>Нет чатов</Text>
          <Text style={ss.emptySub}>Нажмите карандаш вверху, чтобы написать другу</Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={ss.list}
          showsVerticalScrollIndicator={false}
          extraData={isTypingInChat}
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
              isTyping={isTypingInChat(item.id)}
              onPress={() => handleChatPress(item)}
              onLongPress={() => setMenuChat(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={ss.sep} />}
        />
      )}

      <FriendsPicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        existingChats={chats ?? []}
        myId={me?.id ?? 0}
        onSelect={handleFriendSelect}
      />

      <DeleteMenu
        chat={menuChat}
        myId={me?.id ?? 0}
        onClose={() => setMenuChat(null)}
        onDeleteSelf={() => menuChat && deleteChat({ chatId: menuChat.id, forEveryone: false })}
        onDeleteAll={() =>  menuChat && deleteChat({ chatId: menuChat.id, forEveryone: true })}
      />
    </View>
  );
};

const ss = StyleSheet.create({
  container:    { flex: 1, backgroundColor: colors.background },
  loading:      { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.primary + '12' },
  headerLeft:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle:  { fontSize: 28, fontWeight: '700', color: colors.text, letterSpacing: -0.5 },
  totalBadge:   { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, minWidth: 22, alignItems: 'center' },
  totalBadgeText: { fontSize: 12, fontWeight: '700', color: colors.text },
  newBtn:       { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  list:         { paddingVertical: 8, paddingHorizontal: 16 },
  sep:          { height: 1, backgroundColor: colors.primary + '10', marginLeft: 82 },
  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  emptyIcon:    { width: 80, height: 80, borderRadius: 28, backgroundColor: colors.secondary + '30', borderWidth: 1, borderColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle:   { fontSize: 18, fontWeight: '700', color: colors.text },
  emptySub:     { fontSize: 14, color: colors.primary + '70', textAlign: 'center', lineHeight: 20 },
});

export default ChatsScreen;