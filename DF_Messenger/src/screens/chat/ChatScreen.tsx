import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import DocumentPicker from 'react-native-document-picker';
import Icon from 'react-native-vector-icons/Feather';
import { colors } from '../../styles/colors';
import { useChatRoom, useTyping } from '../../hooks/chat.hook';
import { useMe } from '../../hooks/user.hook';
import { useUserOnlineStatus } from '../../hooks/presence.hook';
import { Message } from '../../api/chat.types';
import { AppStackParamList } from '../../navigation/types';
import { api } from '../../api/client'; // your axios instance

type RouteParams = RouteProp<AppStackParamList, 'ChatScreen'>;

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡'];

// ─── Upload helper ────────────────────────────────────────────────────────────
// Adjust endpoint + field names to match your backend

const uploadMedia = async (
  chatId: number,
  file: { uri: string; name: string; type: string },
): Promise<{ url: string; type: string }> => {
  const form = new FormData();
  form.append('file', { uri: file.uri, name: file.name, type: file.type } as any);
  form.append('chatId', String(chatId));

  const res = await api.post('/chat/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data; // expect { url: string, type: 'IMAGE'|'VIDEO'|'AUDIO'|'FILE' }
};

// ─── Typing indicator ─────────────────────────────────────────────────────────

const TypingIndicator: React.FC = () => {
  const dot0 = useRef(new Animated.Value(0)).current;
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dots = [dot0, dot1, dot2];

  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(dot, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 350, useNativeDriver: true }),
          Animated.delay((2 - i) * 160),
        ]),
      ),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={typingStyles.wrap}>
      <View style={typingStyles.bubble}>
        {dots.map((dot, i) => (
          <Animated.View
            key={i}
            style={[typingStyles.dot, {
              transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }],
            }]}
          />
        ))}
      </View>
    </View>
  );
};

const typingStyles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingVertical: 4, alignSelf: 'flex-start' },
  bubble: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.secondary + '35',
    borderRadius: 18, borderBottomLeftRadius: 4,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: colors.primary + '20',
  },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.primary + '80' },
});

// ─── Message bubble ───────────────────────────────────────────────────────────

interface BubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  onLongPress: (msg: Message) => void;
  onReact: (messageId: number, emoji: string) => void;
}

const MessageBubble: React.FC<BubbleProps> = React.memo(
  ({ message, isOwn, showAvatar, onLongPress, onReact }) => {
    const initials = (message.sender?.nickName ?? '?')
      .split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

    const time = new Date(message.createdAt).toLocaleTimeString('ru-RU', {
      hour: '2-digit', minute: '2-digit',
    });

    const reactions = Array.isArray(message.reactions) ? message.reactions : [];
    const grouped = reactions.reduce<Record<string, number>>((acc, r) => {
      acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
      return acc;
    }, {});

    // ── Media preview ─────────────────────────────────────────────────────────
    const renderMedia = () => {
      const url = message.mediaUrl ?? message.content;
      switch (message.type) {
        case 'IMAGE':
          return (
            <TouchableOpacity onPress={() => url && Linking.openURL(url)} activeOpacity={0.9}>
              <Image source={{ uri: url ?? '' }} style={bubbleStyles.mediaImage} resizeMode="cover" />
            </TouchableOpacity>
          );
        case 'VIDEO':
          return (
            <TouchableOpacity
              style={bubbleStyles.mediaFile}
              onPress={() => url && Linking.openURL(url)}
              activeOpacity={0.8}
            >
              <Icon name="video" size={20} color={isOwn ? colors.text : colors.primary} />
              <Text style={[bubbleStyles.mediaFileText, isOwn && { color: colors.text }]}>
                Видео
              </Text>
            </TouchableOpacity>
          );
        case 'AUDIO':
          return (
            <TouchableOpacity
              style={bubbleStyles.mediaFile}
              onPress={() => url && Linking.openURL(url)}
              activeOpacity={0.8}
            >
              <Icon name="mic" size={20} color={isOwn ? colors.text : colors.primary} />
              <Text style={[bubbleStyles.mediaFileText, isOwn && { color: colors.text }]}>
                Аудио
              </Text>
            </TouchableOpacity>
          );
        case 'FILE':
          return (
            <TouchableOpacity
              style={bubbleStyles.mediaFile}
              onPress={() => url && Linking.openURL(url)}
              activeOpacity={0.8}
            >
              <Icon name="paperclip" size={20} color={isOwn ? colors.text : colors.primary} />
              <Text style={[bubbleStyles.mediaFileText, isOwn && { color: colors.text }]}>
                {message.content ?? 'Файл'}
              </Text>
            </TouchableOpacity>
          );
        default:
          return (
            <Text style={[bubbleStyles.text, isOwn && bubbleStyles.textOwn]}>
              {message.content ?? ''}
            </Text>
          );
      }
    };

    return (
      <View style={[bubbleStyles.row, isOwn ? bubbleStyles.rowOwn : bubbleStyles.rowOther]}>
        {!isOwn && (
          <View style={bubbleStyles.avatarCol}>
            {showAvatar ? (
              message.sender?.avatarUrl ? (
                <Image source={{ uri: message.sender.avatarUrl }} style={bubbleStyles.avatar} />
              ) : (
                <View style={bubbleStyles.avatarPlaceholder}>
                  <Text style={bubbleStyles.avatarInitials}>{initials}</Text>
                </View>
              )
            ) : (
              <View style={bubbleStyles.avatarSpacer} />
            )}
          </View>
        )}

        <View style={[bubbleStyles.column, isOwn && bubbleStyles.columnOwn]}>
          <TouchableOpacity
            onLongPress={() => onLongPress(message)}
            activeOpacity={0.85}
            style={[bubbleStyles.bubble, isOwn ? bubbleStyles.bubbleOwn : bubbleStyles.bubbleOther]}
          >
            {renderMedia()}
            <Text style={[bubbleStyles.time, isOwn && bubbleStyles.timeOwn]}>{time}</Text>
          </TouchableOpacity>

          {Object.keys(grouped).length > 0 && (
            <View style={[bubbleStyles.reactionsRow, isOwn && bubbleStyles.reactionsRowOwn]}>
              {Object.entries(grouped).map(([emoji, count]) => (
                <TouchableOpacity
                  key={emoji}
                  style={bubbleStyles.reactionChip}
                  onPress={() => onReact(message.id, emoji)}
                  activeOpacity={0.7}
                >
                  <Text style={bubbleStyles.reactionEmoji}>{emoji}</Text>
                  {count > 1 && <Text style={bubbleStyles.reactionCount}>{count}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>
    );
  },
);

const bubbleStyles = StyleSheet.create({
  row: { flexDirection: 'row', marginVertical: 2, paddingHorizontal: 12 },
  rowOwn: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  avatarCol: { width: 34, marginRight: 8, alignSelf: 'flex-end', marginBottom: 4 },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  avatarPlaceholder: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.secondary + '60', alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontSize: 11, fontWeight: '700', color: colors.text },
  avatarSpacer: { width: 34 },
  column: { maxWidth: '75%', alignItems: 'flex-start' },
  columnOwn: { alignItems: 'flex-end' },
  bubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginBottom: 2, overflow: 'hidden' },
  bubbleOwn: { backgroundColor: colors.accent, borderBottomRightRadius: 4 },
  bubbleOther: {
    backgroundColor: colors.secondary + '35', borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: colors.primary + '20',
  },
  text: { fontSize: 15, color: colors.primary, lineHeight: 21, paddingHorizontal: 2 },
  textOwn: { color: colors.text },
  time: { fontSize: 11, color: colors.primary + '60', marginTop: 5, textAlign: 'right', paddingHorizontal: 2 },
  timeOwn: { color: colors.text + 'AA' },
  mediaImage: { width: 220, height: 160, borderRadius: 12, marginBottom: 4 },
  mediaFile: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 4, paddingVertical: 4,
  },
  mediaFileText: { fontSize: 14, color: colors.primary, fontWeight: '500', flexShrink: 1 },
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  reactionsRowOwn: { justifyContent: 'flex-end' },
  reactionChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.secondary + '40', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 1, borderColor: colors.primary + '25',
  },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 11, color: colors.primary, marginLeft: 3, fontWeight: '600' },
});

// ─── Reaction picker ──────────────────────────────────────────────────────────

const ReactionPicker: React.FC<{
  message: Message | null;
  onReact: (messageId: number, emoji: string) => void;
  onClose: () => void;
}> = ({ message, onReact, onClose }) => (
  <Modal transparent animationType="fade" visible={!!message} onRequestClose={onClose}>
    <TouchableWithoutFeedback onPress={onClose}>
      <View style={rpStyles.backdrop}>
        <TouchableWithoutFeedback>
          <View style={rpStyles.sheet}>
            <Text style={rpStyles.hint}>Реакция</Text>
            <View style={rpStyles.row}>
              {QUICK_REACTIONS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={rpStyles.btn}
                  onPress={() => { if (message) onReact(message.id, emoji); onClose(); }}
                  activeOpacity={0.7}
                >
                  <Text style={rpStyles.emoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableWithoutFeedback>
      </View>
    </TouchableWithoutFeedback>
  </Modal>
);

const rpStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  sheet: {
    backgroundColor: colors.background, borderRadius: 24,
    borderWidth: 1, borderColor: colors.primary + '20',
    paddingVertical: 20, paddingHorizontal: 24, alignItems: 'center', gap: 14,
  },
  hint: { fontSize: 13, color: colors.primary + '70', fontWeight: '500' },
  row: { flexDirection: 'row', gap: 6 },
  btn: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: colors.secondary + '30', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.primary + '15',
  },
  emoji: { fontSize: 26 },
});

// ─── Media picker sheet ───────────────────────────────────────────────────────

const MediaPickerSheet: React.FC<{
  visible: boolean;
  onClose: () => void;
  onPick: (file: { uri: string; name: string; type: string }) => void;
}> = ({ visible, onClose, onPick }) => {
  const pick = async (action: () => Promise<void>) => {
    onClose();
    await action();
  };

  const pickImage = async () => {
    const res = await launchImageLibrary({ mediaType: 'photo', quality: 1 });
    const asset = res.assets?.[0];
    if (asset?.uri)
      onPick({ uri: asset.uri, name: asset.fileName ?? 'photo.jpg', type: asset.type ?? 'image/jpeg' });
  };

  const pickVideo = async () => {
    const res = await launchImageLibrary({ mediaType: 'video' });
    const asset = res.assets?.[0];
    if (asset?.uri)
      onPick({ uri: asset.uri, name: asset.fileName ?? 'video.mp4', type: asset.type ?? 'video/mp4' });
  };

  const pickCamera = async () => {
    const res = await launchCamera({ mediaType: 'photo', quality: 1 });
    const asset = res.assets?.[0];
    if (asset?.uri)
      onPick({ uri: asset.uri, name: asset.fileName ?? 'photo.jpg', type: asset.type ?? 'image/jpeg' });
  };

  const pickAudio = async () => {
    const res = await DocumentPicker.pickSingle({ type: [DocumentPicker.types.audio] });
    onPick({ uri: res.uri, name: res.name ?? 'audio', type: res.type ?? 'audio/mpeg' });
  };

  const pickFile = async () => {
    const res = await DocumentPicker.pickSingle({ type: [DocumentPicker.types.allFiles] });
    onPick({ uri: res.uri, name: res.name ?? 'file', type: res.type ?? 'application/octet-stream' });
  };

  const options: { icon: string; label: string; action: () => void; color: string }[] = [
    { icon: 'image',    label: 'Фото',      action: () => pick(pickImage),  color: '#6ecfff' },
    { icon: 'camera',   label: 'Камера',    action: () => pick(pickCamera), color: '#a0e4a0' },
    { icon: 'video',    label: 'Видео',     action: () => pick(pickVideo),  color: '#ffb86c' },
    { icon: 'mic',      label: 'Аудио',     action: () => pick(pickAudio),  color: colors.accent },
    { icon: 'paperclip',label: 'Файл',      action: () => pick(pickFile),   color: '#d0aeff' },
  ];

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={mpStyles.backdrop} />
      </TouchableWithoutFeedback>
      <View style={mpStyles.sheet}>
        <View style={mpStyles.handle} />
        <Text style={mpStyles.title}>Прикрепить</Text>
        <View style={mpStyles.grid}>
          {options.map((o) => (
            <TouchableOpacity key={o.label} style={mpStyles.option} onPress={o.action} activeOpacity={0.7}>
              <View style={[mpStyles.iconWrap, { backgroundColor: o.color + '25', borderColor: o.color + '60' }]}>
                <Icon name={o.icon} size={24} color={o.color} />
              </View>
              <Text style={mpStyles.optionLabel}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ height: 24 }} />
      </View>
    </Modal>
  );
};

const mpStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderWidth: 1, borderColor: colors.primary + '20',
    paddingHorizontal: 24, paddingTop: 8,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.primary + '40', alignSelf: 'center', marginBottom: 16,
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  option: { alignItems: 'center', gap: 8, width: 60 },
  iconWrap: {
    width: 60, height: 60, borderRadius: 18,
    borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
  },
  optionLabel: { fontSize: 12, fontWeight: '600', color: colors.primary, textAlign: 'center' },
});

// ─── ChatScreen ───────────────────────────────────────────────────────────────

const ChatScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteParams>();
  const { chatId, otherUser } = route.params;

  const { data: me } = useMe();
  const { isOnline } = useUserOnlineStatus(otherUser.id);
  const { messages, isLoading, sendMessage, reactToMessage, markRead } = useChatRoom(chatId);
  const { typingUserIds, startTyping, stopTyping } = useTyping(chatId);

  const [inputText, setInputText]           = useState('');
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [mediaPickerVisible, setMediaPickerVisible] = useState(false);
  const [uploading, setUploading]           = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { markRead(); }, [chatId]);
  useEffect(() => { if (messages.length > 0) markRead(); }, [messages.length]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    setInputText('');
    sendMessage(text);
    stopTyping();
    if (typingTimer.current) clearTimeout(typingTimer.current);
  }, [inputText, sendMessage, stopTyping]);

  const handleTextChange = useCallback((text: string) => {
    setInputText(text);
    if (text.length > 0) {
      startTyping();
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => stopTyping(), 2_000);
    } else {
      stopTyping();
      if (typingTimer.current) clearTimeout(typingTimer.current);
    }
  }, [startTyping, stopTyping]);

  const handleMediaPick = useCallback(async (file: { uri: string; name: string; type: string }) => {
    setUploading(true);
    try {
      const result = await uploadMedia(chatId, file);
      // After upload, notify via socket using the returned URL as content
      // and type if your backend's send_message supports it.
      // Adjust this to match your backend's socket event signature:
      sendMessage(result.url); // fallback — send URL as text if no type field
    } catch (err) {
      Alert.alert('Ошибка', 'Не удалось загрузить файл. Проверь подключение.');
    } finally {
      setUploading(false);
    }
  }, [chatId, sendMessage]);

  const reversedMessages = messages.slice().reverse();

  const renderMessage = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const isOwn     = item.senderId === me?.id;
      const nextItem  = reversedMessages[index - 1];
      const showAvatar = !isOwn && (!nextItem || nextItem.senderId !== item.senderId);
      return (
        <MessageBubble
          message={item}
          isOwn={isOwn}
          showAvatar={showAvatar}
          onLongPress={setSelectedMessage}
          onReact={reactToMessage}
        />
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me?.id, messages, reactToMessage],
  );

  const otherInitials = otherUser.nickName
    .split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          <View style={styles.headerAvatarWrap}>
            {otherUser.avatarUrl ? (
              <Image source={{ uri: otherUser.avatarUrl }} style={styles.headerAvatar} />
            ) : (
              <View style={styles.headerAvatarPlaceholder}>
                <Text style={styles.headerAvatarInitials}>{otherInitials}</Text>
              </View>
            )}
            {isOnline && <View style={styles.headerOnlineDot} />}
          </View>
          <View style={styles.headerTextCol}>
            <Text style={styles.headerName} numberOfLines={1}>{otherUser.nickName}</Text>
            <Text style={[styles.headerStatus, isOnline && styles.headerStatusOnline]}>
              {isOnline ? 'онлайн' : `@${otherUser.username}`}
            </Text>
          </View>
        </View>

        <View style={{ width: 40 }} />
      </View>

      {/* ── Messages + input ── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={reversedMessages}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderMessage}
            inverted
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.messagesList}
            ListHeaderComponent={
              typingUserIds.length > 0
                ? <View style={{ paddingBottom: 4 }}><TypingIndicator /></View>
                : null
            }
          />
        )}

        {/* ── Input bar ── */}
        <View style={styles.inputBar}>
          {/* Attach button */}
          <TouchableOpacity
            style={styles.attachBtn}
            onPress={() => setMediaPickerVisible(true)}
            disabled={uploading}
            activeOpacity={0.8}
          >
            {uploading
              ? <ActivityIndicator size="small" color={colors.accent} />
              : <Icon name="paperclip" size={20} color={colors.primary + '90'} />}
          </TouchableOpacity>

          <View style={styles.inputWrap}>
            <TextInput
              value={inputText}
              onChangeText={handleTextChange}
              style={styles.input}
              placeholder="Сообщение..."
              placeholderTextColor={colors.primary + '50'}
              multiline
              maxLength={2_000}
            />
          </View>

          <TouchableOpacity
            style={[styles.sendBtn, !inputText.trim() && !uploading && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || uploading}
            activeOpacity={0.85}
          >
            <Icon
              name="send"
              size={18}
              color={inputText.trim() ? colors.text : colors.primary + '40'}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <ReactionPicker
        message={selectedMessage}
        onReact={reactToMessage}
        onClose={() => setSelectedMessage(null)}
      />

      <MediaPickerSheet
        visible={mediaPickerVisible}
        onClose={() => setMediaPickerVisible(false)}
        onPick={handleMediaPick}
      />
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 36,
    paddingBottom: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: colors.primary + '15', gap: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: colors.secondary + '40', alignItems: 'center', justifyContent: 'center',
  },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatarWrap: { position: 'relative' },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: colors.accent + '50' },
  headerAvatarPlaceholder: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.secondary + '60', borderWidth: 2, borderColor: colors.accent + '40',
    alignItems: 'center', justifyContent: 'center',
  },
  headerAvatarInitials: { fontSize: 13, fontWeight: '700', color: colors.text },
  headerOnlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 11, height: 11, borderRadius: 5.5,
    backgroundColor: colors.onlineColor, borderWidth: 2, borderColor: colors.background,
  },
  headerTextCol: { flex: 1 },
  headerName: { fontSize: 16, fontWeight: '700', color: colors.text, letterSpacing: -0.2 },
  headerStatus: { fontSize: 12, color: colors.primary + '60', marginTop: 1 },
  headerStatusOnline: { color: colors.onlineColor, fontWeight: '600' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messagesList: { paddingVertical: 12, paddingBottom: 6 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 10, paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 10,
    borderTopWidth: 1, borderTopColor: colors.primary + '12',
    backgroundColor: colors.background, gap: 8,
  },
  attachBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  inputWrap: {
    flex: 1, backgroundColor: colors.secondary + '30',
    borderRadius: 22, borderWidth: 1.5, borderColor: colors.primary + '25',
    paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    maxHeight: 120,
  },
  input: { color: colors.text, fontSize: 15, lineHeight: 20 },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  sendBtnDisabled: { backgroundColor: colors.secondary + '40', shadowOpacity: 0, elevation: 0 },
});

export default ChatScreen;