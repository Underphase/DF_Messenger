import {
  RouteProp,
  useFocusEffect,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Clipboard,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { pick } from '@react-native-documents/picker'
import { launchCamera, launchImageLibrary } from "react-native-image-picker";
import Icon from "react-native-vector-icons/Feather";
import {
  Chat,
  Message,
  MessageType,
  PinnedMessage,
} from "../../api/chat.types";
import {
  useChatRoom,
  useChats,
  useForwardToChat,
  useSearchMessages,
  useTyping,
} from "../../hooks/chat.hook";
import { useUserOnlineStatus } from "../../hooks/presence.hook";
import { useMe } from "../../hooks/user.hook";
import { AppStackParamList } from "../../navigation/types";
import { colors } from "../../styles/colors";

type RouteParams = RouteProp<AppStackParamList, "ChatScreen">;

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "😡"];
const { height: SCREEN_H } = Dimensions.get("window");
const SHEET_W = 264;

// ─── helpers ──────────────────────────────────────────────────────────────────

function getOtherParticipant(chat: Chat, myId: number) {
  return (
    chat.participants?.find((p) => p.user.id !== myId)?.user ??
    chat.participants?.[0]?.user
  );
}

// ─── TypingIndicator ──────────────────────────────────────────────────────────

const TypingIndicator: React.FC = () => {
  const dots = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];
  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(dot, {
            toValue: 1,
            duration: 350,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 350,
            useNativeDriver: true,
          }),
          Animated.delay((2 - i) * 160),
        ])
      )
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={tyS.wrap}>
      <View style={tyS.bubble}>
        {dots.map((dot, i) => (
          <Animated.View
            key={i}
            style={[
              tyS.dot,
              {
                transform: [
                  {
                    translateY: dot.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -5],
                    }),
                  },
                ],
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
};
const tyS = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingVertical: 4, alignSelf: "flex-start" },
  bubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.secondary + "35",
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.primary + "20",
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.primary + "80",
  },
});

// ─── PinnedBanner ─────────────────────────────────────────────────────────────

const PinnedBanner: React.FC<{
  pinnedMessages: PinnedMessage[];
  activeIndex: number;
  onPress: () => void;
}> = ({ pinnedMessages, activeIndex, onPress }) => {
  const pinned = pinnedMessages[activeIndex];
  if (!pinned) return null;
  const msg = pinned.message;
  const total = pinnedMessages.length;
  const label =
    msg.type === "TEXT"
      ? msg.content ?? ""
      : (
          {
            IMAGE: "🖼 Фото",
            VIDEO: "🎥 Видео",
            FILE: "📎 Файл",
            AUDIO: "🎵 Аудио",
          } as Record<MessageType, string>
        )[msg.type] ?? "📎";

  return (
    <TouchableOpacity style={pbS.wrap} onPress={onPress} activeOpacity={0.8}>
      <View style={pbS.bars}>
        {pinnedMessages.map((_, i) => (
          <View key={i} style={[pbS.bar, i === activeIndex && pbS.barActive]} />
        ))}
      </View>
      <View style={pbS.content}>
        <Text style={pbS.label}>
          📌 {total > 1 ? `Закреп ${activeIndex + 1}/${total}` : "Закреплённое"}
        </Text>
        <Text style={pbS.text} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Icon name="chevron-right" size={16} color={colors.accent + "80"} />
    </TouchableOpacity>
  );
};
const pbS = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.secondary + "25",
    borderBottomWidth: 1,
    borderBottomColor: colors.primary + "15",
    paddingVertical: 9,
    paddingHorizontal: 16,
    gap: 10,
  },
  bars: { flexDirection: "column", gap: 3 },
  bar: {
    width: 3,
    height: 8,
    borderRadius: 2,
    backgroundColor: colors.primary + "30",
  },
  barActive: { backgroundColor: colors.accent },
  content: { flex: 1 },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accent,
    marginBottom: 2,
  },
  text: { fontSize: 13, color: colors.text, lineHeight: 17 },
});

// ─── SearchBar ────────────────────────────────────────────────────────────────

const SearchBar: React.FC<{
  chatId: number;
  onClose: () => void;
  onGoTo: (msgId: number) => void;
}> = ({ chatId, onClose, onGoTo }) => {
  const [q, setQ] = useState("");
  const { data: results, isFetching } = useSearchMessages(chatId, q);
  return (
    <View style={sbS.container}>
      <View style={sbS.row}>
        <Icon name="search" size={16} color={colors.primary + "70"} />
        <TextInput
          style={sbS.input}
          placeholder="Поиск в чате..."
          placeholderTextColor={colors.primary + "50"}
          value={q}
          onChangeText={setQ}
          autoFocus
        />
        {isFetching && <ActivityIndicator size="small" color={colors.accent} />}
        <TouchableOpacity onPress={onClose}>
          <Icon name="x" size={18} color={colors.primary + "80"} />
        </TouchableOpacity>
      </View>
      {results && results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={(item) => String(item.id)}
          style={sbS.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity
              style={sbS.result}
              onPress={() => {
                onGoTo(item.id);
                onClose();
              }}
            >
              <Text style={sbS.sender}>{item.sender?.nickName}</Text>
              <Text style={sbS.text} numberOfLines={1}>
                {item.content ?? "📎 Медиа"}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
      {results?.length === 0 && q.trim().length > 1 && !isFetching && (
        <Text style={sbS.empty}>Ничего не найдено</Text>
      )}
    </View>
  );
};
const sbS = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary + "15",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  input: { flex: 1, fontSize: 15, color: colors.text },
  list: {
    maxHeight: 220,
    borderTopWidth: 1,
    borderTopColor: colors.primary + "10",
  },
  result: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary + "08",
  },
  sender: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accent,
    marginBottom: 2,
  },
  text: { fontSize: 13, color: colors.primary },
  empty: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 13,
    color: colors.primary + "60",
  },
});

// ─── DeleteDialog ─────────────────────────────────────────────────────────────

const DeleteDialog: React.FC<{
  visible: boolean;
  multiCount?: number;
  onClose: () => void;
  onDeleteSelf: () => void;
  onDeleteAll: () => void;
}> = ({ visible, multiCount, onClose, onDeleteSelf, onDeleteAll }) => {
  const scaleAnim = useRef(new Animated.Value(0.88)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 90,
          friction: 10,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.88);
      fadeAnim.setValue(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  if (!visible) return null;
  const label =
    multiCount && multiCount > 1 ? `${multiCount} сообщ.` : "сообщение";
  return (
    <Modal
      transparent
      animationType="none"
      visible={visible}
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[dlgS.backdrop, { opacity: fadeAnim }]}>
          <TouchableWithoutFeedback>
            <Animated.View
              style={[
                dlgS.card,
                { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
              ]}
            >
              <View
                style={[
                  dlgS.iconWrap,
                  { backgroundColor: "rgba(255,69,58,0.12)" },
                ]}
              >
                <Icon name="trash-2" size={30} color="#ff453a" />
              </View>
              <Text style={dlgS.title}>Удалить {label}?</Text>
              <TouchableOpacity
                style={[
                  dlgS.rowPrimary,
                  {
                    backgroundColor: "rgba(255,69,58,0.1)",
                    borderColor: "rgba(255,69,58,0.28)",
                  },
                ]}
                onPress={onDeleteAll}
                activeOpacity={0.82}
              >
                <View style={[dlgS.rowIcon, { backgroundColor: "#ff453a" }]}>
                  <Icon name="users" size={16} color="#fff" />
                </View>
                <View style={dlgS.rowText}>
                  <Text style={[dlgS.rowTitle, { color: "#ff453a" }]}>
                    Удалить у всех
                  </Text>
                  <Text style={dlgS.rowSub}>Пропадёт у обоих участников</Text>
                </View>
                <Icon
                  name="chevron-right"
                  size={16}
                  color="#ff453a"
                  style={{ opacity: 0.7 }}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  dlgS.rowPrimary,
                  {
                    backgroundColor: colors.secondary + "28",
                    borderColor: colors.primary + "12",
                  },
                ]}
                onPress={onDeleteSelf}
                activeOpacity={0.82}
              >
                <View
                  style={[
                    dlgS.rowIcon,
                    { backgroundColor: colors.secondary + "90" },
                  ]}
                >
                  <Icon name="user" size={16} color={colors.primary} />
                </View>
                <View style={dlgS.rowText}>
                  <Text style={[dlgS.rowTitle, { color: colors.text }]}>
                    Удалить у себя
                  </Text>
                  <Text style={dlgS.rowSub}>Только вы не увидите</Text>
                </View>
                <Icon
                  name="chevron-right"
                  size={16}
                  color={colors.primary}
                  style={{ opacity: 0.4 }}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={dlgS.cancel}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Text style={dlgS.cancelText}>Отмена</Text>
              </TouchableOpacity>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

// ─── PinDialog ────────────────────────────────────────────────────────────────

const PinDialog: React.FC<{
  visible: boolean;
  onClose: () => void;
  onPinSelf: () => void;
  onPinAll: () => void;
}> = ({ visible, onClose, onPinSelf, onPinAll }) => {
  const scaleAnim = useRef(new Animated.Value(0.88)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 90,
          friction: 10,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.88);
      fadeAnim.setValue(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  if (!visible) return null;
  return (
    <Modal
      transparent
      animationType="none"
      visible={visible}
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[dlgS.backdrop, { opacity: fadeAnim }]}>
          <TouchableWithoutFeedback>
            <Animated.View
              style={[
                dlgS.card,
                { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
              ]}
            >
              <View
                style={[
                  dlgS.iconWrap,
                  { backgroundColor: colors.accent + "20" },
                ]}
              >
                <Icon name="bookmark" size={30} color={colors.accent} />
              </View>
              <Text style={dlgS.title}>Закрепить сообщение?</Text>
              <TouchableOpacity
                style={[
                  dlgS.rowPrimary,
                  {
                    backgroundColor: colors.accent + "15",
                    borderColor: colors.accent + "40",
                  },
                ]}
                onPress={onPinAll}
                activeOpacity={0.82}
              >
                <View
                  style={[dlgS.rowIcon, { backgroundColor: colors.accent }]}
                >
                  <Icon name="users" size={16} color="#fff" />
                </View>
                <View style={dlgS.rowText}>
                  <Text style={[dlgS.rowTitle, { color: colors.accent }]}>
                    Закрепить у всех
                  </Text>
                  <Text style={dlgS.rowSub}>Увидят оба участника</Text>
                </View>
                <Icon
                  name="chevron-right"
                  size={16}
                  color={colors.accent}
                  style={{ opacity: 0.7 }}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  dlgS.rowPrimary,
                  {
                    backgroundColor: colors.secondary + "28",
                    borderColor: colors.primary + "12",
                  },
                ]}
                onPress={onPinSelf}
                activeOpacity={0.82}
              >
                <View
                  style={[
                    dlgS.rowIcon,
                    { backgroundColor: colors.secondary + "90" },
                  ]}
                >
                  <Icon name="user" size={16} color={colors.primary} />
                </View>
                <View style={dlgS.rowText}>
                  <Text style={[dlgS.rowTitle, { color: colors.text }]}>
                    Закрепить у себя
                  </Text>
                  <Text style={dlgS.rowSub}>Только вы увидите закреп</Text>
                </View>
                <Icon
                  name="chevron-right"
                  size={16}
                  color={colors.primary}
                  style={{ opacity: 0.4 }}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={dlgS.cancel}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Text style={dlgS.cancelText}>Отмена</Text>
              </TouchableOpacity>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const dlgS = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 26,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.primary + "1A",
    padding: 20,
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 28,
    elevation: 16,
  },
  iconWrap: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 20,
    textAlign: "center",
  },
  rowPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: "700" },
  rowSub: { fontSize: 11, color: colors.primary + "65", marginTop: 2 },
  cancel: {
    width: "100%",
    paddingVertical: 13,
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: colors.secondary + "22",
    borderWidth: 1,
    borderColor: colors.primary + "0E",
  },
  cancelText: { fontSize: 14, fontWeight: "600", color: colors.primary + "A0" },
});

// ─── ForwardPicker ────────────────────────────────────────────────────────────

const ForwardPicker: React.FC<{
  visible: boolean;
  myId: number;
  onClose: () => void;
  onSelect: (chatId: number) => void;
}> = ({ visible, myId, onClose, onSelect }) => {
  const { data: chats, isLoading } = useChats();
  const slideY = useRef(new Animated.Value(400)).current;
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 75,
          friction: 12,
        }),
        Animated.timing(fade, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY, {
          toValue: 400,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(fade, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  if (!visible) return null;
  return (
    <Modal
      transparent
      animationType="none"
      visible={visible}
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[fpS.backdrop, { opacity: fade }]} />
      </TouchableWithoutFeedback>
      <Animated.View
        style={[fpS.sheet, { transform: [{ translateY: slideY }] }]}
      >
        <View style={fpS.handle} />
        <View style={fpS.header}>
          <Text style={fpS.title}>Переслать в чат</Text>
          <TouchableOpacity style={fpS.closeBtn} onPress={onClose}>
            <Icon name="x" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>
        {isLoading ? (
          <View style={fpS.center}>
            <ActivityIndicator color={colors.accent} size="large" />
          </View>
        ) : !chats?.length ? (
          <View style={fpS.center}>
            <Text style={fpS.emptyText}>Нет доступных чатов</Text>
          </View>
        ) : (
          <FlatList
            data={chats}
            keyExtractor={(item) => String(item.id)}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingBottom: Platform.OS === "ios" ? 36 : 16,
            }}
            renderItem={({ item }) => {
              const other = getOtherParticipant(item, myId);
              if (!other) return null;
              const initials = other.nickName
                .split(" ")
                .map((w: string) => w[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();
              const preview = item.messages?.[0];
              return (
                <TouchableOpacity
                  style={fpS.row}
                  onPress={() => {
                    onSelect(item.id);
                    onClose();
                  }}
                  activeOpacity={0.72}
                >
                  {other.avatarUrl ? (
                    <Image
                      source={{ uri: other.avatarUrl }}
                      style={fpS.avatar}
                    />
                  ) : (
                    <View style={fpS.avatarPh}>
                      <Text style={fpS.avatarIn}>{initials}</Text>
                    </View>
                  )}
                  <View style={fpS.info}>
                    <Text style={fpS.name} numberOfLines={1}>
                      {other.nickName}
                    </Text>
                    {preview && (
                      <Text style={fpS.preview} numberOfLines={1}>
                        {preview.content ?? "📎 Медиа"}
                      </Text>
                    )}
                  </View>
                  <View style={fpS.sendBtn}>
                    <Icon name="send" size={15} color="#fff" />
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </Animated.View>
    </Modal>
  );
};
const fpS = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.primary + "1E",
    maxHeight: "72%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary + "40",
    alignSelf: "center",
    marginTop: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  title: { fontSize: 18, fontWeight: "700", color: colors.text },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.secondary + "40",
    alignItems: "center",
    justifyContent: "center",
  },
  center: { paddingVertical: 48, alignItems: "center" },
  emptyText: { fontSize: 14, color: colors.primary + "60" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary + "0C",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.accent + "50",
  },
  avatarPh: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.secondary + "60",
    borderWidth: 2,
    borderColor: colors.accent + "30",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarIn: { fontSize: 16, fontWeight: "700", color: colors.text },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: "700", color: colors.text },
  preview: { fontSize: 12, color: colors.primary + "60", marginTop: 2 },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
});

// ─── TapActionSheet ───────────────────────────────────────────────────────────

interface TapSheetProps {
  message: Message | null;
  tapY: number;
  isOwn: boolean;
  isPinned: boolean;
  onClose: () => void;
  onReact: (messageId: number, emoji: string) => void;
  onReply: (msg: Message) => void;
  onEdit: (msg: Message) => void;
  onDeleteRequest: (msg: Message) => void;
  onForwardRequest: (msg: Message) => void;
  onPinRequest: (msg: Message) => void;
  onUnpinRequest: (msg: Message) => void;
  onCopy: (msg: Message) => void;
}

const TapActionSheet: React.FC<TapSheetProps> = ({
  message,
  tapY,
  isOwn,
  isPinned,
  onClose,
  onReact,
  onReply,
  onEdit,
  onDeleteRequest,
  onForwardRequest,
  onPinRequest,
  onUnpinRequest,
  onCopy,
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.86)).current;
  const isVisible = !!message;

  useEffect(() => {
    if (isVisible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 90,
          friction: 9,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 130,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 110,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.86,
          duration: 110,
          useNativeDriver: true,
        }),
      ]).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible]);

  if (!message) return null;

  const existing = Array.isArray(message.reactions) ? message.reactions : [];

  const actions = [
    {
      icon: "corner-up-left",
      label: "Ответить",
      color: colors.primary,
      onPress: () => { onReply(message); onClose(); },
    },
    {
      icon: "share-2",
      label: "Переслать",
      color: colors.primary,
      onPress: () => { onForwardRequest(message); onClose(); },
    },
    ...(message.type === "TEXT"
      ? [{
          icon: "copy",
          label: "Копировать",
          color: colors.primary,
          onPress: () => { onCopy(message); onClose(); },
        }]
      : []),
    isPinned
      ? {
          icon: "bookmark",
          label: "Открепить",
          color: "#ffb86c",
          onPress: () => { onUnpinRequest(message); onClose(); },
        }
      : {
          icon: "bookmark",
          label: "Закрепить",
          color: colors.accent,
          onPress: () => { onPinRequest(message); onClose(); },
        },
    ...(isOwn && message.type === "TEXT"
      ? [{
          icon: "edit-2",
          label: "Изменить",
          color: "#6ecfff",
          onPress: () => { onEdit(message); onClose(); },
        }]
      : []),
    {
      icon: "trash-2",
      label: "Удалить",
      color: "#ff6b6b",
      onPress: () => { onDeleteRequest(message); onClose(); },
    },
  ];

  const EMOJI_H = 58;
  const PREVIEW_H = 68;
  const ACTION_H = 44;
  const PAD_V = 20;
  const estimatedH = EMOJI_H + PREVIEW_H + actions.length * ACTION_H + PAD_V;
  const MARGIN = 14;
  const TOP_SAFE = Platform.OS === "ios" ? 60 : 40;
  const BOT_SAFE = Platform.OS === "ios" ? 44 : 16;

  // Если тап в нижней трети экрана — показываем шторку выше точки тапа
  const bottomThreshold = SCREEN_H * 0.6;
  let top: number;
  if (tapY > bottomThreshold) {
    top = tapY - estimatedH - 16;
  } else {
    top = tapY - estimatedH / 2;
  }
  top = Math.max(TOP_SAFE + MARGIN, top);
  top = Math.min(SCREEN_H - estimatedH - BOT_SAFE - MARGIN, top);

  return (
    <Modal
      transparent
      animationType="none"
      visible={isVisible}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[tasS.dimmer, { opacity: fadeAnim }]} />
      </TouchableWithoutFeedback>
      <Animated.View
        style={[
          tasS.sheet,
          isOwn ? { right: MARGIN } : { left: MARGIN },
          { top, opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
        ]}
        pointerEvents="box-none"
      >
        <View style={tasS.emojiRow}>
          {QUICK_REACTIONS.map((emoji) => {
            const selected = existing.some((r) => r.emoji === emoji);
            return (
              <TouchableOpacity
                key={emoji}
                style={[tasS.emojiBtn, selected && tasS.emojiBtnSel]}
                onPress={() => { onReact(message.id, emoji); onClose(); }}
                activeOpacity={0.7}
              >
                <Text style={tasS.emoji}>{emoji}</Text>
                {selected && <View style={tasS.selDot} />}
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={tasS.preview}>
          <Text style={tasS.previewSender}>
            {message.sender?.nickName ?? ""}
          </Text>
          <Text style={tasS.previewText} numberOfLines={2}>
            {message.type !== "TEXT"
              ? (
                  {
                    IMAGE: "🖼 Фото",
                    VIDEO: "🎥 Видео",
                    FILE: "📎 Файл",
                    AUDIO: "🎵 Аудио",
                  } as Record<string, string>
                )[message.type] ?? "📎"
              : message.content ?? ""}
          </Text>
        </View>
        {actions.map((a, i) => (
          <TouchableOpacity
            key={a.label}
            style={[tasS.row, i === 0 && tasS.rowFirst]}
            onPress={a.onPress}
            activeOpacity={0.7}
          >
            <View
              style={[tasS.actionIcon, { backgroundColor: a.color + "1A" }]}
            >
              <Icon name={a.icon as any} size={15} color={a.color} />
            </View>
            <Text style={[tasS.rowText, { color: a.color }]}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </Animated.View>
    </Modal>
  );
};
const tasS = StyleSheet.create({
  dimmer: {
    position: 'absolute',
    top: -100,
    left: 0,
    right: 0,
    bottom: -100,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  sheet: {
    position: "absolute",
    width: SHEET_W,
    backgroundColor: colors.background,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primary + "22",
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.38,
    shadowRadius: 26,
    elevation: 14,
  },
  emojiRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 10,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary + "12",
  },
  emojiBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.secondary + "30",
    alignItems: "center",
    justifyContent: "center",
  },
  emojiBtnSel: {
    backgroundColor: colors.accent + "35",
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  emoji: { fontSize: 18 },
  selDot: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.accent,
  },
  preview: {
    backgroundColor: colors.secondary + "20",
    borderRadius: 12,
    padding: 9,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  previewSender: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accent,
    marginBottom: 2,
  },
  previewText: { fontSize: 12, color: colors.primary, lineHeight: 17 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 2,
    borderTopWidth: 1,
    borderTopColor: colors.primary + "0D",
  },
  rowFirst: { borderTopWidth: 0 },
  actionIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { fontSize: 14, fontWeight: "600" },
});

// ─── ComposeBanner ────────────────────────────────────────────────────────────

const ComposeBanner: React.FC<{
  mode: "reply" | "edit";
  message: Message;
  onCancel: () => void;
}> = ({ mode, message, onCancel }) => (
  <View style={cbS.wrap}>
    <View style={cbS.accent} />
    <View style={cbS.content}>
      <Text style={cbS.label}>
        {mode === "reply"
          ? `↩ Ответить ${message.sender?.nickName}`
          : "✏️ Редактировать"}
      </Text>
      <Text style={cbS.text} numberOfLines={1}>
        {message.type !== "TEXT"
          ? (
              {
                IMAGE: "🖼 Фото",
                VIDEO: "🎥 Видео",
                FILE: "📎 Файл",
                AUDIO: "🎵 Аудио",
              } as Record<string, string>
            )[message.type] ?? "📎"
          : message.content ?? ""}
      </Text>
    </View>
    <TouchableOpacity
      style={cbS.close}
      onPress={onCancel}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      <Icon name="x" size={16} color={colors.primary + "80"} />
    </TouchableOpacity>
  </View>
);
const cbS = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.secondary + "20",
    borderTopWidth: 1,
    borderTopColor: colors.primary + "15",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
  },
  accent: {
    width: 3,
    height: 34,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  content: { flex: 1 },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accent,
    marginBottom: 2,
  },
  text: { fontSize: 13, color: colors.primary, lineHeight: 17 },
  close: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.secondary + "40",
    alignItems: "center",
    justifyContent: "center",
  },
});

// ─── ForwardedBubble ──────────────────────────────────────────────────────────

const ForwardedBubble: React.FC<{ message: Message; isOwn: boolean }> = ({
  message,
  isOwn,
}) => {
  const fw = message.forwardedFrom;
  if (!fw) return null;
  return (
    <View style={[fwS.wrap, isOwn && fwS.wrapOwn]}>
      <View style={fwS.accent} />
      <View style={fwS.content}>
        <Text style={fwS.sender}>{fw.sender?.nickName}</Text>
        <Text style={fwS.text} numberOfLines={2}>
          {fw.type !== "TEXT"
            ? (
                {
                  IMAGE: "🖼 Фото",
                  VIDEO: "🎥 Видео",
                  FILE: "📎 Файл",
                  AUDIO: "🎵 Аудио",
                } as Record<string, string>
              )[fw.type] ?? "📎"
            : fw.content ?? ""}
        </Text>
      </View>
    </View>
  );
};
const fwS = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    marginBottom: 6,
    overflow: "hidden",
  },
  wrapOwn: { backgroundColor: "rgba(0,0,0,0.12)" },
  accent: { width: 3, backgroundColor: colors.accent },
  content: { flex: 1, paddingHorizontal: 8, paddingVertical: 5 },
  sender: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accent,
    marginBottom: 2,
  },
  text: { fontSize: 12, color: colors.text + "CC", lineHeight: 16 },
});

// ─── MessageBubble ────────────────────────────────────────────────────────────

interface BubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  isSelected: boolean;
  isSelectMode: boolean;
  isHighlighted: boolean;
  onTap: (msg: Message, pageY: number) => void;
  onLongPress: (msg: Message) => void;
  onReact: (messageId: number, emoji: string) => void;
}

const MessageBubble: React.FC<BubbleProps> = React.memo(
  ({
    message,
    isOwn,
    showAvatar,
    isSelected,
    isSelectMode,
    isHighlighted,
    onTap,
    onLongPress,
    onReact,
  }) => {
    const initials = (message.sender?.nickName ?? "?")
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    const time = new Date(message.createdAt).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const isEdited = message.updatedAt !== message.createdAt;
    const reactions = Array.isArray(message.reactions) ? message.reactions : [];
    const grouped = reactions.reduce<Record<string, number>>((acc, r) => {
      acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
      return acc;
    }, {});

    const flashAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
      if (!isHighlighted) return;
      flashAnim.setValue(0);
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 1, duration: 180, useNativeDriver: false }),
        Animated.timing(flashAnim, { toValue: 0, duration: 180, useNativeDriver: false }),
        Animated.timing(flashAnim, { toValue: 1, duration: 180, useNativeDriver: false }),
        Animated.timing(flashAnim, { toValue: 0, duration: 180, useNativeDriver: false }),
        Animated.timing(flashAnim, { toValue: 1, duration: 180, useNativeDriver: false }),
        Animated.timing(flashAnim, { toValue: 0, duration: 700, useNativeDriver: false }),
      ]).start();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isHighlighted]);

    const rowBg = isSelected
      ? colors.accent + "22"
      : flashAnim.interpolate({
          inputRange: [0, 1],
          outputRange: ["transparent", colors.accent + "35"],
        });

    const renderContent = () => {
      const url = (message as any).mediaUrl ?? message.content;
      switch (message.type) {
        case "IMAGE":
          return (
            <TouchableOpacity onPress={() => url && Linking.openURL(url)} activeOpacity={0.9}>
              <Image source={{ uri: url ?? "" }} style={bS.mediaImg} resizeMode="cover" />
            </TouchableOpacity>
          );
        case "VIDEO":
          return (
            <TouchableOpacity style={bS.mediaRow} onPress={() => url && Linking.openURL(url)}>
              <Icon name="video" size={20} color={isOwn ? colors.text : colors.primary} />
              <Text style={[bS.mediaText, isOwn && { color: colors.text }]}>Видео</Text>
            </TouchableOpacity>
          );
        case "AUDIO":
          return (
            <TouchableOpacity style={bS.mediaRow} onPress={() => url && Linking.openURL(url)}>
              <Icon name="mic" size={20} color={isOwn ? colors.text : colors.primary} />
              <Text style={[bS.mediaText, isOwn && { color: colors.text }]}>Аудио</Text>
            </TouchableOpacity>
          );
        case "FILE":
          return (
            <TouchableOpacity style={bS.mediaRow} onPress={() => url && Linking.openURL(url)}>
              <Icon name="paperclip" size={20} color={isOwn ? colors.text : colors.primary} />
              <Text style={[bS.mediaText, isOwn && { color: colors.text }]}>
                {message.content ?? "Файл"}
              </Text>
            </TouchableOpacity>
          );
        default:
          return (
            <Text style={[bS.text, isOwn && bS.textOwn]}>{message.content ?? ""}</Text>
          );
      }
    };

    return (
      <Pressable
        onPress={(e) => onTap(message, e.nativeEvent.pageY)}
        onLongPress={() => onLongPress(message)}
        delayLongPress={250}
        unstable_pressDelay={isSelectMode ? 0 : 80}
        android_disableSound
      >
        <Animated.View
          style={[
            bS.row,
            isOwn ? bS.rowOwn : bS.rowOther,
            { backgroundColor: rowBg as any },
          ]}
        >
          {isSelectMode && (
            <View style={[bS.check, isSelected && bS.checkActive]}>
              {isSelected && <Icon name="check" size={11} color={colors.text} />}
            </View>
          )}
          {!isOwn && (
            <View style={bS.avatarCol}>
              {showAvatar ? (
                message.sender?.avatarUrl ? (
                  <Image source={{ uri: message.sender.avatarUrl }} style={bS.avatar} />
                ) : (
                  <View style={bS.avatarPh}>
                    <Text style={bS.avatarIn}>{initials}</Text>
                  </View>
                )
              ) : (
                <View style={bS.avatarSpacer} />
              )}
            </View>
          )}
          <View style={[bS.col, isOwn && bS.colOwn]}>
            <View style={[bS.bubble, isOwn ? bS.bubbleOwn : bS.bubbleOther]}>
              {message.forwardedFrom && <ForwardedBubble message={message} isOwn={isOwn} />}
              {renderContent()}
              <View style={bS.meta}>
                {isEdited && <Text style={[bS.edited, isOwn && bS.editedOwn]}>изм.</Text>}
                <Text style={[bS.time, isOwn && bS.timeOwn]}>{time}</Text>
              </View>
            </View>
            {Object.keys(grouped).length > 0 && (
              <View style={[bS.reactRow, isOwn && bS.reactRowOwn]}>
                {Object.entries(grouped).map(([emoji, count]) => (
                  <TouchableOpacity
                    key={emoji}
                    style={bS.reactChip}
                    onPress={() => onReact(message.id, emoji)}
                    activeOpacity={0.7}
                  >
                    <Text style={bS.reactEmoji}>{emoji}</Text>
                    {count > 1 && <Text style={bS.reactCount}>{count}</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </Animated.View>
      </Pressable>
    );
  }
);

const bS = StyleSheet.create({
  row: { flexDirection: "row", marginVertical: 2, paddingHorizontal: 12, alignItems: "flex-end" },
  rowOwn: { justifyContent: "flex-end" },
  rowOther: { justifyContent: "flex-start" },
  check: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.primary + "50", alignItems: "center", justifyContent: "center", marginRight: 8, marginBottom: 6 },
  checkActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  avatarCol: { width: 34, marginRight: 8, alignSelf: "flex-end", marginBottom: 4 },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  avatarPh: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.secondary + "60", alignItems: "center", justifyContent: "center" },
  avatarIn: { fontSize: 11, fontWeight: "700", color: colors.text },
  avatarSpacer: { width: 34 },
  col: { maxWidth: "75%", alignItems: "flex-start" },
  colOwn: { alignItems: "flex-end" },
  bubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginBottom: 2, overflow: "hidden" },
  bubbleOwn: { backgroundColor: colors.accent, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: colors.secondary + "35", borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.primary + "20" },
  text: { fontSize: 15, color: colors.primary, lineHeight: 21, paddingHorizontal: 2 },
  textOwn: { color: colors.text },
  meta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 4, paddingHorizontal: 2 },
  time: { fontSize: 11, color: colors.primary + "60" },
  timeOwn: { color: colors.text + "AA" },
  edited: { fontSize: 10, color: colors.primary + "50", fontStyle: "italic" },
  editedOwn: { color: colors.text + "80" },
  mediaImg: { width: 220, height: 160, borderRadius: 12, marginBottom: 4 },
  mediaRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4, paddingVertical: 4 },
  mediaText: { fontSize: 14, color: colors.primary, fontWeight: "500", flexShrink: 1 },
  reactRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  reactRowOwn: { justifyContent: "flex-end" },
  reactChip: { flexDirection: "row", alignItems: "center", backgroundColor: colors.secondary + "40", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: colors.primary + "25" },
  reactEmoji: { fontSize: 14 },
  reactCount: { fontSize: 11, color: colors.primary, marginLeft: 3, fontWeight: "600" },
});

// ─── MediaPickerSheet ─────────────────────────────────────────────────────────

type PickedFile = {
  uri: string;
  name: string;
  type: string;
  mediaType: "IMAGE" | "VIDEO" | "FILE" | "AUDIO";
};

const MediaPickerSheet: React.FC<{
  visible: boolean;
  onClose: () => void;
  onPick: (f: PickedFile) => void;
}> = ({ visible, onClose, onPick }) => {
  const go = async (action: () => Promise<void>) => { onClose(); await action(); };
  const pickImage = async () => {
    const r = await launchImageLibrary({ mediaType: "photo", quality: 1 });
    const a = r.assets?.[0];
    if (a?.uri) onPick({ uri: a.uri, name: a.fileName ?? "photo.jpg", type: a.type ?? "image/jpeg", mediaType: "IMAGE" });
  };
  const pickVideo = async () => {
    const r = await launchImageLibrary({ mediaType: "video" });
    const a = r.assets?.[0];
    if (a?.uri) onPick({ uri: a.uri, name: a.fileName ?? "video.mp4", type: a.type ?? "video/mp4", mediaType: "VIDEO" });
  };
  const pickCamera = async () => {
    const r = await launchCamera({ mediaType: "photo", quality: 1 });
    const a = r.assets?.[0];
    if (a?.uri) onPick({ uri: a.uri, name: a.fileName ?? "photo.jpg", type: a.type ?? "image/jpeg", mediaType: "IMAGE" });
  };
  const pickAudio = async () => {
    const [r] = await pick({ type: ['audio/*'], allowMultiSelection: false });
    onPick({ uri: r.uri, name: r.name ?? "audio", type: r.type ?? "audio/mpeg", mediaType: "AUDIO" });
  };

  const pickFile = async () => {
    const [r] = await pick({ type: ['*/*'], allowMultiSelection: false });
    onPick({ uri: r.uri, name: r.name ?? "file", type: r.type ?? "application/octet-stream", mediaType: "FILE" });
  };
  const opts = [
    { icon: "image",     label: "Фото",   action: () => go(pickImage),  color: "#6ecfff" },
    { icon: "camera",    label: "Камера", action: () => go(pickCamera), color: "#a0e4a0" },
    { icon: "video",     label: "Видео",  action: () => go(pickVideo),  color: "#ffb86c" },
    { icon: "mic",       label: "Аудио",  action: () => go(pickAudio),  color: colors.accent },
    { icon: "paperclip", label: "Файл",   action: () => go(pickFile),   color: "#d0aeff" },
  ];
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}><View style={mpS.backdrop} /></TouchableWithoutFeedback>
      <View style={mpS.sheet}>
        <View style={mpS.handle} />
        <Text style={mpS.title}>Прикрепить</Text>
        <View style={mpS.grid}>
          {opts.map((o) => (
            <TouchableOpacity key={o.label} style={mpS.option} onPress={o.action} activeOpacity={0.7}>
              <View style={[mpS.iconWrap, { backgroundColor: o.color + "25", borderColor: o.color + "60" }]}>
                <Icon name={o.icon as any} size={24} color={o.color} />
              </View>
              <Text style={mpS.optLabel}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ height: 24 }} />
      </View>
    </Modal>
  );
};
const mpS = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.primary + "20", paddingHorizontal: 24, paddingTop: 8 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.primary + "40", alignSelf: "center", marginBottom: 16 },
  title: { fontSize: 17, fontWeight: "700", color: colors.text, marginBottom: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  option: { alignItems: "center", gap: 8, width: 60 },
  iconWrap: { width: 60, height: 60, borderRadius: 18, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  optLabel: { fontSize: 12, fontWeight: "600", color: colors.primary, textAlign: "center" },
});

// ══════════════════════════════════════════════════════════════════════════════
// ChatScreen
// ══════════════════════════════════════════════════════════════════════════════

const ChatScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteParams>();
  const { chatId, otherUser } = route.params;

  const { data: me } = useMe();
  const { isOnline } = useUserOnlineStatus(otherUser.id);
  const { forwardToChat } = useForwardToChat();

  const {
    messages,
    markRead,
    pinnedMessages: rawPinnedMessages,
    sendMessage,
    sendMedia,
    editMessage,
    deleteMessage,
    reactToMessage,
    pinMessage,
    unpinMessage,
  } = useChatRoom(chatId);

  const pinnedMessages: PinnedMessage[] = rawPinnedMessages;
  const { typingUserIds, startTyping, stopTyping } = useTyping(chatId);

  // ── mark_read: только когда экран реально открыт ──────────────────────────
  // isFocusedRef не вызывает ре-рендер — нам он и не нужен для рендера.
  const isFocusedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      return () => {
        isFocusedRef.current = false;
      };
    }, [])
  );

  // mark_read только когда сообщения загружены И экран открыт.
  // Не вызываем при messages.length === 0 — чат ещё не загружен.
  // Не вызываем если экран не в фокусе — юзер не видит сообщения.
  const prevMsgLenRef = useRef(0);
  useEffect(() => {
    const prev = prevMsgLenRef.current;
    prevMsgLenRef.current = messages.length;
    if (!isFocusedRef.current) return;  // экран не открыт
    if (messages.length === 0) return;  // сообщений нет
    if (messages.length <= prev) return; // сообщения не добавились
    markRead();
  }, [messages, markRead]);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [inputText, setInputText] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editTarget, setEditTarget] = useState<Message | null>(null);
  const [mediaPickerVisible, setMediaPickerVisible] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [tapMessage, setTapMessage] = useState<Message | null>(null);
  const [tapY, setTapY] = useState(0);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Message | Message[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [forwardQueue, setForwardQueue] = useState<Message[]>([]);
  const [forwardPickerOpen, setForwardPickerOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [pinDialogVisible, setPinDialogVisible] = useState(false);
  const [pinTarget, setPinTarget] = useState<Message | null>(null);
  const [pinActiveIndex, setPinActiveIndex] = useState(0);

  const isSelectMode = selectedIds.size > 0;
  const listRef = useRef<FlatList>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPinActiveIndex(pinnedMessages.length > 0 ? pinnedMessages.length - 1 : 0);
  }, [pinnedMessages.length]);

  useEffect(() => {
    if (editTarget) setInputText(editTarget.content ?? "");
  }, [editTarget]);

  const reversedMessages = messages.slice().reverse();
  const pinnedMessageIds = new Set(pinnedMessages.map((p) => p.messageId));

  // ── send ──────────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    if (editTarget) {
      editMessage(editTarget.id, text);
      setEditTarget(null);
      setInputText("");
      return;
    }
    sendMessage(text, replyTo?.id);
    setInputText("");
    setReplyTo(null);
    stopTyping();
    if (typingTimer.current) clearTimeout(typingTimer.current);
  }, [inputText, editTarget, editMessage, sendMessage, replyTo, stopTyping]);

  const handleTextChange = useCallback(
    (text: string) => {
      setInputText(text);
      if (text.length > 0) {
        startTyping();
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => stopTyping(), 2_000);
      } else {
        stopTyping();
        if (typingTimer.current) clearTimeout(typingTimer.current);
      }
    },
    [startTyping, stopTyping]
  );

  const handleMediaPick = useCallback(
    async (file: PickedFile) => {
      setUploading(true);
      try {
        await sendMedia(file, file.mediaType, replyTo?.id);
        setReplyTo(null);
      } catch {
        Alert.alert("Ошибка", "Не удалось загрузить файл");
      } finally {
        setUploading(false);
      }
    },
    [sendMedia, replyTo]
  );

  // ── tap / longpress ───────────────────────────────────────────────────────
  const handleTap = useCallback(
    (msg: Message, pageY: number) => {
      if (isSelectMode) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(msg.id)) next.delete(msg.id);
          else next.add(msg.id);
          return next;
        });
      } else {
        setTapY(pageY);
        setTapMessage(msg);
      }
    },
    [isSelectMode]
  );

  const handleLongPress = useCallback(
    (msg: Message) => setSelectedIds(new Set([msg.id])),
    []
  );
  const exitSelectMode = useCallback(() => setSelectedIds(new Set()), []);

  // ── scroll to message + flash ─────────────────────────────────────────────
  const handleGoToMessage = useCallback(
    (msgId: number) => {
      const idx = reversedMessages.findIndex((m) => m.id === msgId);
      if (idx < 0) return;
      listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
      setTimeout(() => {
        setHighlightedId(msgId);
        setTimeout(() => setHighlightedId(null), 1_800);
      }, 350);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [reversedMessages]
  );

  const handlePinnedBannerPress = useCallback(() => {
    if (!pinnedMessages.length) return;
    handleGoToMessage(pinnedMessages[pinActiveIndex].messageId);
    setPinActiveIndex((prev) => (prev <= 0 ? pinnedMessages.length - 1 : prev - 1));
  }, [pinnedMessages, pinActiveIndex, handleGoToMessage]);

  // ── delete ────────────────────────────────────────────────────────────────
  const requestDelete = useCallback((target: Message | Message[]) => {
    setDeleteTarget(target);
    setDeleteVisible(true);
  }, []);
  const handleDeleteSelf = useCallback(() => {
    setDeleteVisible(false);
    if (!deleteTarget) return;
    (Array.isArray(deleteTarget) ? deleteTarget : [deleteTarget]).forEach((m) => deleteMessage(m.id, false));
    exitSelectMode();
  }, [deleteTarget, deleteMessage, exitSelectMode]);
  const handleDeleteAll = useCallback(() => {
    setDeleteVisible(false);
    if (!deleteTarget) return;
    (Array.isArray(deleteTarget) ? deleteTarget : [deleteTarget]).forEach((m) => deleteMessage(m.id, true));
    exitSelectMode();
  }, [deleteTarget, deleteMessage, exitSelectMode]);

  // ── forward ───────────────────────────────────────────────────────────────
  const handleForwardRequest = useCallback((msg: Message) => {
    setForwardQueue([msg]);
    setForwardPickerOpen(true);
  }, []);
  const handleMultiForwardRequest = useCallback(() => {
    const msgs = messages.filter((m) => selectedIds.has(m.id));
    if (!msgs.length) return;
    setForwardQueue(msgs);
    setForwardPickerOpen(true);
  }, [messages, selectedIds]);
  const handleForwardToChat = useCallback(
    (targetChatId: number) => {
      forwardQueue.forEach((m) => forwardToChat(targetChatId, m.id));
      setForwardQueue([]);
      exitSelectMode();
    },
    [forwardQueue, forwardToChat, exitSelectMode]
  );

  // ── multiselect ───────────────────────────────────────────────────────────
  const getSelected = useCallback(
    () => messages.filter((m) => selectedIds.has(m.id)),
    [messages, selectedIds]
  );
  const handleMultiCopy = useCallback(() => {
    const text = getSelected().filter((m) => m.type === "TEXT" && m.content).map((m) => m.content!).join("\n");
    if (text) Clipboard.setString(text);
    exitSelectMode();
  }, [getSelected, exitSelectMode]);
  const handleMultiDelete = useCallback(
    () => requestDelete(getSelected()),
    [getSelected, requestDelete]
  );

  // ── pin / unpin ───────────────────────────────────────────────────────────
  const handlePinRequest = useCallback((msg: Message) => {
    setPinTarget(msg);
    setPinDialogVisible(true);
  }, []);
  const handlePinSelf = useCallback(() => {
    setPinDialogVisible(false);
    if (pinTarget) pinMessage(pinTarget.id, false);
    setPinTarget(null);
  }, [pinTarget, pinMessage]);
  const handlePinAll = useCallback(() => {
    setPinDialogVisible(false);
    if (pinTarget) pinMessage(pinTarget.id, true);
    setPinTarget(null);
  }, [pinTarget, pinMessage]);
  const handleUnpinRequest = useCallback(
    (msg: Message) => unpinMessage(msg.id),
    [unpinMessage]
  );

  const handleCopy = useCallback((msg: Message) => {
    if (msg.content) Clipboard.setString(msg.content);
  }, []);
  const cancelCompose = () => {
    setReplyTo(null);
    setEditTarget(null);
    setInputText("");
  };

  const otherInitials = otherUser.nickName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const tapIsOwn = !!me && !!tapMessage && Number(tapMessage.senderId) === Number(me.id);
  const tapIsPinned = !!tapMessage && pinnedMessageIds.has(tapMessage.id);

  const handleOpenProfile = useCallback(() => {
    navigation.replace("UserProfileScreen", {
      user: {
        id: otherUser.id,
        nickName: otherUser.nickName,
        username: otherUser.username,
        avatarUrl: otherUser.avatarUrl,
      },
    });
  }, [navigation, otherUser]);

  const renderMessage = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const isOwn = Number(item.senderId) === Number(me?.id);
      const nextItem = reversedMessages[index - 1];
      const showAvatar = !isOwn && (!nextItem || nextItem.senderId !== item.senderId);
      return (
        <MessageBubble
          message={item}
          isOwn={isOwn}
          showAvatar={showAvatar}
          isSelected={selectedIds.has(item.id)}
          isSelectMode={isSelectMode}
          isHighlighted={highlightedId === item.id}
          onTap={handleTap}
          onLongPress={handleLongPress}
          onReact={reactToMessage}
        />
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me?.id, messages, reactToMessage, selectedIds, isSelectMode, handleTap, handleLongPress, highlightedId]
  );

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.headerWrap}>
        {otherUser.bannerUrl ? (
          <Image
            source={{ uri: otherUser.bannerUrl }}
            style={s.headerBanner}
            resizeMode="cover"
            blurRadius={Platform.OS === 'ios' ? 20 : 4}
          />
        ) : null}
        <View style={[s.headerOverlay, !otherUser.bannerUrl && s.headerOverlayNoBanner]} />
 
        <View style={s.header}>
          {isSelectMode ? (
            <>
              <TouchableOpacity style={s.iconBtn} onPress={exitSelectMode}>
                <Icon name="x" size={20} color={colors.text} />
              </TouchableOpacity>
              <Text style={s.selectCount}>{selectedIds.size} выбрано</Text>
              <View style={s.selectActions}>
                <TouchableOpacity style={s.iconBtn} onPress={handleMultiCopy}>
                  <Icon name="copy" size={18} color={colors.text + 'CC'} />
                </TouchableOpacity>
                <TouchableOpacity style={s.iconBtn} onPress={handleMultiForwardRequest}>
                  <Icon name="share-2" size={18} color={colors.text + 'CC'} />
                </TouchableOpacity>
                <TouchableOpacity style={s.iconBtn} onPress={handleMultiDelete}>
                  <Icon name="trash-2" size={18} color="#ff453a" />
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <TouchableOpacity style={s.iconBtn} onPress={() => navigation.goBack()}>
                <Icon name="arrow-left" size={22} color={colors.text} />
              </TouchableOpacity>
 
              <TouchableOpacity style={s.headerInfo} activeOpacity={0.75} onPress={handleOpenProfile}>
                <View style={s.avatarWrap}>
                  {otherUser.avatarUrl ? (
                    <Image source={{ uri: otherUser.avatarUrl }} style={s.headerAvatar} />
                  ) : (
                    <View style={s.headerAvatarPh}>
                      <Text style={s.headerAvatarIn}>{otherInitials}</Text>
                    </View>
                  )}
                  {isOnline && <View style={s.onlineDot} />}
                </View>
                <View style={s.headerTextCol}>
                  <Text style={s.headerName} numberOfLines={1}>{otherUser.nickName}</Text>
                  <Text style={[s.headerStatus, isOnline && s.headerStatusOnline]}>
                    {isOnline ? 'онлайн' : `@${otherUser.username}`}
                  </Text>
                </View>
              </TouchableOpacity>
 
              <TouchableOpacity style={s.iconBtn} onPress={() => setSearchVisible((v) => !v)}>
                <Icon name={searchVisible ? 'x' : 'search'} size={19} color={colors.text + 'CC'} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {searchVisible && !isSelectMode && (
        <SearchBar chatId={chatId} onClose={() => setSearchVisible(false)} onGoTo={handleGoToMessage} />
      )}

      {pinnedMessages.length > 0 && !searchVisible && !isSelectMode && (
        <PinnedBanner
          pinnedMessages={pinnedMessages}
          activeIndex={pinActiveIndex}
          onPress={handlePinnedBannerPress}
        />
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          ref={listRef}
          data={reversedMessages}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMessage}
          inverted
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.msgList}
          onScrollToIndexFailed={(info) => {
            setTimeout(
              () => listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 }),
              100
            );
          }}
          ListHeaderComponent={
            typingUserIds.length > 0 ? (
              <View style={{ paddingBottom: 4 }}><TypingIndicator /></View>
            ) : null
          }
        />

        {(replyTo || editTarget) && !isSelectMode && (
          <ComposeBanner
            mode={editTarget ? "edit" : "reply"}
            message={(editTarget ?? replyTo)!}
            onCancel={cancelCompose}
          />
        )}

        {!isSelectMode && (
          <View style={s.inputBar}>
            <TouchableOpacity
              style={s.attachBtn}
              onPress={() => setMediaPickerVisible(true)}
              disabled={uploading}
              activeOpacity={0.8}
            >
              {uploading ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Icon name="paperclip" size={20} color={colors.primary + "90"} />
              )}
            </TouchableOpacity>
            <View style={s.inputWrap}>
              <TextInput
                value={inputText}
                onChangeText={handleTextChange}
                style={s.input}
                placeholder={editTarget ? "Редактировать..." : "Сообщение..."}
                placeholderTextColor={colors.primary + "50"}
                multiline
                maxLength={2_000}
              />
            </View>
            <TouchableOpacity
              style={[s.sendBtn, !inputText.trim() && s.sendBtnOff]}
              onPress={handleSend}
              disabled={!inputText.trim() || uploading}
              activeOpacity={0.85}
            >
              <Icon
                name={editTarget ? "check" : "send"}
                size={18}
                color={inputText.trim() ? colors.text : colors.primary + "40"}
              />
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      <TapActionSheet
        message={tapMessage}
        tapY={tapY}
        isOwn={tapIsOwn}
        isPinned={tapIsPinned}
        onClose={() => setTapMessage(null)}
        onReact={reactToMessage}
        onReply={(msg) => { setReplyTo(msg); setEditTarget(null); }}
        onEdit={(msg) => { setEditTarget(msg); setReplyTo(null); }}
        onDeleteRequest={requestDelete}
        onForwardRequest={handleForwardRequest}
        onPinRequest={handlePinRequest}
        onUnpinRequest={handleUnpinRequest}
        onCopy={handleCopy}
      />

      <PinDialog
        visible={pinDialogVisible}
        onClose={() => { setPinDialogVisible(false); setPinTarget(null); }}
        onPinSelf={handlePinSelf}
        onPinAll={handlePinAll}
      />

      <DeleteDialog
        visible={deleteVisible}
        multiCount={Array.isArray(deleteTarget) ? deleteTarget.length : undefined}
        onClose={() => setDeleteVisible(false)}
        onDeleteSelf={handleDeleteSelf}
        onDeleteAll={handleDeleteAll}
      />

      <ForwardPicker
        visible={forwardPickerOpen}
        myId={me?.id ?? 0}
        onClose={() => { setForwardPickerOpen(false); setForwardQueue([]); }}
        onSelect={handleForwardToChat}
      />

      <MediaPickerSheet
        visible={mediaPickerVisible}
        onClose={() => setMediaPickerVisible(false)}
        onPick={handleMediaPick}
      />
    </View>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 56 : 36,
    paddingBottom: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.secondary + "40", alignItems: "center", justifyContent: "center" },
  headerInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  avatarWrap: { position: "relative" },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: colors.accent + "50" },
  headerAvatarPh: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.secondary + "60", borderWidth: 2, borderColor: colors.accent + "40", alignItems: "center", justifyContent: "center" },
  headerAvatarIn: { fontSize: 13, fontWeight: "700", color: colors.text },
  onlineDot: { position: "absolute", bottom: 0, right: 0, width: 11, height: 11, borderRadius: 5.5, backgroundColor: colors.onlineColor, borderWidth: 2, borderColor: colors.background },
  headerTextCol: { flex: 1 },
  headerName: { fontSize: 16, fontWeight: "700", color: colors.text, letterSpacing: -0.2 },
  headerStatus: { fontSize: 12, color: colors.primary + "60", marginTop: 1 },
  headerStatusOnline: { color: colors.onlineColor, fontWeight: "600" },
  selectCount: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.text, marginLeft: 4 },
  selectActions: { flexDirection: "row", gap: 4 },
  msgList: { paddingVertical: 12, paddingBottom: 6 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 10, paddingVertical: 10, paddingBottom: Platform.OS === "ios" ? 28 : 10, borderTopWidth: 1, borderTopColor: colors.primary + "12", backgroundColor: colors.background, gap: 8 },
  attachBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  inputWrap: { flex: 1, backgroundColor: colors.secondary + "30", borderRadius: 22, borderWidth: 1.5, borderColor: colors.primary + "25", paddingHorizontal: 16, paddingVertical: Platform.OS === "ios" ? 10 : 6, maxHeight: 120 },
  input: { color: colors.text, fontSize: 15, lineHeight: 20 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  sendBtnOff: { backgroundColor: colors.secondary + "40", shadowOpacity: 0, elevation: 0 },
    headerWrap: {
    position: "relative",
    overflow: "hidden",
    borderBottomWidth: 1,
    borderBottomColor: colors.primary + "15",
  },
  headerBanner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  headerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(17, 13, 22, 0.78)",
  },
  headerOverlayNoBanner: {
    backgroundColor: colors.background,
  }
});

export default ChatScreen;