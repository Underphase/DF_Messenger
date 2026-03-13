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
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { pick } from "@react-native-documents/picker";
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
import { SafeAreaView } from 'react-native-safe-area-context'

let AudioRecord: any = null;
try {
  AudioRecord = require("react-native-audio-record").default;
} catch (_) {}

async function requestMicPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    const { PermissionsAndroid } = require("react-native");
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      { title: "Микрофон", message: "Разрешите доступ к микрофону для записи голосовых сообщений", buttonPositive: "OK" }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

type RouteParams = RouteProp<AppStackParamList, "ChatScreen">;

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "😡"];
const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get("window");
const SHEET_W = 264;
const MAX_FILE_SIZE = 100 * 1024 * 1024;

type InputMode = "mic" | "send" | "recording" | "circle";

function getOtherParticipant(chat: Chat, myId: number) {
  return (
    chat.participants?.find((p) => p.user.id !== myId)?.user ??
    chat.participants?.[0]?.user
  );
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
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
          Animated.timing(dot, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 350, useNativeDriver: true }),
          Animated.delay((2 - i) * 160),
        ])
      )
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, []);

  return (
    <View style={tyS.wrap}>
      <View style={tyS.bubble}>
        {dots.map((dot, i) => (
          <Animated.View
            key={i}
            style={[tyS.dot, { transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }] }]}
          />
        ))}
      </View>
    </View>
  );
};
const tyS = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingVertical: 4, alignSelf: "flex-start" },
  bubble: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.secondary + "35", borderRadius: 18, borderBottomLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.primary + "20" },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.primary + "80" },
});

// ─── PinnedBanner ─────────────────────────────────────────────────────────────

const PinnedBanner: React.FC<{ pinnedMessages: PinnedMessage[]; activeIndex: number; onPress: () => void }> = ({ pinnedMessages, activeIndex, onPress }) => {
  const pinned = pinnedMessages[activeIndex];
  if (!pinned) return null;
  const msg = pinned.message;
  const total = pinnedMessages.length;
  const label = msg.type === "TEXT" ? msg.content ?? "" : ({ IMAGE: "🖼 Фото", VIDEO: "🎥 Видео", FILE: "📎 Файл", AUDIO: "🎵 Аудио" } as Record<MessageType, string>)[msg.type] ?? "📎";
  return (
    <TouchableOpacity style={pbS.wrap} onPress={onPress} activeOpacity={0.8}>
      <View style={pbS.bars}>{pinnedMessages.map((_, i) => <View key={i} style={[pbS.bar, i === activeIndex && pbS.barActive]} />)}</View>
      <View style={pbS.content}>
        <Text style={pbS.label}>📌 {total > 1 ? `Закреп ${activeIndex + 1}/${total}` : "Закреплённое"}</Text>
        <Text style={pbS.text} numberOfLines={1}>{label}</Text>
      </View>
      <Icon name="chevron-right" size={16} color={colors.accent + "80"} />
    </TouchableOpacity>
  );
};
const pbS = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", backgroundColor: colors.secondary + "25", borderBottomWidth: 1, borderBottomColor: colors.primary + "15", paddingVertical: 9, paddingHorizontal: 16, gap: 10 },
  bars: { flexDirection: "column", gap: 3 },
  bar: { width: 3, height: 8, borderRadius: 2, backgroundColor: colors.primary + "30" },
  barActive: { backgroundColor: colors.accent },
  content: { flex: 1 },
  label: { fontSize: 11, fontWeight: "700", color: colors.accent, marginBottom: 2 },
  text: { fontSize: 13, color: colors.text, lineHeight: 17 },
});

// ─── SearchBar ────────────────────────────────────────────────────────────────

const SearchBar: React.FC<{ chatId: number; onClose: () => void; onGoTo: (msgId: number) => void }> = ({ chatId, onClose, onGoTo }) => {
  const [q, setQ] = useState("");
  const { data: results, isFetching } = useSearchMessages(chatId, q);
  return (
    <View style={sbS.container}>
      <View style={sbS.row}>
        <Icon name="search" size={16} color={colors.primary + "70"} />
        <TextInput style={sbS.input} placeholder="Поиск в чате..." placeholderTextColor={colors.primary + "50"} value={q} onChangeText={setQ} autoFocus />
        {isFetching && <ActivityIndicator size="small" color={colors.accent} />}
        <TouchableOpacity onPress={onClose}><Icon name="x" size={18} color={colors.primary + "80"} /></TouchableOpacity>
      </View>
      {results && results.length > 0 && (
        <FlatList data={results} keyExtractor={(item) => String(item.id)} style={sbS.list} keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity style={sbS.result} onPress={() => { onGoTo(item.id); onClose(); }}>
              <Text style={sbS.sender}>{item.sender?.nickName}</Text>
              <Text style={sbS.text} numberOfLines={1}>{item.content ?? "📎 Медиа"}</Text>
            </TouchableOpacity>
          )}
        />
      )}
      {results?.length === 0 && q.trim().length > 1 && !isFetching && <Text style={sbS.empty}>Ничего не найдено</Text>}
    </View>
  );
};
const sbS = StyleSheet.create({
  container: { backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.primary + "15" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  input: { flex: 1, fontSize: 15, color: colors.text },
  list: { maxHeight: 220, borderTopWidth: 1, borderTopColor: colors.primary + "10" },
  result: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.primary + "08" },
  sender: { fontSize: 11, fontWeight: "700", color: colors.accent, marginBottom: 2 },
  text: { fontSize: 13, color: colors.primary },
  empty: { paddingHorizontal: 16, paddingVertical: 12, fontSize: 13, color: colors.primary + "60" },
});

// ─── DeleteDialog ─────────────────────────────────────────────────────────────

const DeleteDialog: React.FC<{ visible: boolean; multiCount?: number; onClose: () => void; onDeleteSelf: () => void; onDeleteAll: () => void }> = ({ visible, multiCount, onClose, onDeleteSelf, onDeleteAll }) => {
  const scaleAnim = useRef(new Animated.Value(0.88)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) { Animated.parallel([Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 90, friction: 10 }), Animated.timing(fadeAnim, { toValue: 1, duration: 160, useNativeDriver: true })]).start(); }
    else { scaleAnim.setValue(0.88); fadeAnim.setValue(0); }
  }, [visible]);
  if (!visible) return null;
  const label = multiCount && multiCount > 1 ? `${multiCount} сообщ.` : "сообщение";
  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[dlgS.backdrop, { opacity: fadeAnim }]}>
          <TouchableWithoutFeedback>
            <Animated.View style={[dlgS.card, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
              <View style={[dlgS.iconWrap, { backgroundColor: "rgba(255,69,58,0.12)" }]}><Icon name="trash-2" size={30} color="#ff453a" /></View>
              <Text style={dlgS.title}>Удалить {label}?</Text>
              <TouchableOpacity style={[dlgS.rowPrimary, { backgroundColor: "rgba(255,69,58,0.1)", borderColor: "rgba(255,69,58,0.28)" }]} onPress={onDeleteAll} activeOpacity={0.82}>
                <View style={[dlgS.rowIcon, { backgroundColor: "#ff453a" }]}><Icon name="users" size={16} color="#fff" /></View>
                <View style={dlgS.rowText}><Text style={[dlgS.rowTitle, { color: "#ff453a" }]}>Удалить у всех</Text><Text style={dlgS.rowSub}>Пропадёт у обоих участников</Text></View>
                <Icon name="chevron-right" size={16} color="#ff453a" style={{ opacity: 0.7 }} />
              </TouchableOpacity>
              <TouchableOpacity style={[dlgS.rowPrimary, { backgroundColor: colors.secondary + "28", borderColor: colors.primary + "12" }]} onPress={onDeleteSelf} activeOpacity={0.82}>
                <View style={[dlgS.rowIcon, { backgroundColor: colors.secondary + "90" }]}><Icon name="user" size={16} color={colors.primary} /></View>
                <View style={dlgS.rowText}><Text style={[dlgS.rowTitle, { color: colors.text }]}>Удалить у себя</Text><Text style={dlgS.rowSub}>Только вы не увидите</Text></View>
                <Icon name="chevron-right" size={16} color={colors.primary} style={{ opacity: 0.4 }} />
              </TouchableOpacity>
              <TouchableOpacity style={dlgS.cancel} onPress={onClose} activeOpacity={0.8}><Text style={dlgS.cancelText}>Отмена</Text></TouchableOpacity>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

// ─── PinDialog ────────────────────────────────────────────────────────────────

const PinDialog: React.FC<{ visible: boolean; onClose: () => void; onPinSelf: () => void; onPinAll: () => void }> = ({ visible, onClose, onPinSelf, onPinAll }) => {
  const scaleAnim = useRef(new Animated.Value(0.88)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) { Animated.parallel([Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 90, friction: 10 }), Animated.timing(fadeAnim, { toValue: 1, duration: 160, useNativeDriver: true })]).start(); }
    else { scaleAnim.setValue(0.88); fadeAnim.setValue(0); }
  }, [visible]);
  if (!visible) return null;
  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[dlgS.backdrop, { opacity: fadeAnim }]}>
          <TouchableWithoutFeedback>
            <Animated.View style={[dlgS.card, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
              <View style={[dlgS.iconWrap, { backgroundColor: colors.accent + "20" }]}><Icon name="bookmark" size={30} color={colors.accent} /></View>
              <Text style={dlgS.title}>Закрепить сообщение?</Text>
              <TouchableOpacity style={[dlgS.rowPrimary, { backgroundColor: colors.accent + "15", borderColor: colors.accent + "40" }]} onPress={onPinAll} activeOpacity={0.82}>
                <View style={[dlgS.rowIcon, { backgroundColor: colors.accent }]}><Icon name="users" size={16} color="#fff" /></View>
                <View style={dlgS.rowText}><Text style={[dlgS.rowTitle, { color: colors.accent }]}>Закрепить у всех</Text><Text style={dlgS.rowSub}>Увидят оба участника</Text></View>
                <Icon name="chevron-right" size={16} color={colors.accent} style={{ opacity: 0.7 }} />
              </TouchableOpacity>
              <TouchableOpacity style={[dlgS.rowPrimary, { backgroundColor: colors.secondary + "28", borderColor: colors.primary + "12" }]} onPress={onPinSelf} activeOpacity={0.82}>
                <View style={[dlgS.rowIcon, { backgroundColor: colors.secondary + "90" }]}><Icon name="user" size={16} color={colors.primary} /></View>
                <View style={dlgS.rowText}><Text style={[dlgS.rowTitle, { color: colors.text }]}>Закрепить у себя</Text><Text style={dlgS.rowSub}>Только вы увидите закреп</Text></View>
                <Icon name="chevron-right" size={16} color={colors.primary} style={{ opacity: 0.4 }} />
              </TouchableOpacity>
              <TouchableOpacity style={dlgS.cancel} onPress={onClose} activeOpacity={0.8}><Text style={dlgS.cancelText}>Отмена</Text></TouchableOpacity>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const dlgS = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center", alignItems: "center", paddingHorizontal: 26 },
  card: { backgroundColor: colors.background, borderRadius: 26, borderWidth: 1, borderColor: colors.primary + "1A", padding: 20, width: "100%", maxWidth: 340, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.4, shadowRadius: 28, elevation: 16 },
  iconWrap: { width: 68, height: 68, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  title: { fontSize: 17, fontWeight: "700", color: colors.text, marginBottom: 20, textAlign: "center" },
  rowPrimary: { flexDirection: "row", alignItems: "center", gap: 12, width: "100%", paddingVertical: 14, paddingHorizontal: 14, borderRadius: 16, marginBottom: 10, borderWidth: 1 },
  rowIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: "700" },
  rowSub: { fontSize: 11, color: colors.primary + "65", marginTop: 2 },
  cancel: { width: "100%", paddingVertical: 13, alignItems: "center", borderRadius: 14, backgroundColor: colors.secondary + "22", borderWidth: 1, borderColor: colors.primary + "0E" },
  cancelText: { fontSize: 14, fontWeight: "600", color: colors.primary + "A0" },
});

// ─── ForwardPicker ────────────────────────────────────────────────────────────

const ForwardPicker: React.FC<{ visible: boolean; myId: number; onClose: () => void; onSelect: (chatId: number) => void }> = ({ visible, myId, onClose, onSelect }) => {
  const { data: chats, isLoading } = useChats();
  const slideY = useRef(new Animated.Value(400)).current;
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) { Animated.parallel([Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 75, friction: 12 }), Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true })]).start(); }
    else { Animated.parallel([Animated.timing(slideY, { toValue: 400, duration: 220, useNativeDriver: true }), Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true })]).start(); }
  }, [visible]);
  if (!visible) return null;
  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}><Animated.View style={[fpS.backdrop, { opacity: fade }]} /></TouchableWithoutFeedback>
      <Animated.View style={[fpS.sheet, { transform: [{ translateY: slideY }] }]}>
        <View style={fpS.handle} />
        <View style={fpS.header}>
          <Text style={fpS.title}>Переслать в чат</Text>
          <TouchableOpacity style={fpS.closeBtn} onPress={onClose}><Icon name="x" size={18} color={colors.text} /></TouchableOpacity>
        </View>
        {isLoading ? <View style={fpS.center}><ActivityIndicator color={colors.accent} size="large" /></View>
          : !chats?.length ? <View style={fpS.center}><Text style={fpS.emptyText}>Нет доступных чатов</Text></View>
          : <FlatList data={chats} keyExtractor={(item) => String(item.id)} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: Platform.OS === "ios" ? 36 : 16 }}
              renderItem={({ item }) => {
                const other = getOtherParticipant(item, myId);
                if (!other) return null;
                const initials = other.nickName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
                const preview = item.messages?.[0];
                return (
                  <TouchableOpacity style={fpS.row} onPress={() => { onSelect(item.id); onClose(); }} activeOpacity={0.72}>
                    {other.avatarUrl ? <Image source={{ uri: other.avatarUrl }} style={fpS.avatar} /> : <View style={fpS.avatarPh}><Text style={fpS.avatarIn}>{initials}</Text></View>}
                    <View style={fpS.info}>
                      <Text style={fpS.name} numberOfLines={1}>{other.nickName}</Text>
                      {preview && <Text style={fpS.preview} numberOfLines={1}>{preview.content ?? "📎 Медиа"}</Text>}
                    </View>
                    <View style={fpS.sendBtn}><Icon name="send" size={15} color="#fff" /></View>
                  </TouchableOpacity>
                );
              }}
            />
        }
      </Animated.View>
    </Modal>
  );
};
const fpS = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.primary + "1E", maxHeight: "72%" },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.primary + "40", alignSelf: "center", marginTop: 10 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  title: { fontSize: 18, fontWeight: "700", color: colors.text },
  closeBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.secondary + "40", alignItems: "center", justifyContent: "center" },
  center: { paddingVertical: 48, alignItems: "center" },
  emptyText: { fontSize: 14, color: colors.primary + "60" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.primary + "0C" },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: colors.accent + "50" },
  avatarPh: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.secondary + "60", borderWidth: 2, borderColor: colors.accent + "30", alignItems: "center", justifyContent: "center" },
  avatarIn: { fontSize: 16, fontWeight: "700", color: colors.text },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: "700", color: colors.text },
  preview: { fontSize: 12, color: colors.primary + "60", marginTop: 2 },
  sendBtn: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
});

// ─── TapActionSheet ───────────────────────────────────────────────────────────

interface TapSheetProps {
  message: Message | null; tapY: number; isOwn: boolean; isPinned: boolean;
  onClose: () => void; onReact: (messageId: number, emoji: string) => void;
  onReply: (msg: Message) => void; onEdit: (msg: Message) => void;
  onDeleteRequest: (msg: Message) => void; onForwardRequest: (msg: Message) => void;
  onPinRequest: (msg: Message) => void; onUnpinRequest: (msg: Message) => void; onCopy: (msg: Message) => void;
}

const TapActionSheet: React.FC<TapSheetProps> = ({ message, tapY, isOwn, isPinned, onClose, onReact, onReply, onEdit, onDeleteRequest, onForwardRequest, onPinRequest, onUnpinRequest, onCopy }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.86)).current;
  const isVisible = !!message;
  useEffect(() => {
    if (isVisible) { Animated.parallel([Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 90, friction: 9 }), Animated.timing(fadeAnim, { toValue: 1, duration: 130, useNativeDriver: true })]).start(); }
    else { Animated.parallel([Animated.timing(fadeAnim, { toValue: 0, duration: 110, useNativeDriver: true }), Animated.timing(scaleAnim, { toValue: 0.86, duration: 110, useNativeDriver: true })]).start(); }
  }, [isVisible]);
  if (!message) return null;
  const existing = Array.isArray(message.reactions) ? message.reactions : [];
  const actions = [
    { icon: "corner-up-left", label: "Ответить", color: colors.primary, onPress: () => { onReply(message); onClose(); } },
    { icon: "share-2", label: "Переслать", color: colors.primary, onPress: () => { onForwardRequest(message); onClose(); } },
    ...(message.type === "TEXT" ? [{ icon: "copy", label: "Копировать", color: colors.primary, onPress: () => { onCopy(message); onClose(); } }] : []),
    isPinned ? { icon: "bookmark", label: "Открепить", color: "#ffb86c", onPress: () => { onUnpinRequest(message); onClose(); } } : { icon: "bookmark", label: "Закрепить", color: colors.accent, onPress: () => { onPinRequest(message); onClose(); } },
    ...(isOwn && message.type === "TEXT" ? [{ icon: "edit-2", label: "Изменить", color: "#6ecfff", onPress: () => { onEdit(message); onClose(); } }] : []),
    { icon: "trash-2", label: "Удалить", color: "#ff6b6b", onPress: () => { onDeleteRequest(message); onClose(); } },
  ];
  const EMOJI_H = 58, PREVIEW_H = 68, ACTION_H = 44, PAD_V = 20;
  const estimatedH = EMOJI_H + PREVIEW_H + actions.length * ACTION_H + PAD_V;
  const MARGIN = 14, TOP_SAFE = Platform.OS === "ios" ? 60 : 40, BOT_SAFE = Platform.OS === "ios" ? 44 : 16;
  const bottomThreshold = SCREEN_H * 0.6;
  let top = tapY > bottomThreshold ? tapY - estimatedH - 16 : tapY - estimatedH / 2;
  top = Math.max(TOP_SAFE + MARGIN, top);
  top = Math.min(SCREEN_H - estimatedH - BOT_SAFE - MARGIN, top);
  return (
    <Modal transparent animationType="none" visible={isVisible} onRequestClose={onClose} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}><Animated.View style={[tasS.dimmer, { opacity: fadeAnim }]} /></TouchableWithoutFeedback>
      <Animated.View style={[tasS.sheet, isOwn ? { right: MARGIN } : { left: MARGIN }, { top, opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]} pointerEvents="box-none">
        <View style={tasS.emojiRow}>
          {QUICK_REACTIONS.map((emoji) => {
            const selected = existing.some((r) => r.emoji === emoji);
            return <TouchableOpacity key={emoji} style={[tasS.emojiBtn, selected && tasS.emojiBtnSel]} onPress={() => { onReact(message.id, emoji); onClose(); }} activeOpacity={0.7}><Text style={tasS.emoji}>{emoji}</Text>{selected && <View style={tasS.selDot} />}</TouchableOpacity>;
          })}
        </View>
        <View style={tasS.preview}>
          <Text style={tasS.previewSender}>{message.sender?.nickName ?? ""}</Text>
          <Text style={tasS.previewText} numberOfLines={2}>{message.type !== "TEXT" ? ({ IMAGE: "🖼 Фото", VIDEO: "🎥 Видео", FILE: "📎 Файл", AUDIO: "🎵 Аудио" } as Record<string, string>)[message.type] ?? "📎" : message.content ?? ""}</Text>
        </View>
        {actions.map((a, i) => (
          <TouchableOpacity key={a.label} style={[tasS.row, i === 0 && tasS.rowFirst]} onPress={a.onPress} activeOpacity={0.7}>
            <View style={[tasS.actionIcon, { backgroundColor: a.color + "1A" }]}><Icon name={a.icon as any} size={15} color={a.color} /></View>
            <Text style={[tasS.rowText, { color: a.color }]}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </Animated.View>
    </Modal>
  );
};
const tasS = StyleSheet.create({
  dimmer: { position: "absolute", top: -100, left: 0, right: 0, bottom: -100, backgroundColor: "rgba(0,0,0,0.72)" },
  sheet: { position: "absolute", width: SHEET_W, backgroundColor: colors.background, borderRadius: 20, borderWidth: 1, borderColor: colors.primary + "22", paddingVertical: 10, paddingHorizontal: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.38, shadowRadius: 26, elevation: 14 },
  emojiRow: { flexDirection: "row", justifyContent: "space-between", paddingBottom: 10, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.primary + "12" },
  emojiBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.secondary + "30", alignItems: "center", justifyContent: "center" },
  emojiBtnSel: { backgroundColor: colors.accent + "35", borderWidth: 1.5, borderColor: colors.accent },
  emoji: { fontSize: 18 },
  selDot: { position: "absolute", bottom: 2, right: 2, width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.accent },
  preview: { backgroundColor: colors.secondary + "20", borderRadius: 12, padding: 9, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: colors.accent },
  previewSender: { fontSize: 11, fontWeight: "700", color: colors.accent, marginBottom: 2 },
  previewText: { fontSize: 12, color: colors.primary, lineHeight: 17 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, paddingHorizontal: 2, borderTopWidth: 1, borderTopColor: colors.primary + "0D" },
  rowFirst: { borderTopWidth: 0 },
  actionIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  rowText: { fontSize: 14, fontWeight: "600" },
});

// ─── ComposeBanner ────────────────────────────────────────────────────────────

const ComposeBanner: React.FC<{ mode: "reply" | "edit"; message: Message; onCancel: () => void }> = ({ mode, message, onCancel }) => (
  <View style={cbS.wrap}>
    <View style={cbS.accent} />
    <View style={cbS.content}>
      <Text style={cbS.label}>{mode === "reply" ? `↩ Ответить ${message.sender?.nickName}` : "✏️ Редактировать"}</Text>
      <Text style={cbS.text} numberOfLines={1}>{message.type !== "TEXT" ? ({ IMAGE: "🖼 Фото", VIDEO: "🎥 Видео", FILE: "📎 Файл", AUDIO: "🎵 Аудио" } as Record<string, string>)[message.type] ?? "📎" : message.content ?? ""}</Text>
    </View>
    <TouchableOpacity style={cbS.close} onPress={onCancel} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}><Icon name="x" size={16} color={colors.primary + "80"} /></TouchableOpacity>
  </View>
);
const cbS = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", backgroundColor: colors.secondary + "20", borderTopWidth: 1, borderTopColor: colors.primary + "15", paddingHorizontal: 16, paddingVertical: 8, gap: 10 },
  accent: { width: 3, height: 34, borderRadius: 2, backgroundColor: colors.accent },
  content: { flex: 1 },
  label: { fontSize: 11, fontWeight: "700", color: colors.accent, marginBottom: 2 },
  text: { fontSize: 13, color: colors.primary, lineHeight: 17 },
  close: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.secondary + "40", alignItems: "center", justifyContent: "center" },
});

// ─── ForwardedBubble ──────────────────────────────────────────────────────────

const ForwardedBubble: React.FC<{ message: Message; isOwn: boolean }> = ({ message, isOwn }) => {
  const fw = message.forwardedFrom;
  if (!fw) return null;
  return (
    <View style={[fwS.wrap, isOwn && fwS.wrapOwn]}>
      <View style={fwS.accent} />
      <View style={fwS.content}>
        <Text style={fwS.sender}>{fw.sender?.nickName}</Text>
        <Text style={fwS.text} numberOfLines={2}>{fw.type !== "TEXT" ? ({ IMAGE: "🖼 Фото", VIDEO: "🎥 Видео", FILE: "📎 Файл", AUDIO: "🎵 Аудио" } as Record<string, string>)[fw.type] ?? "📎" : fw.content ?? ""}</Text>
      </View>
    </View>
  );
};
const fwS = StyleSheet.create({
  wrap: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 10, marginBottom: 6, overflow: "hidden" },
  wrapOwn: { backgroundColor: "rgba(0,0,0,0.12)" },
  accent: { width: 3, backgroundColor: colors.accent },
  content: { flex: 1, paddingHorizontal: 8, paddingVertical: 5 },
  sender: { fontSize: 11, fontWeight: "700", color: colors.accent, marginBottom: 2 },
  text: { fontSize: 12, color: colors.text + "CC", lineHeight: 16 },
});

// ─── MessageBubble ────────────────────────────────────────────────────────────

interface BubbleProps {
  message: Message; isOwn: boolean; showAvatar: boolean; isSelected: boolean;
  isSelectMode: boolean; isHighlighted: boolean;
  onTap: (msg: Message, pageY: number) => void;
  onLongPress: (msg: Message) => void;
  onReact: (messageId: number, emoji: string) => void;
}

const MessageBubble: React.FC<BubbleProps> = React.memo(({ message, isOwn, showAvatar, isSelected, isSelectMode, isHighlighted, onTap, onLongPress, onReact }) => {
  const initials = (message.sender?.nickName ?? "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const time = new Date(message.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const isEdited = message.updatedAt !== message.createdAt;
  const reactions = Array.isArray(message.reactions) ? message.reactions : [];
  const grouped = reactions.reduce<Record<string, number>>((acc, r) => { acc[r.emoji] = (acc[r.emoji] ?? 0) + 1; return acc; }, {});
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
  }, [isHighlighted]);
  const rowBg = isSelected ? colors.accent + "22" : flashAnim.interpolate({ inputRange: [0, 1], outputRange: ["transparent", colors.accent + "35"] });
  const renderContent = () => {
    const url = (message as any).mediaUrl ?? message.content;
    switch (message.type) {
      case "IMAGE": return <TouchableOpacity onPress={() => url && Linking.openURL(url)} activeOpacity={0.9}><Image source={{ uri: url ?? "" }} style={bS.mediaImg} resizeMode="cover" /></TouchableOpacity>;
      case "VIDEO": return <TouchableOpacity style={bS.mediaRow} onPress={() => url && Linking.openURL(url)}><Icon name="video" size={20} color={isOwn ? colors.text : colors.primary} /><Text style={[bS.mediaText, isOwn && { color: colors.text }]}>Видео</Text></TouchableOpacity>;
      case "AUDIO": return <TouchableOpacity style={bS.mediaRow} onPress={() => url && Linking.openURL(url)}><Icon name="mic" size={20} color={isOwn ? colors.text : colors.primary} /><Text style={[bS.mediaText, isOwn && { color: colors.text }]}>Аудио</Text></TouchableOpacity>;
      case "FILE": return <TouchableOpacity style={bS.mediaRow} onPress={() => url && Linking.openURL(url)}><Icon name="paperclip" size={20} color={isOwn ? colors.text : colors.primary} /><Text style={[bS.mediaText, isOwn && { color: colors.text }]}>{message.content ?? "Файл"}</Text></TouchableOpacity>;
      default: return <Text style={[bS.text, isOwn && bS.textOwn]}>{message.content ?? ""}</Text>;
    }
  };
  return (
    <Pressable onPress={(e) => onTap(message, e.nativeEvent.pageY)} onLongPress={() => onLongPress(message)} delayLongPress={250} unstable_pressDelay={isSelectMode ? 0 : 80} android_disableSound>
      <Animated.View style={[bS.row, isOwn ? bS.rowOwn : bS.rowOther, { backgroundColor: rowBg as any }]}>
        {isSelectMode && <View style={[bS.check, isSelected && bS.checkActive]}>{isSelected && <Icon name="check" size={11} color={colors.text} />}</View>}
        {!isOwn && (
          <View style={bS.avatarCol}>
            {showAvatar ? (message.sender?.avatarUrl ? <Image source={{ uri: message.sender.avatarUrl }} style={bS.avatar} /> : <View style={bS.avatarPh}><Text style={bS.avatarIn}>{initials}</Text></View>) : <View style={bS.avatarSpacer} />}
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
                <TouchableOpacity key={emoji} style={bS.reactChip} onPress={() => onReact(message.id, emoji)} activeOpacity={0.7}>
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
});

const bS = StyleSheet.create({
  row: { flexDirection: "row", marginVertical: 2, paddingHorizontal: 12, alignItems: "flex-end" },
  rowOwn: { justifyContent: "flex-end" }, rowOther: { justifyContent: "flex-start" },
  check: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.primary + "50", alignItems: "center", justifyContent: "center", marginRight: 8, marginBottom: 6 },
  checkActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  avatarCol: { width: 34, marginRight: 8, alignSelf: "flex-end", marginBottom: 4 },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  avatarPh: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.secondary + "60", alignItems: "center", justifyContent: "center" },
  avatarIn: { fontSize: 11, fontWeight: "700", color: colors.text },
  avatarSpacer: { width: 34 },
  col: { maxWidth: "75%", alignItems: "flex-start" }, colOwn: { alignItems: "flex-end" },
  bubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginBottom: 2, overflow: "hidden" },
  bubbleOwn: { backgroundColor: colors.accent, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: colors.secondary + "35", borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.primary + "20" },
  text: { fontSize: 15, color: colors.primary, lineHeight: 21, paddingHorizontal: 2 }, textOwn: { color: colors.text },
  meta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 4, paddingHorizontal: 2 },
  time: { fontSize: 11, color: colors.primary + "60" }, timeOwn: { color: colors.text + "AA" },
  edited: { fontSize: 10, color: colors.primary + "50", fontStyle: "italic" }, editedOwn: { color: colors.text + "80" },
  mediaImg: { width: 220, height: 160, borderRadius: 12, marginBottom: 4 },
  mediaRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4, paddingVertical: 4 },
  mediaText: { fontSize: 14, color: colors.primary, fontWeight: "500", flexShrink: 1 },
  reactRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 }, reactRowOwn: { justifyContent: "flex-end" },
  reactChip: { flexDirection: "row", alignItems: "center", backgroundColor: colors.secondary + "40", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: colors.primary + "25" },
  reactEmoji: { fontSize: 14 }, reactCount: { fontSize: 11, color: colors.primary, marginLeft: 3, fontWeight: "600" },
});

// ─── MediaPickerSheet ─────────────────────────────────────────────────────────

type PickedFile = { uri: string; name: string; type: string; mediaType: "IMAGE" | "VIDEO" | "FILE" | "AUDIO"; size?: number };

const MediaPickerSheet: React.FC<{ visible: boolean; onClose: () => void; onPick: (f: PickedFile) => void }> = ({ visible, onClose, onPick }) => {
  const go = async (action: () => Promise<void>) => { onClose(); await action(); };
  const checkSize = (size?: number | null) => {
    if (size && size > MAX_FILE_SIZE) { Alert.alert("Файл слишком большой", "Максимальный размер — 100 МБ"); return false; }
    return true;
  };
  const pickImage = async () => {
    const r = await launchImageLibrary({ mediaType: "photo", quality: 1 });
    const a = r.assets?.[0];
    if (a?.uri && checkSize(a.fileSize)) onPick({ uri: a.uri, name: a.fileName ?? "photo.jpg", type: a.type ?? "image/jpeg", mediaType: "IMAGE", size: a.fileSize ?? 0 });
  };
  const pickVideo = async () => {
    const r = await launchImageLibrary({ mediaType: "video" });
    const a = r.assets?.[0];
    if (a?.uri && checkSize(a.fileSize)) onPick({ uri: a.uri, name: a.fileName ?? "video.mp4", type: a.type ?? "video/mp4", mediaType: "VIDEO", size: a.fileSize ?? 0 });
  };
  const pickCamera = async () => {
    const r = await launchCamera({ mediaType: "photo", quality: 1 });
    const a = r.assets?.[0];
    if (a?.uri && checkSize(a.fileSize)) onPick({ uri: a.uri, name: a.fileName ?? "photo.jpg", type: a.type ?? "image/jpeg", mediaType: "IMAGE", size: a.fileSize ?? 0 });
  };
  const pickAudio = async () => {
    const [r] = await pick({ type: ["audio/*"], allowMultiSelection: false });
    if (!checkSize((r as any).size)) return;
    onPick({ uri: r.uri, name: r.name ?? "audio", type: r.type ?? "audio/mpeg", mediaType: "AUDIO", size: (r as any).size ?? 0 });
  };
  const pickFile = async () => {
    const [r] = await pick({ type: ["*/*"], allowMultiSelection: false });
    if (!checkSize((r as any).size)) return;
    onPick({ uri: r.uri, name: r.name ?? "file", type: r.type ?? "application/octet-stream", mediaType: "FILE", size: (r as any).size ?? 0 });
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

// ─── AudioRecordingOverlay ────────────────────────────────────────────────────

const AudioRecordingOverlay: React.FC<{
  visible: boolean;
  duration: number;
  slideX: Animated.Value;
  onCancel: () => void;
}> = ({ visible, duration, slideX, onCancel }) => {
  if (!visible) return null;
  const cancelOpacity = slideX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0.4], extrapolate: "clamp" });
  const arrowOpacity = slideX.interpolate({ inputRange: [-80, 0], outputRange: [0.3, 1], extrapolate: "clamp" });
  return (
    <View style={recS.overlay} pointerEvents="box-none">
      <View style={recS.left}>
        <View style={recS.redDot} />
        <Text style={recS.timer}>{formatDuration(duration)}</Text>
      </View>
      <Animated.View style={[recS.slideHint, { opacity: arrowOpacity }]}>
        <Icon name="chevron-left" size={16} color={colors.primary + "70"} />
        <Icon name="chevron-left" size={16} color={colors.primary + "50"} style={{ marginLeft: -8 }} />
        <Text style={recS.slideText}>Сдвиньте для отмены</Text>
      </Animated.View>
      <Animated.Text style={[recS.cancelLabel, { opacity: cancelOpacity }]} onPress={onCancel}>
        Отмена
      </Animated.Text>
    </View>
  );
};
const recS = StyleSheet.create({
  overlay: { position: "absolute", left: 0, right: 52, top: 0, bottom: 0, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, backgroundColor: colors.background, zIndex: 10 },
  left: { flexDirection: "row", alignItems: "center", gap: 8 },
  redDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#ff453a" },
  timer: { fontSize: 16, fontWeight: "600", color: colors.text, fontVariant: ["tabular-nums"] },
  slideHint: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2 },
  slideText: { fontSize: 13, color: colors.primary + "60" },
  cancelLabel: { fontSize: 14, fontWeight: "600", color: "#ff453a" },
});

// ─── CircleRecordModal ────────────────────────────────────────────────────────

const CircleRecordModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  onSend: (file: PickedFile) => void;
}> = ({ visible, onClose, onSend }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const MAX_DURATION = 60;

  useEffect(() => {
    if (visible) {
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }).start();
    } else {
      scaleAnim.setValue(0.8);
      setIsRecording(false);
      setDuration(0);
      progressAnim.setValue(0);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [visible]);

  const handleCancel = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
    setDuration(0);
    progressAnim.setValue(0);
    onClose();
  }, [onClose, progressAnim]);

  const stopAndSend = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    Animated.timing(progressAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
  }, [progressAnim]);

  const startRecording = useCallback(async () => {
    setIsRecording(true);
    setDuration(0);
    progressAnim.setValue(0);
    Animated.timing(progressAnim, { toValue: 1, duration: MAX_DURATION * 1000, useNativeDriver: false }).start();
    timerRef.current = setInterval(() => {
      setDuration((d) => {
        if (d + 1 >= MAX_DURATION) { stopAndSend(); return d + 1; }
        return d + 1;
      });
    }, 1000);
    try {
      const r = await launchCamera({ mediaType: "video", videoQuality: "high", durationLimit: MAX_DURATION });
      const a = r.assets?.[0];
      if (a?.uri) {
        if ((a.fileSize ?? 0) > MAX_FILE_SIZE) {
          Alert.alert("Файл слишком большой", "Максимальный размер — 100 МБ");
          handleCancel();
          return;
        }
        onSend({ uri: a.uri, name: a.fileName ?? "circle.mp4", type: a.type ?? "video/mp4", mediaType: "VIDEO", size: a.fileSize ?? 0 });
      }
      onClose();
    } catch (_) {
      handleCancel();
    }
  }, [handleCancel, onClose, onSend, progressAnim, stopAndSend]);

  const CIRCLE_SIZE = 220;

  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={handleCancel}>
      <View style={crS.backdrop}>
        <Animated.View style={[crS.container, { transform: [{ scale: scaleAnim }] }]}>
          <View style={crS.ringOuter}>
            <View style={[crS.circle, { width: CIRCLE_SIZE, height: CIRCLE_SIZE, borderRadius: CIRCLE_SIZE / 2 }]}>
              <View style={crS.innerCircle}>
                <Icon name="video" size={48} color={colors.text + "80"} />
                {isRecording && <Text style={crS.durationBig}>{formatDuration(duration * 1000)}</Text>}
              </View>
            </View>
          </View>
          {!isRecording ? (
            <View style={crS.controls}>
              <Text style={crS.hint}>Нажмите для записи</Text>
              <View style={crS.btnRow}>
                <TouchableOpacity style={crS.cancelBtn} onPress={handleCancel} activeOpacity={0.8}><Icon name="x" size={22} color={colors.text} /></TouchableOpacity>
                <TouchableOpacity style={crS.recordBtn} onPress={startRecording} activeOpacity={0.8}><View style={crS.recordDot} /></TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={crS.controls}>
              <Text style={crS.hint}>Запись... нажмите чтобы отправить</Text>
              <View style={crS.btnRow}>
                <TouchableOpacity style={crS.cancelBtn} onPress={handleCancel} activeOpacity={0.8}><Icon name="x" size={22} color={colors.text} /></TouchableOpacity>
                <TouchableOpacity style={crS.stopBtn} onPress={stopAndSend} activeOpacity={0.8}><Icon name="send" size={20} color="#fff" /></TouchableOpacity>
              </View>
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
};
const crS = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", alignItems: "center" },
  container: { alignItems: "center", gap: 32 },
  ringOuter: { padding: 6, borderRadius: 999, borderWidth: 3, borderColor: colors.accent },
  circle: { backgroundColor: colors.secondary + "40", overflow: "hidden", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.primary + "20" },
  innerCircle: { alignItems: "center", gap: 12 },
  durationBig: { fontSize: 20, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] },
  controls: { alignItems: "center", gap: 16 },
  hint: { fontSize: 14, color: colors.primary + "80", textAlign: "center" },
  btnRow: { flexDirection: "row", gap: 24, alignItems: "center" },
  cancelBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.secondary + "60", borderWidth: 1, borderColor: colors.primary + "20", alignItems: "center", justifyContent: "center" },
  recordBtn: { width: 68, height: 68, borderRadius: 34, backgroundColor: "#ff453a", alignItems: "center", justifyContent: "center", shadowColor: "#ff453a", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 8 },
  recordDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#fff" },
  stopBtn: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 8 },
});

// ─── RightActionButton ────────────────────────────────────────────────────────

interface RightBtnProps {
  mode: "send" | "mic";
  micSubMode: "audio" | "circle";
  uploading: boolean;
  onSend: () => void;
  onMicPress: () => void;
  onMicLongPressIn: () => void;
  onMicLongPressOut: () => void;
  slideX: Animated.Value;
}

const RightActionButton: React.FC<RightBtnProps> = ({ mode, micSubMode, uploading, onSend, onMicPress, onMicLongPressIn, onMicLongPressOut, slideX }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const prevKey = useRef(`${mode}-${micSubMode}`);

  const animateSwitch = useCallback(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.65, duration: 75, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 220, friction: 8 }),
    ]).start();
  }, [scaleAnim]);

  useEffect(() => {
    const key = `${mode}-${micSubMode}`;
    if (prevKey.current !== key) {
      prevKey.current = key;
      animateSwitch();
    }
  }, [mode, micSubMode]);

  const rippleAnim = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => mode === "mic",
      onMoveShouldSetPanResponder: () => mode === "mic",
      onPanResponderGrant: () => {
        onMicLongPressIn();
        Animated.timing(rippleAnim, { toValue: 1, duration: 300, useNativeDriver: false }).start();
      },
      onPanResponderMove: (_, gs) => {
        if (gs.dx < 0) slideX.setValue(Math.max(gs.dx, -120));
      },
      onPanResponderRelease: () => {
        Animated.timing(rippleAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
        slideX.setValue(0);
        onMicLongPressOut();
      },
      onPanResponderTerminate: () => {
        rippleAnim.setValue(0);
        slideX.setValue(0);
        onMicLongPressOut();
      },
    })
  ).current;

  const rippleSize = rippleAnim.interpolate({ inputRange: [0, 1], outputRange: [36, 60] });
  const rippleOpacity = rippleAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] });

  if (uploading) {
    return (
      <View style={[rbS.btn, { backgroundColor: colors.secondary + "40" }]}>
        <ActivityIndicator size="small" color={colors.accent} />
      </View>
    );
  }

  if (mode === "send") {
    return (
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <TouchableOpacity style={rbS.btn} onPress={onSend} activeOpacity={0.85}>
          <Icon name="send" size={15} color={colors.text} />
        </TouchableOpacity>
      </Animated.View>
    );
  }

  const iconName = micSubMode === "audio" ? "mic" : "video";
  const btnColor = micSubMode === "audio" ? colors.secondary + "60" : colors.accent + "30";
  const iconColor = micSubMode === "audio" ? colors.text : colors.accent;
  const borderColor = micSubMode === "audio" ? colors.primary + "25" : colors.accent + "60";

  return (
    <Animated.View style={[rbS.micWrap, { transform: [{ scale: scaleAnim }] }]} {...panResponder.panHandlers}>
      <Animated.View
        style={[rbS.ripple, { width: rippleSize, height: rippleSize, borderRadius: 36, opacity: rippleOpacity, backgroundColor: colors.accent }]}
        pointerEvents="none"
      />
      <TouchableOpacity
        style={[rbS.btn, rbS.micBtn, { backgroundColor: btnColor, borderColor }]}
        onPress={onMicPress}
        activeOpacity={0.85}
      >
        <Icon name={iconName} size={17} color={iconColor} />
      </TouchableOpacity>
    </Animated.View>
  );
};

const rbS = StyleSheet.create({
  btn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", shadowColor: colors.accent, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.28, shadowRadius: 6, elevation: 5 },
  micBtn: { backgroundColor: colors.secondary + "60", borderWidth: 1.5, borderColor: colors.primary + "25", shadowOpacity: 0, elevation: 0 },
  micWrap: { position: "relative", alignItems: "center", justifyContent: "center" },
  ripple: { position: "absolute", backgroundColor: colors.accent },
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

  const { messages, markRead, pinnedMessages: rawPinnedMessages, sendMessage, sendMedia, editMessage, deleteMessage, reactToMessage, pinMessage, unpinMessage } = useChatRoom(chatId);
  const pinnedMessages: PinnedMessage[] = rawPinnedMessages;
  const { typingUserIds, startTyping, stopTyping } = useTyping(chatId);

  const headerHeightRef = useRef(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const isFocusedRef = useRef(false);
  useFocusEffect(useCallback(() => { isFocusedRef.current = true; return () => { isFocusedRef.current = false; }; }, []));

  const prevMsgLenRef = useRef(0);
  useEffect(() => {
    const prev = prevMsgLenRef.current;
    prevMsgLenRef.current = messages.length;
    if (!isFocusedRef.current) return;
    if (messages.length === 0) return;
    if (messages.length <= prev) return;
    markRead();
  }, [messages, markRead]);

  // ── Android keyboard height tracking ──────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

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

  // ── Audio/Circle recording state ───────────────────────────────────────────
  const [isAudioRecording, setIsAudioRecording] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [circleModalVisible, setCircleModalVisible] = useState(false);
  const [audioWasCancelled, setAudioWasCancelled] = useState(false);
  const [micSubMode, setMicSubMode] = useState<"audio" | "circle">("audio");
  const audioSlideX = useRef(new Animated.Value(0)).current;
  const longPressActive = useRef(false);

  // ── Swipe multiselect state ────────────────────────────────────────────────
  const swipeSelectRef = useRef<{
    active: boolean;
    startIndex: number;
    adding: boolean;
    lastIndex: number;
  }>({ active: false, startIndex: -1, adding: true, lastIndex: -1 });

  const ITEM_HEIGHT = 52;
  const reversedMessagesRef = useRef<Message[]>([]);

  // Auto-scroll while swiping near edges
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoScrollSpeed = useRef(0);
  const currentScrollOffset = useRef(0);
  // pageY of the top edge of the FlatList (measured on layout)
  const listTopPageY = useRef(120);
  const listHeightRef = useRef(SCREEN_H - 180);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollTimer.current) {
      clearInterval(autoScrollTimer.current);
      autoScrollTimer.current = null;
    }
    autoScrollSpeed.current = 0;
  }, []);

  const startAutoScroll = useCallback(() => {
    if (autoScrollTimer.current) return;
    autoScrollTimer.current = setInterval(() => {
      const speed = autoScrollSpeed.current;
      if (speed === 0 || !listRef.current) return;
      // Update our tracked offset so index calc stays accurate during scroll
      const next = Math.max(0, currentScrollOffset.current + speed);
      currentScrollOffset.current = next;
      listRef.current.scrollToOffset({ offset: next, animated: false });
    }, 16);
  }, []);

  const isSelectMode = selectedIds.size > 0;
  const inputMode: "send" | "mic" = inputText.trim().length > 0 || !!editTarget ? "send" : "mic";
  const listRef = useRef<FlatList>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setPinActiveIndex(pinnedMessages.length > 0 ? pinnedMessages.length - 1 : 0); }, [pinnedMessages.length]);
  useEffect(() => { if (editTarget) setInputText(editTarget.content ?? ""); }, [editTarget]);

  const reversedMessages = messages.slice().reverse();

  // Keep ref in sync
  useEffect(() => {
    reversedMessagesRef.current = reversedMessages;
  }, [messages]);

  const pinnedMessageIds = new Set(pinnedMessages.map((p) => p.messageId));

  // ── Send text ──────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    if (editTarget) { editMessage(editTarget.id, text); setEditTarget(null); setInputText(""); return; }
    sendMessage(text, replyTo?.id);
    setInputText("");
    setReplyTo(null);
    stopTyping();
    if (typingTimer.current) clearTimeout(typingTimer.current);
  }, [inputText, editTarget, editMessage, sendMessage, replyTo, stopTyping]);

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

  const handleMediaPick = useCallback(async (file: PickedFile) => {
    setUploading(true);
    try {
      await sendMedia(file, file.mediaType, replyTo?.id);
      setReplyTo(null);
    } catch { Alert.alert("Ошибка", "Не удалось загрузить файл"); }
    finally { setUploading(false); }
  }, [sendMedia, replyTo]);

  // ── Mic ───────────────────────────────────────────────────────────────────
  const handleMicPress = useCallback(() => {
    if (longPressActive.current) return;
    setMicSubMode((prev) => (prev === "audio" ? "circle" : "audio"));
  }, []);

  const startAudioRecording = useCallback(async () => {
    if (!AudioRecord) {
      Alert.alert("Недоступно", "Установите react-native-audio-record:\nnpm install react-native-audio-record --legacy-peer-deps");
      return;
    }
    const hasPerm = await requestMicPermission();
    if (!hasPerm) { Alert.alert("Нет доступа", "Разрешите доступ к микрофону в настройках"); return; }
    try {
      AudioRecord.init({ sampleRate: 16000, channels: 1, bitsPerSample: 16, audioSource: 6, wavFile: `voice_${Date.now()}.wav` });
      AudioRecord.start();
      setAudioDuration(0);
      const startTime = Date.now();
      const durationInterval = setInterval(() => { setAudioDuration(Date.now() - startTime); }, 250);
      (audioSlideX as any)._durationInterval = durationInterval;
      setIsAudioRecording(true);
      setAudioWasCancelled(false);
    } catch (err) {
      console.warn("Audio record error", err);
      setIsAudioRecording(false);
    }
  }, []);

  const stopAudioRecording = useCallback(async (cancel = false) => {
    if (!AudioRecord) return;
    if ((audioSlideX as any)._durationInterval) {
      clearInterval((audioSlideX as any)._durationInterval);
      (audioSlideX as any)._durationInterval = null;
    }
    try {
      const filePath: string = await AudioRecord.stop();
      setIsAudioRecording(false);
      setAudioDuration(0);
      if (cancel || audioWasCancelled) { setAudioWasCancelled(false); return; }
      if (!filePath) return;
      const uri = Platform.OS === "android" ? `file://${filePath}` : filePath;
      await handleMediaPick({ uri, name: `voice_${Date.now()}.wav`, type: "audio/wav", mediaType: "AUDIO" });
    } catch (err) {
      console.warn("Stop record error", err);
      setIsAudioRecording(false);
    }
  }, [audioWasCancelled, handleMediaPick]);

  const handleMicLongPressIn = useCallback(() => {
    longPressActive.current = true;
    if (micSubMode === "audio") {
      startAudioRecording();
    } else {
      setCircleModalVisible(true);
    }
  }, [micSubMode, startAudioRecording]);

  const handleMicLongPressOut = useCallback(() => {
    if (!longPressActive.current) return;
    longPressActive.current = false;
    if (micSubMode === "circle") { audioSlideX.setValue(0); return; }
    let xVal = 0;
    (audioSlideX as any)._value !== undefined && (xVal = (audioSlideX as any)._value);
    const cancelled = xVal < -60;
    if (cancelled) setAudioWasCancelled(true);
    stopAudioRecording(cancelled);
    audioSlideX.setValue(0);
  }, [micSubMode, stopAudioRecording, audioSlideX]);

  const handleCancelRecording = useCallback(() => {
    setAudioWasCancelled(true);
    longPressActive.current = false;
    stopAudioRecording(true);
    audioSlideX.setValue(0);
  }, [stopAudioRecording, audioSlideX]);

  // ── tap / longpress ───────────────────────────────────────────────────────
  // Simple tap in select mode toggles the message; outside select mode opens action sheet
  const handleTap = useCallback((msg: Message, pageY: number) => {
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
  }, [isSelectMode]);

  // Long press: add to existing selection (don't reset), activate swipe tracking
  const handleLongPress = useCallback((msg: Message) => {
    const msgs = reversedMessagesRef.current;
    const idx = msgs.findIndex((m) => m.id === msg.id);
    const isAlreadySelected = selectedIds.has(msg.id);

    swipeSelectRef.current = {
      active: true,
      startIndex: idx,
      adding: !isAlreadySelected,
      lastIndex: idx,
    };

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (isAlreadySelected) next.delete(msg.id);
      else next.add(msg.id);
      return next;
    });
  }, [selectedIds]);

  // ── PanResponder for swipe-to-multiselect on message list ─────────────────
  const listPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        swipeSelectRef.current.active && Math.abs(gs.dy) > 6 && Math.abs(gs.dy) > Math.abs(gs.dx),

      onPanResponderGrant: () => {
        startAutoScroll();
      },

      onPanResponderMove: (e) => {
        if (!swipeSelectRef.current.active) return;
        const { startIndex, adding } = swipeSelectRef.current;
        const msgs = reversedMessagesRef.current;
        const pageY = e.nativeEvent.pageY;

        // ── Auto-scroll: zones are relative to the list area ─────────────────
        // listTopPageY = where the list starts on screen
        // EDGE_ZONE = 80px trigger zone at top/bottom of the list
        const listTop = listTopPageY.current;
        const listBot = listTop + listHeightRef.current;
        const EDGE_ZONE = 80; // px from list edge that triggers scroll
        const MAX_SPEED = 8;  // px per frame at the very edge

        if (pageY < listTop + EDGE_ZONE) {
          // Finger near top of list → scroll toward newer messages
          // inverted list: scrollOffset increases going toward older, so we decrease offset
          const ratio = 1 - Math.max(0, pageY - listTop) / EDGE_ZONE;
          autoScrollSpeed.current = -(1 + ratio * (MAX_SPEED - 1));
        } else if (pageY > listBot - EDGE_ZONE) {
          // Finger near bottom of list → scroll toward older messages
          const ratio = 1 - Math.max(0, listBot - pageY) / EDGE_ZONE;
          autoScrollSpeed.current = 1 + ratio * (MAX_SPEED - 1);
        } else {
          autoScrollSpeed.current = 0;
        }

        // ── Index under finger ────────────────────────────────────────────────
        // The list is inverted. scrollOffset=0 means bottom (newest).
        // Absolute position of a message in the scroll content:
        //   contentPos = scrollOffset + (pageY - listTop)   [from bottom of list]
        // Index in reversedMessages (0 = newest = bottom of inverted list):
        //   index = floor(contentPos / ITEM_HEIGHT)
        const contentPos = currentScrollOffset.current + (pageY - listTop);
        const currentIndex = Math.max(0, Math.min(
          Math.floor(contentPos / ITEM_HEIGHT),
          msgs.length - 1
        ));

        if (currentIndex === swipeSelectRef.current.lastIndex) return;
        swipeSelectRef.current.lastIndex = currentIndex;

        const minIdx = Math.min(startIndex, currentIndex);
        const maxIdx = Math.max(startIndex, currentIndex);
        const clampedMax = Math.min(maxIdx, minIdx + 99);

        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (let i = minIdx; i <= clampedMax; i++) {
            const id = msgs[i]?.id;
            if (id == null) continue;
            if (adding) next.add(id);
            else next.delete(id);
          }
          return next;
        });
      },

      onPanResponderRelease: () => {
        swipeSelectRef.current.active = false;
        stopAutoScroll();
      },
      onPanResponderTerminate: () => {
        swipeSelectRef.current.active = false;
        stopAutoScroll();
      },
    })
  ).current;

  // ── scroll to message + flash ─────────────────────────────────────────────
  const handleGoToMessage = useCallback((msgId: number) => {
    const idx = reversedMessagesRef.current.findIndex((m) => m.id === msgId);
    if (idx < 0) return;
    listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
    setTimeout(() => { setHighlightedId(msgId); setTimeout(() => setHighlightedId(null), 1_800); }, 350);
  }, []);

  const handlePinnedBannerPress = useCallback(() => {
    if (!pinnedMessages.length) return;
    handleGoToMessage(pinnedMessages[pinActiveIndex].messageId);
    setPinActiveIndex((prev) => (prev <= 0 ? pinnedMessages.length - 1 : prev - 1));
  }, [pinnedMessages, pinActiveIndex, handleGoToMessage]);

  // ── delete ────────────────────────────────────────────────────────────────
  const requestDelete = useCallback((target: Message | Message[]) => { setDeleteTarget(target); setDeleteVisible(true); }, []);
  const handleDeleteSelf = useCallback(() => { setDeleteVisible(false); if (!deleteTarget) return; (Array.isArray(deleteTarget) ? deleteTarget : [deleteTarget]).forEach((m) => deleteMessage(m.id, false)); exitSelectMode(); }, [deleteTarget, deleteMessage]);
  const handleDeleteAll = useCallback(() => { setDeleteVisible(false); if (!deleteTarget) return; (Array.isArray(deleteTarget) ? deleteTarget : [deleteTarget]).forEach((m) => deleteMessage(m.id, true)); exitSelectMode(); }, [deleteTarget, deleteMessage]);

  // ── forward ───────────────────────────────────────────────────────────────
  const handleForwardRequest = useCallback((msg: Message) => { setForwardQueue([msg]); setForwardPickerOpen(true); }, []);
  const handleMultiForwardRequest = useCallback(() => {
    const msgs = messages.filter((m) => selectedIds.has(m.id));
    if (!msgs.length) return;
    setForwardQueue(msgs);
    setForwardPickerOpen(true);
  }, [messages, selectedIds]);
  const handleForwardToChat = useCallback((targetChatId: number) => {
    forwardQueue.forEach((m) => forwardToChat(targetChatId, m.id));
    setForwardQueue([]);
    exitSelectMode();
  }, [forwardQueue, forwardToChat]);

  // ── multiselect actions ───────────────────────────────────────────────────
  const exitSelectMode = useCallback(() => {
    setSelectedIds(new Set());
    swipeSelectRef.current = { active: false, startIndex: -1, adding: true, lastIndex: -1 };
    stopAutoScroll();
  }, [stopAutoScroll]);

  const getSelected = useCallback(() => messages.filter((m) => selectedIds.has(m.id)), [messages, selectedIds]);
  const handleMultiCopy = useCallback(() => {
    const text = getSelected().filter((m) => m.type === "TEXT" && m.content).map((m) => m.content!).join("\n");
    if (text) Clipboard.setString(text);
    exitSelectMode();
  }, [getSelected, exitSelectMode]);
  const handleMultiDelete = useCallback(() => requestDelete(getSelected()), [getSelected, requestDelete]);

  // ── pin / unpin ───────────────────────────────────────────────────────────
  const handlePinRequest = useCallback((msg: Message) => { setPinTarget(msg); setPinDialogVisible(true); }, []);
  const handlePinSelf = useCallback(() => { setPinDialogVisible(false); if (pinTarget) pinMessage(pinTarget.id, false); setPinTarget(null); }, [pinTarget, pinMessage]);
  const handlePinAll = useCallback(() => { setPinDialogVisible(false); if (pinTarget) pinMessage(pinTarget.id, true); setPinTarget(null); }, [pinTarget, pinMessage]);
  const handleUnpinRequest = useCallback((msg: Message) => unpinMessage(msg.id), [unpinMessage]);
  const handleCopy = useCallback((msg: Message) => { if (msg.content) Clipboard.setString(msg.content); }, []);
  const cancelCompose = () => { setReplyTo(null); setEditTarget(null); setInputText(""); };

  const otherInitials = otherUser.nickName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const tapIsOwn = !!me && !!tapMessage && Number(tapMessage.senderId) === Number(me.id);
  const tapIsPinned = !!tapMessage && pinnedMessageIds.has(tapMessage.id);

  // ── Navigate to profile — pass bannerUrl ──────────────────────────────────
  const handleOpenProfile = useCallback(() => {
    navigation.navigate("UserProfileScreen", {
      user: {
        id: otherUser.id,
        nickName: otherUser.nickName,
        username: otherUser.username,
        avatarUrl: otherUser.avatarUrl ?? null,
        bannerUrl: otherUser.bannerUrl ?? null,
      }
    });
  }, [navigation, otherUser]);

  const renderMessage = useCallback(({ item, index }: { item: Message; index: number }) => {
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
  }, [me?.id, messages, reactToMessage, selectedIds, isSelectMode, handleTap, handleLongPress, highlightedId]);

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      <View style={s.container}>
        {/* Header */}
        <View style={s.headerWrap} onLayout={(e) => { const h = e.nativeEvent.layout.height; headerHeightRef.current = h; setHeaderHeight(h); }}>
          {otherUser.bannerUrl ? <Image source={{ uri: otherUser.bannerUrl }} style={s.headerBanner} resizeMode="cover" blurRadius={Platform.OS === "ios" ? 20 : 4} /> : null}
          <View style={[s.headerOverlay, !otherUser.bannerUrl && s.headerOverlayNoBanner]} />
          <View style={s.header}>
            {isSelectMode ? (
              <>
                <TouchableOpacity style={s.iconBtn} onPress={exitSelectMode}><Icon name="x" size={20} color={colors.text} /></TouchableOpacity>
                <Text style={s.selectCount}>{selectedIds.size} выбрано</Text>
                <View style={s.selectActions}>
                  <TouchableOpacity style={s.iconBtn} onPress={handleMultiCopy}><Icon name="copy" size={18} color={colors.text + "CC"} /></TouchableOpacity>
                  <TouchableOpacity style={s.iconBtn} onPress={handleMultiForwardRequest}><Icon name="share-2" size={18} color={colors.text + "CC"} /></TouchableOpacity>
                  <TouchableOpacity style={s.iconBtn} onPress={handleMultiDelete}><Icon name="trash-2" size={18} color="#ff453a" /></TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <TouchableOpacity style={s.iconBtn} onPress={() => navigation.canGoBack() && navigation.goBack()}><Icon name="arrow-left" size={22} color={colors.text} /></TouchableOpacity>
                <TouchableOpacity style={s.headerInfo} activeOpacity={0.75} onPress={handleOpenProfile}>
                  <View style={s.avatarWrap}>
                    {otherUser.avatarUrl ? <Image source={{ uri: otherUser.avatarUrl }} style={s.headerAvatar} /> : <View style={s.headerAvatarPh}><Text style={s.headerAvatarIn}>{otherInitials}</Text></View>}
                    {isOnline && <View style={s.onlineDot} />}
                  </View>
                  <View style={s.headerTextCol}>
                    <Text style={s.headerName} numberOfLines={1}>{otherUser.nickName}</Text>
                    <Text style={[s.headerStatus, isOnline && s.headerStatusOnline]}>{isOnline ? "онлайн" : `@${otherUser.username}`}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={s.iconBtn} onPress={() => setSearchVisible((v) => !v)}>
                  <Icon name={searchVisible ? "x" : "search"} size={19} color={colors.text + "CC"} />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {searchVisible && !isSelectMode && <SearchBar chatId={chatId} onClose={() => setSearchVisible(false)} onGoTo={handleGoToMessage} />}
        {pinnedMessages.length > 0 && !searchVisible && !isSelectMode && <PinnedBanner pinnedMessages={pinnedMessages} activeIndex={pinActiveIndex} onPress={handlePinnedBannerPress} />}
          <KeyboardAvoidingView
            style={{ flex: 1, paddingBottom: Platform.OS === "android" ? keyboardHeight : 0 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight : 0}
          >
          {/* Wrap FlatList in a View that captures swipe-to-select gestures */}
          <View
            style={{ flex: 1 }}
            {...(isSelectMode ? listPanResponder.panHandlers : {})}
            onLayout={(e) => {
              // measure gives position relative to parent; use ref.measure for pageY
              e.target.measure((_x, _y, _w, h, _px, py) => {
                listTopPageY.current = py;
                listHeightRef.current = h;
              });
            }}
          >
            <FlatList
              ref={listRef}
              data={reversedMessages}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderMessage}
              inverted
              showsVerticalScrollIndicator={false}
              contentContainerStyle={s.msgList}
              scrollEnabled={!swipeSelectRef.current.active}
              onScroll={(e) => {
                currentScrollOffset.current = e.nativeEvent.contentOffset.y;
              }}
              scrollEventThrottle={16}
              onScrollToIndexFailed={(info) => {
                setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 }), 100);
              }}
              ListHeaderComponent={typingUserIds.length > 0 ? <View style={{ paddingBottom: 4 }}><TypingIndicator /></View> : null}
            />
          </View>

          {(replyTo || editTarget) && !isSelectMode && (
            <ComposeBanner mode={editTarget ? "edit" : "reply"} message={(editTarget ?? replyTo)!} onCancel={cancelCompose} />
          )}

          {!isSelectMode && (
            <View style={s.inputBar}>
              <TouchableOpacity style={s.attachBtn} onPress={() => setMediaPickerVisible(true)} disabled={uploading || isAudioRecording} activeOpacity={0.8}>
                <Icon name="paperclip" size={17} color={isAudioRecording ? colors.primary + "30" : colors.primary + "90"} />
              </TouchableOpacity>

              <View style={s.inputWrap}>
                {isAudioRecording ? (
                  <AudioRecordingOverlay
                    visible={isAudioRecording}
                    duration={audioDuration}
                    slideX={audioSlideX}
                    onCancel={handleCancelRecording}
                  />
                ) : (
                  <TextInput
                    value={inputText}
                    onChangeText={handleTextChange}
                    style={s.input}
                    placeholder={editTarget ? "Редактировать..." : "Сообщение..."}
                    placeholderTextColor={colors.primary + "50"}
                    multiline
                    maxLength={2_000}
                  />
                )}
              </View>

              <RightActionButton
                mode={inputMode}
                micSubMode={micSubMode}
                uploading={uploading}
                onSend={handleSend}
                onMicPress={handleMicPress}
                onMicLongPressIn={handleMicLongPressIn}
                onMicLongPressOut={handleMicLongPressOut}
                slideX={audioSlideX}
              />
            </View>
          )}
        </KeyboardAvoidingView>

        <CircleRecordModal visible={circleModalVisible} onClose={() => setCircleModalVisible(false)} onSend={handleMediaPick} />

        <TapActionSheet
          message={tapMessage} tapY={tapY} isOwn={tapIsOwn} isPinned={tapIsPinned}
          onClose={() => setTapMessage(null)} onReact={reactToMessage}
          onReply={(msg) => { setReplyTo(msg); setEditTarget(null); }}
          onEdit={(msg) => { setEditTarget(msg); setReplyTo(null); }}
          onDeleteRequest={requestDelete} onForwardRequest={handleForwardRequest}
          onPinRequest={handlePinRequest} onUnpinRequest={handleUnpinRequest} onCopy={handleCopy}
        />

        <PinDialog visible={pinDialogVisible} onClose={() => { setPinDialogVisible(false); setPinTarget(null); }} onPinSelf={handlePinSelf} onPinAll={handlePinAll} />
        <DeleteDialog visible={deleteVisible} multiCount={Array.isArray(deleteTarget) ? deleteTarget.length : undefined} onClose={() => setDeleteVisible(false)} onDeleteSelf={handleDeleteSelf} onDeleteAll={handleDeleteAll} />
        <ForwardPicker visible={forwardPickerOpen} myId={me?.id ?? 0} onClose={() => { setForwardPickerOpen(false); setForwardQueue([]); }} onSelect={handleForwardToChat} />
        <MediaPickerSheet visible={mediaPickerVisible} onClose={() => setMediaPickerVisible(false)} onPick={handleMediaPick} />
      </View>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", paddingTop: Platform.OS === "ios" ? 56 : 36, paddingBottom: 14, paddingHorizontal: 16, gap: 12 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.secondary + "40", alignItems: "center", justifyContent: "center" },
  headerInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  avatarWrap: { position: "relative" },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: colors.accent + "50" },
  headerAvatarPh: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.secondary + "60", borderWidth: 2, borderColor: colors.accent + "40", alignItems: "center", justifyContent: "center" },
  headerAvatarIn: { fontSize: 13, fontWeight: "700", color: colors.text },
  onlineDot: { position: "absolute", bottom: 0, right: 0, width: 11, height: 11, borderRadius: 5.5, backgroundColor: (colors as any).onlineColor, borderWidth: 2, borderColor: colors.background },
  headerTextCol: { flex: 1 },
  headerName: { fontSize: 16, fontWeight: "700", color: colors.text, letterSpacing: -0.2 },
  headerStatus: { fontSize: 12, color: colors.primary + "60", marginTop: 1 },
  headerStatusOnline: { color: (colors as any).onlineColor, fontWeight: "600" },
  selectCount: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.text, marginLeft: 4 },
  selectActions: { flexDirection: "row", gap: 4 },
  msgList: { paddingVertical: 12, paddingBottom: 6 },
  inputBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 6, paddingBottom: 6, borderTopWidth: 1, borderTopColor: colors.primary + "12", backgroundColor: colors.background, gap: 6 },
  attachBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  inputWrap: { flex: 1, backgroundColor: colors.secondary + "30", borderRadius: 20, borderWidth: 1, borderColor: colors.primary + "20", paddingHorizontal: 14, paddingVertical: Platform.OS === "ios" ? 8 : 4, maxHeight: 100, minHeight: 36, justifyContent: "center", overflow: "hidden" },
  input: { color: colors.text, fontSize: 14, lineHeight: 19 },
  headerWrap: { position: "relative", overflow: "hidden", borderBottomWidth: 1, borderBottomColor: colors.primary + "15" },
  headerBanner: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  headerOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(17, 13, 22, 0.78)" },
  headerOverlayNoBanner: { backgroundColor: colors.background },
});

export default ChatScreen;