import {
  RouteProp,
  useFocusEffect,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  PermissionsAndroid,
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

// ─── Lazy-load react-native-video ─────────────────────────────────────────────
let VideoPlayer: any = null;
try { VideoPlayer = require("react-native-video").default; } catch (_) {}

// ─── Lazy-load react-native-sound ─────────────────────────────────────────────
let Sound: any = null;
try { Sound = require("react-native-sound"); Sound.setCategory("Playback"); } catch (_) {}

// ─── Lazy-load react-native-file-viewer ───────────────────────────────────────
let FileViewer: any = null;
try { FileViewer = require("react-native-file-viewer").default; } catch (_) {}
import {
  Chat,
  Message,
  MessageType,
  PinnedMessage,
} from "../../api/chat.types";
import { useGlobalPlayer, GlobalPlayerType } from "../../context/GlobalPlayerContext";
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
import { SafeAreaView } from "react-native-safe-area-context";

// ─── Кеш позиции скролла по chatId — переживает размонтирование компонента ────
const _scrollOffsetCache = new Map<number, number>();


// Простая библиотека без Nitro/codegen, работает на RN 0.83 сразу.
// API: AudioRecord.init(options) → AudioRecord.start() → AudioRecord.stop() → path
// Инициализируем модуль лениво — только когда нужен (после маунта).
let AudioRecord: any = null;
try {
  AudioRecord = require("react-native-audio-record").default;
} catch (_) {}

// ─── Lazy-load VisionCamera for circle video ─────────────────────────────────
// Install: npm install react-native-vision-camera + pod install
// Проверяем доступность нативного модуля БЕЗ вызова хуков
let VISION_CAMERA_AVAILABLE = false;
try {
  const vc = require("react-native-vision-camera");
  // Проверяем что нативный модуль реально слинкован
  const { NativeModules } = require("react-native");
  if (vc.Camera && NativeModules.CameraView) {
    VISION_CAMERA_AVAILABLE = true;
  }
} catch (_) {}

// ─── Permissions ──────────────────────────────────────────────────────────────
async function requestMicPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: "Микрофон",
        message: "Разрешите доступ к микрофону для записи голосовых сообщений",
        buttonPositive: "OK",
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

async function requestCameraPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ]);
    return (
      results[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED &&
      results[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED
    );
  } catch {
    return false;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
type RouteParams = RouteProp<AppStackParamList, "ChatScreen">;
type PickedFile = {
  uri: string;
  name: string;
  type: string;
  mediaType: "IMAGE" | "VIDEO" | "FILE" | "AUDIO" | "VOICE" | "MUSIC";
  size?: number;
};

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "😡"];
const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get("window");
const SHEET_W = 264;
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const CIRCLE_SIZE = 240;

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

// ══════════════════════════════════════════════════════════════════════════════
// TypingIndicator
// ══════════════════════════════════════════════════════════════════════════════
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
            style={[
              tyS.dot,
              { transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }] },
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
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.secondary + "35", borderRadius: 18, borderBottomLeftRadius: 4,
    paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.primary + "20",
  },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.primary + "80" },
});

// ══════════════════════════════════════════════════════════════════════════════
// PinnedBanner
// ══════════════════════════════════════════════════════════════════════════════
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
      : ({ IMAGE: "🖼 Фото", VIDEO: "🎥 Видео", FILE: "📎 Файл", AUDIO: "🎵 Аудио", VOICE: "🎤 Голосовое", MUSIC: "🎵 Музыка" } as Record<MessageType, string>)[msg.type] ?? "📎";
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
        <Text style={pbS.text} numberOfLines={1}>{label}</Text>
      </View>
      <Icon name="chevron-right" size={16} color={colors.accent + "80"} />
    </TouchableOpacity>
  );
};
const pbS = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.secondary + "25", borderBottomWidth: 1,
    borderBottomColor: colors.primary + "15", paddingVertical: 9, paddingHorizontal: 16, gap: 10,
  },
  bars: { flexDirection: "column", gap: 3 },
  bar: { width: 3, height: 8, borderRadius: 2, backgroundColor: colors.primary + "30" },
  barActive: { backgroundColor: colors.accent },
  content: { flex: 1 },
  label: { fontSize: 11, fontWeight: "700", color: colors.accent, marginBottom: 2 },
  text: { fontSize: 13, color: colors.text, lineHeight: 17 },
});

// ══════════════════════════════════════════════════════════════════════════════
// SearchBar
// ══════════════════════════════════════════════════════════════════════════════
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
          style={sbS.input} placeholder="Поиск в чате..."
          placeholderTextColor={colors.primary + "50"} value={q} onChangeText={setQ} autoFocus
        />
        {isFetching && <ActivityIndicator size="small" color={colors.accent} />}
        <TouchableOpacity onPress={onClose}>
          <Icon name="x" size={18} color={colors.primary + "80"} />
        </TouchableOpacity>
      </View>
      {results && results.length > 0 && (
        <FlatList
          data={results} keyExtractor={(item) => String(item.id)}
          style={sbS.list} keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity style={sbS.result} onPress={() => { onGoTo(item.id); onClose(); }}>
              <Text style={sbS.sender}>{item.sender?.nickName}</Text>
              <Text style={sbS.text} numberOfLines={1}>{item.content ?? "📎 Медиа"}</Text>
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
  container: { backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.primary + "15" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  input: { flex: 1, fontSize: 15, color: colors.text },
  list: { maxHeight: 220, borderTopWidth: 1, borderTopColor: colors.primary + "10" },
  result: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.primary + "08" },
  sender: { fontSize: 11, fontWeight: "700", color: colors.accent, marginBottom: 2 },
  text: { fontSize: 13, color: colors.primary },
  empty: { paddingHorizontal: 16, paddingVertical: 12, fontSize: 13, color: colors.primary + "60" },
});

// ══════════════════════════════════════════════════════════════════════════════
// DeleteDialog
// ══════════════════════════════════════════════════════════════════════════════
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
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 90, friction: 10 }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]).start();
    } else {
      scaleAnim.setValue(0.88);
      fadeAnim.setValue(0);
    }
  }, [visible]);
  if (!visible) return null;
  const label = multiCount && multiCount > 1 ? `${multiCount} сообщ.` : "сообщение";
  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[dlgS.backdrop, { opacity: fadeAnim }]}>
          <TouchableWithoutFeedback>
            <Animated.View style={[dlgS.card, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
              <View style={[dlgS.iconWrap, { backgroundColor: "rgba(255,69,58,0.12)" }]}>
                <Icon name="trash-2" size={30} color="#ff453a" />
              </View>
              <Text style={dlgS.title}>Удалить {label}?</Text>
              <TouchableOpacity
                style={[dlgS.rowPrimary, { backgroundColor: "rgba(255,69,58,0.1)", borderColor: "rgba(255,69,58,0.28)" }]}
                onPress={onDeleteAll} activeOpacity={0.82}
              >
                <View style={[dlgS.rowIcon, { backgroundColor: "#ff453a" }]}>
                  <Icon name="users" size={16} color="#fff" />
                </View>
                <View style={dlgS.rowText}>
                  <Text style={[dlgS.rowTitle, { color: "#ff453a" }]}>Удалить у всех</Text>
                  <Text style={dlgS.rowSub}>Пропадёт у обоих участников</Text>
                </View>
                <Icon name="chevron-right" size={16} color="#ff453a" style={{ opacity: 0.7 }} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[dlgS.rowPrimary, { backgroundColor: colors.secondary + "28", borderColor: colors.primary + "12" }]}
                onPress={onDeleteSelf} activeOpacity={0.82}
              >
                <View style={[dlgS.rowIcon, { backgroundColor: colors.secondary + "90" }]}>
                  <Icon name="user" size={16} color={colors.primary} />
                </View>
                <View style={dlgS.rowText}>
                  <Text style={[dlgS.rowTitle, { color: colors.text }]}>Удалить у себя</Text>
                  <Text style={dlgS.rowSub}>Только вы не увидите</Text>
                </View>
                <Icon name="chevron-right" size={16} color={colors.primary} style={{ opacity: 0.4 }} />
              </TouchableOpacity>
              <TouchableOpacity style={dlgS.cancel} onPress={onClose} activeOpacity={0.8}>
                <Text style={dlgS.cancelText}>Отмена</Text>
              </TouchableOpacity>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// PinDialog
// ══════════════════════════════════════════════════════════════════════════════
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
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 90, friction: 10 }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]).start();
    } else {
      scaleAnim.setValue(0.88);
      fadeAnim.setValue(0);
    }
  }, [visible]);
  if (!visible) return null;
  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[dlgS.backdrop, { opacity: fadeAnim }]}>
          <TouchableWithoutFeedback>
            <Animated.View style={[dlgS.card, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
              <View style={[dlgS.iconWrap, { backgroundColor: colors.accent + "20" }]}>
                <Icon name="bookmark" size={30} color={colors.accent} />
              </View>
              <Text style={dlgS.title}>Закрепить сообщение?</Text>
              <TouchableOpacity
                style={[dlgS.rowPrimary, { backgroundColor: colors.accent + "15", borderColor: colors.accent + "40" }]}
                onPress={onPinAll} activeOpacity={0.82}
              >
                <View style={[dlgS.rowIcon, { backgroundColor: colors.accent }]}>
                  <Icon name="users" size={16} color="#fff" />
                </View>
                <View style={dlgS.rowText}>
                  <Text style={[dlgS.rowTitle, { color: colors.accent }]}>Закрепить у всех</Text>
                  <Text style={dlgS.rowSub}>Увидят оба участника</Text>
                </View>
                <Icon name="chevron-right" size={16} color={colors.accent} style={{ opacity: 0.7 }} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[dlgS.rowPrimary, { backgroundColor: colors.secondary + "28", borderColor: colors.primary + "12" }]}
                onPress={onPinSelf} activeOpacity={0.82}
              >
                <View style={[dlgS.rowIcon, { backgroundColor: colors.secondary + "90" }]}>
                  <Icon name="user" size={16} color={colors.primary} />
                </View>
                <View style={dlgS.rowText}>
                  <Text style={[dlgS.rowTitle, { color: colors.text }]}>Закрепить у себя</Text>
                  <Text style={dlgS.rowSub}>Только вы увидите закреп</Text>
                </View>
                <Icon name="chevron-right" size={16} color={colors.primary} style={{ opacity: 0.4 }} />
              </TouchableOpacity>
              <TouchableOpacity style={dlgS.cancel} onPress={onClose} activeOpacity={0.8}>
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
    flex: 1, backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center", alignItems: "center", paddingHorizontal: 26,
  },
  card: {
    backgroundColor: colors.background, borderRadius: 26, borderWidth: 1,
    borderColor: colors.primary + "1A", padding: 20, width: "100%", maxWidth: 340,
    alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4, shadowRadius: 28, elevation: 16,
  },
  iconWrap: { width: 68, height: 68, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  title: { fontSize: 17, fontWeight: "700", color: colors.text, marginBottom: 20, textAlign: "center" },
  rowPrimary: {
    flexDirection: "row", alignItems: "center", gap: 12, width: "100%",
    paddingVertical: 14, paddingHorizontal: 14, borderRadius: 16, marginBottom: 10, borderWidth: 1,
  },
  rowIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: "700" },
  rowSub: { fontSize: 11, color: colors.primary + "65", marginTop: 2 },
  cancel: {
    width: "100%", paddingVertical: 13, alignItems: "center",
    borderRadius: 14, backgroundColor: colors.secondary + "22",
    borderWidth: 1, borderColor: colors.primary + "0E",
  },
  cancelText: { fontSize: 14, fontWeight: "600", color: colors.primary + "A0" },
});

// ══════════════════════════════════════════════════════════════════════════════
// ForwardPicker
// ══════════════════════════════════════════════════════════════════════════════
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
        Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 75, friction: 12 }),
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY, { toValue: 400, duration: 220, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);
  if (!visible) return null;
  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[fpS.backdrop, { opacity: fade }]} />
      </TouchableWithoutFeedback>
      <Animated.View style={[fpS.sheet, { transform: [{ translateY: slideY }] }]}>
        <View style={fpS.handle} />
        <View style={fpS.header}>
          <Text style={fpS.title}>Переслать в чат</Text>
          <TouchableOpacity style={fpS.closeBtn} onPress={onClose}>
            <Icon name="x" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>
        {isLoading ? (
          <View style={fpS.center}><ActivityIndicator color={colors.accent} size="large" /></View>
        ) : !chats?.length ? (
          <View style={fpS.center}><Text style={fpS.emptyText}>Нет доступных чатов</Text></View>
        ) : (
          <FlatList
            data={chats} keyExtractor={(item) => String(item.id)}
            showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: Platform.OS === "ios" ? 36 : 16 }}
            renderItem={({ item }) => {
              const other = getOtherParticipant(item, myId);
              if (!other) return null;
              const initials = other.nickName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
              const preview = item.messages?.[0];
              return (
                <TouchableOpacity
                  style={fpS.row}
                  onPress={() => { onSelect(item.id); onClose(); }}
                  activeOpacity={0.72}
                >
                  {other.avatarUrl
                    ? <Image source={{ uri: other.avatarUrl }} style={fpS.avatar} />
                    : <View style={fpS.avatarPh}><Text style={fpS.avatarIn}>{initials}</Text></View>
                  }
                  <View style={fpS.info}>
                    <Text style={fpS.name} numberOfLines={1}>{other.nickName}</Text>
                    {preview && <Text style={fpS.preview} numberOfLines={1}>{preview.content ?? "📎 Медиа"}</Text>}
                  </View>
                  <View style={fpS.sendBtn}><Icon name="send" size={15} color="#fff" /></View>
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
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
    borderColor: colors.primary + "1E", maxHeight: "72%",
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.primary + "40", alignSelf: "center", marginTop: 10 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10,
  },
  title: { fontSize: 18, fontWeight: "700", color: colors.text },
  closeBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.secondary + "40", alignItems: "center", justifyContent: "center" },
  center: { paddingVertical: 48, alignItems: "center" },
  emptyText: { fontSize: 14, color: colors.primary + "60" },
  row: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 20,
    paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.primary + "0C",
  },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: colors.accent + "50" },
  avatarPh: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.secondary + "60",
    borderWidth: 2, borderColor: colors.accent + "30", alignItems: "center", justifyContent: "center",
  },
  avatarIn: { fontSize: 16, fontWeight: "700", color: colors.text },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: "700", color: colors.text },
  preview: { fontSize: 12, color: colors.primary + "60", marginTop: 2 },
  sendBtn: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
});

// ══════════════════════════════════════════════════════════════════════════════
// TapActionSheet
// ══════════════════════════════════════════════════════════════════════════════
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
  message, tapY, isOwn, isPinned, onClose, onReact,
  onReply, onEdit, onDeleteRequest, onForwardRequest,
  onPinRequest, onUnpinRequest, onCopy,
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.86)).current;
  const isVisible = !!message;
  useEffect(() => {
    if (isVisible) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 90, friction: 9 }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 130, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 110, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 0.86, duration: 110, useNativeDriver: true }),
      ]).start();
    }
  }, [isVisible]);
  if (!message) return null;
  const existing = Array.isArray(message.reactions) ? message.reactions : [];
  const actions = [
    { icon: "corner-up-left", label: "Ответить", color: colors.primary, onPress: () => { onReply(message); onClose(); } },
    { icon: "share-2", label: "Переслать", color: colors.primary, onPress: () => { onForwardRequest(message); onClose(); } },
    ...(message.type === "TEXT"
      ? [{ icon: "copy", label: "Копировать", color: colors.primary, onPress: () => { onCopy(message); onClose(); } }]
      : []),
    isPinned
      ? { icon: "bookmark", label: "Открепить", color: "#ffb86c", onPress: () => { onUnpinRequest(message); onClose(); } }
      : { icon: "bookmark", label: "Закрепить", color: colors.accent, onPress: () => { onPinRequest(message); onClose(); } },
    ...(isOwn && message.type === "TEXT"
      ? [{ icon: "edit-2", label: "Изменить", color: "#6ecfff", onPress: () => { onEdit(message); onClose(); } }]
      : []),
    { icon: "trash-2", label: "Удалить", color: "#ff6b6b", onPress: () => { onDeleteRequest(message); onClose(); } },
  ];
  const EMOJI_H = 58, PREVIEW_H = 68, ACTION_H = 44, PAD_V = 20;
  const estimatedH = EMOJI_H + PREVIEW_H + actions.length * ACTION_H + PAD_V;
  const MARGIN = 14;
  const TOP_SAFE = Platform.OS === "ios" ? 60 : 40;
  const BOT_SAFE = Platform.OS === "ios" ? 44 : 16;
  const bottomThreshold = SCREEN_H * 0.6;
  let top = tapY > bottomThreshold ? tapY - estimatedH - 16 : tapY - estimatedH / 2;
  top = Math.max(TOP_SAFE + MARGIN, top);
  top = Math.min(SCREEN_H - estimatedH - BOT_SAFE - MARGIN, top);
  return (
    <Modal transparent animationType="none" visible={isVisible} onRequestClose={onClose} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[tasS.dimmer, { opacity: fadeAnim }]} />
      </TouchableWithoutFeedback>
      <Animated.View
        style={[tasS.sheet, isOwn ? { right: MARGIN } : { left: MARGIN }, { top, opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}
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
          <Text style={tasS.previewSender}>{message.sender?.nickName ?? ""}</Text>
          <Text style={tasS.previewText} numberOfLines={2}>
            {message.type !== "TEXT"
              ? ({ IMAGE: "🖼 Фото", VIDEO: "🎥 Видео", FILE: "📎 Файл", AUDIO: "🎵 Аудио", VOICE: "🎤 Голосовое", MUSIC: "🎵 Музыка" } as Record<string, string>)[message.type] ?? "📎"
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
            <View style={[tasS.actionIcon, { backgroundColor: a.color + "1A" }]}>
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
  dimmer: { position: "absolute", top: -100, left: 0, right: 0, bottom: -100, backgroundColor: "rgba(0,0,0,0.72)" },
  sheet: {
    position: "absolute", width: SHEET_W, backgroundColor: colors.background,
    borderRadius: 20, borderWidth: 1, borderColor: colors.primary + "22",
    paddingVertical: 10, paddingHorizontal: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.38, shadowRadius: 26, elevation: 14,
  },
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

// ══════════════════════════════════════════════════════════════════════════════
// ComposeBanner (reply / edit)
// ══════════════════════════════════════════════════════════════════════════════
const ComposeBanner: React.FC<{
  mode: "reply" | "edit";
  message: Message;
  onCancel: () => void;
}> = ({ mode, message, onCancel }) => (
  <View style={cbS.wrap}>
    <View style={cbS.accent} />
    <View style={cbS.content}>
      <Text style={cbS.label}>
        {mode === "reply" ? `↩ Ответить ${message.sender?.nickName}` : "✏️ Редактировать"}
      </Text>
      <Text style={cbS.text} numberOfLines={1}>
        {message.type !== "TEXT"
          ? ({ IMAGE: "🖼 Фото", VIDEO: "🎥 Видео", FILE: "📎 Файл", AUDIO: "🎵 Аудио", VOICE: "🎤 Голосовое", MUSIC: "🎵 Музыка" } as Record<string, string>)[message.type] ?? "📎"
          : message.content ?? ""}
      </Text>
    </View>
    <TouchableOpacity style={cbS.close} onPress={onCancel} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
      <Icon name="x" size={16} color={colors.primary + "80"} />
    </TouchableOpacity>
  </View>
);
const cbS = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.secondary + "20",
    borderTopWidth: 1, borderTopColor: colors.primary + "15",
    paddingHorizontal: 16, paddingVertical: 8, gap: 10,
  },
  accent: { width: 3, height: 34, borderRadius: 2, backgroundColor: colors.accent },
  content: { flex: 1 },
  label: { fontSize: 11, fontWeight: "700", color: colors.accent, marginBottom: 2 },
  text: { fontSize: 13, color: colors.primary, lineHeight: 17 },
  close: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.secondary + "40", alignItems: "center", justifyContent: "center" },
});

// ══════════════════════════════════════════════════════════════════════════════
// ForwardedBubble
// ══════════════════════════════════════════════════════════════════════════════
const ForwardedBubble: React.FC<{ message: Message; isOwn: boolean }> = ({ message, isOwn }) => {
  const fw = message.forwardedFrom;
  if (!fw) return null;
  return (
    <View style={[fwS.wrap, isOwn && fwS.wrapOwn]}>
      <View style={fwS.accent} />
      <View style={fwS.content}>
        <Text style={fwS.sender}>{fw.sender?.nickName}</Text>
        <Text style={fwS.text} numberOfLines={2}>
          {fw.type !== "TEXT"
            ? ({ IMAGE: "🖼 Фото", VIDEO: "🎥 Видео", FILE: "📎 Файл", AUDIO: "🎵 Аудио", VOICE: "🎤 Голосовое", MUSIC: "🎵 Музыка" } as Record<string, string>)[fw.type] ?? "📎"
            : fw.content ?? ""}
        </Text>
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

// ══════════════════════════════════════════════════════════════════════════════
// GlobalAudioManager — только один плеер играет одновременно
// ══════════════════════════════════════════════════════════════════════════════
type StopFn = () => void;
let _currentAudioStop: StopFn | null = null;

const GlobalAudio = {
  register(stopFn: StopFn): () => void {
    // Останавливаем предыдущий
    if (_currentAudioStop && _currentAudioStop !== stopFn) {
      _currentAudioStop();
    }
    _currentAudioStop = stopFn;
    // Возвращаем функцию дерегистрации
    return () => {
      if (_currentAudioStop === stopFn) _currentAudioStop = null;
    };
  },
  stopCurrent() {
    if (_currentAudioStop) { _currentAudioStop(); _currentAudioStop = null; }
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
const MAX_MEDIA_W = Math.min(SCREEN_W * 0.72, 280);
const MAX_MEDIA_H = SCREEN_H * 0.5;

const ImageMessage: React.FC<{ url: string }> = React.memo(({ url }) => {
  const [fullscreen, setFullscreen] = useState(false);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    Image.getSize(
      url,
      (w, h) => {
        const ratio = w / h;
        let width = MAX_MEDIA_W;
        let height = width / ratio;
        if (height > MAX_MEDIA_H) { height = MAX_MEDIA_H; width = height * ratio; }
        setSize({ width: Math.round(width), height: Math.round(height) });
      },
      () => setSize({ width: MAX_MEDIA_W, height: MAX_MEDIA_W * 0.75 }),
    );
  }, [url]);

  const imgStyle = size
    ? { width: size.width, height: size.height, borderRadius: 12 }
    : { width: MAX_MEDIA_W, height: MAX_MEDIA_W * 0.75, borderRadius: 12 };

  return (
    <>
      <TouchableOpacity onPress={() => setFullscreen(true)} activeOpacity={0.92}>
        {size
          ? <Image source={{ uri: url }} style={imgStyle} resizeMode="cover" />
          : <View style={[imgStyle, { backgroundColor: colors.secondary + "40", alignItems: "center", justifyContent: "center" }]}>
              <ActivityIndicator color={colors.accent} />
            </View>}
      </TouchableOpacity>
      <Modal visible={fullscreen} transparent animationType="fade" onRequestClose={() => setFullscreen(false)} statusBarTranslucent>
        <View style={imS.backdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setFullscreen(false)} />
          <Image source={{ uri: url }} style={imS.fullImg} resizeMode="contain" />
          <TouchableOpacity style={imS.closeBtn} onPress={() => setFullscreen(false)}>
            <Icon name="x" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
});
const imS = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.96)", justifyContent: "center", alignItems: "center" },
  fullImg: { width: SCREEN_W, height: SCREEN_H * 0.85 },
  closeBtn: {
    position: "absolute", top: Platform.OS === "ios" ? 56 : 36, right: 20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center",
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// DoubleTapZone — прозрачная зона с обработкой двойного тапа
// ══════════════════════════════════════════════════════════════════════════════
const DoubleTapZone: React.FC<{
  style: any;
  onSingleTap: () => void;
  onDoubleTap: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
}> = ({ style, onSingleTap, onDoubleTap, onPressIn, onPressOut }) => {
  const lastTap = useRef<number>(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePress = useCallback(() => {
    const now = Date.now();
    const delta = now - lastTap.current;
    lastTap.current = now;
    if (delta < 300) {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
      onDoubleTap();
    } else {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
      singleTapTimer.current = setTimeout(() => { onSingleTap(); }, 250);
    }
  }, [onSingleTap, onDoubleTap]);

  return (
    <Pressable
      style={style}
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
    />
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// VideoMessage — встроенный плеер + полноэкранный с прогрессом, ±10с, 2x
// ══════════════════════════════════════════════════════════════════════════════
const VideoMessage: React.FC<{ url: string; isOwn: boolean; inView?: boolean }> = React.memo(({ url, isOwn, inView = true }) => {
  const [muted, setMuted]             = useState(true);
  const [fullscreen, setFullscreen]   = useState(false);
  const [fsPaused, setFsPaused]       = useState(false);
  const [size, setSize]               = useState<{ width: number; height: number }>({ width: MAX_MEDIA_W, height: MAX_MEDIA_W * 0.56 });
  const [vidDuration, setVidDuration] = useState(0);
  const [vidTime, setVidTime]         = useState(0);
  const [fsRate, setFsRate]           = useState(1);           // 1 или 2 (2x при зажатии)
  const [showControls, setShowControls] = useState(true);      // показывать ли оверлей в ФС
  const [isSeeking, setIsSeeking]     = useState(false);

  const deregVideoRef  = useRef<(() => void) | null>(null);
  const videoRef       = useRef<any>(null);
  const fsVideoRef     = useRef<any>(null);
  const prevInView     = useRef(inView);
  const syncTimeRef    = useRef(0);
  const fsTrackW       = useRef(1);
  const controlsTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const gp = useGlobalPlayer();

  const fmtSec = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;

  // Авто-скрытие контролов через 3с
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    if (fullscreen) resetControlsTimer();
    return () => { if (controlsTimer.current) clearTimeout(controlsTimer.current); };
  }, [fullscreen]);

  const onVideoLoad = useCallback((data: any) => {
    const w = data.naturalSize?.width  ?? MAX_MEDIA_W;
    const h = data.naturalSize?.height ?? MAX_MEDIA_W * 0.56;
    const ratio = w / h;
    let width = MAX_MEDIA_W;
    let height = width / ratio;
    if (height > MAX_MEDIA_H) { height = MAX_MEDIA_H; width = height * ratio; }
    setSize({ width: Math.round(width), height: Math.round(height) });
    setVidDuration(data.duration ?? 0);
  }, []);

  const onFsLoad = useCallback(() => {
    if (syncTimeRef.current > 0) fsVideoRef.current?.seek(syncTimeRef.current);
  }, []);

  useEffect(() => {
    if (inView && !prevInView.current) { videoRef.current?.seek(0); setVidTime(0); }
    prevInView.current = inView;
  }, [inView]);

  useEffect(() => {
    if (gp.playing && !muted) { setMuted(true); deregVideoRef.current?.(); deregVideoRef.current = null; }
  }, [gp.playing]);

  const handleToggleMute = useCallback((e: any) => {
    e.stopPropagation?.();
    if (!muted) {
      setMuted(true); deregVideoRef.current?.(); deregVideoRef.current = null;
    } else if (!gp.playing) {
      setMuted(false);
      deregVideoRef.current?.();
      deregVideoRef.current = GlobalAudio.register(() => setMuted(true));
    }
  }, [muted, gp.playing]);

  const handlePress = useCallback(() => {
    syncTimeRef.current = vidTime;
    gp.pauseForVideo();
    setFullscreen(true);
  }, [gp, vidTime]);

  const handleCloseFullscreen = useCallback(() => {
    setFullscreen(false);
    setFsRate(1);
    setFsPaused(false);
    setTimeout(() => { videoRef.current?.seek(syncTimeRef.current); }, 80);
    gp.resumeAfterVideo();
  }, [gp]);

  const onProgress = useCallback((d: any) => {
    const t = d.currentTime ?? 0;
    setVidTime(t);
    syncTimeRef.current = t;
  }, []);

  // Scrub в fullscreen через PanResponder на прогресс-баре
  const fsScrubPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  (_, gs) => Math.abs(gs.dx) > 2,
      onPanResponderGrant: (e) => {
        setIsSeeking(true);
        resetControlsTimer();
        const dur = vidDuration;
        if (dur <= 0) return;
        const r = Math.max(0, Math.min(1, e.nativeEvent.locationX / Math.max(fsTrackW.current, 1)));
        const t = r * dur;
        syncTimeRef.current = t;
        setVidTime(t);
        fsVideoRef.current?.seek(t);
      },
      onPanResponderMove: (e) => {
        const dur = vidDuration;
        if (dur <= 0) return;
        const r = Math.max(0, Math.min(1, e.nativeEvent.locationX / Math.max(fsTrackW.current, 1)));
        const t = r * dur;
        syncTimeRef.current = t;
        setVidTime(t);
        fsVideoRef.current?.seek(t);
      },
      onPanResponderRelease:   () => setIsSeeking(false),
      onPanResponderTerminate: () => setIsSeeking(false),
    })
  ).current;

  // ±10 секунд
  const seekBy = useCallback((delta: number) => {
    const newT = Math.max(0, Math.min(vidDuration, syncTimeRef.current + delta));
    syncTimeRef.current = newT;
    setVidTime(newT);
    fsVideoRef.current?.seek(newT);
    resetControlsTimer();
  }, [vidDuration, resetControlsTimer]);

  // Зажатие → 2x, отпускание → 1x
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleFsLongPress = useCallback(() => {
    setFsRate(2);
  }, []);
  const handleFsPressIn = useCallback(() => {
    holdTimer.current = setTimeout(handleFsLongPress, 400);
    resetControlsTimer();
  }, [handleFsLongPress, resetControlsTimer]);
  const handleFsPressOut = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    setFsRate(1);
  }, []);

  useEffect(() => () => { deregVideoRef.current?.(); }, []);

  const progress = vidDuration > 0 ? vidTime / vidDuration : 0;

  if (!VideoPlayer) {
    return (
      <TouchableOpacity
        style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4, paddingVertical: 4 }}
        onPress={() => Linking.openURL(url)}
      >
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" }}>
          <Icon name="play" size={16} color="#fff" />
        </View>
        <Text style={{ fontSize: 14, color: isOwn ? colors.text : colors.primary, fontWeight: "500", flexShrink: 1 }}>Видео</Text>
      </TouchableOpacity>
    );
  }

  return (
    <>
      <View style={[vmS.container, { width: size.width, height: size.height }]}>
        <VideoPlayer
          ref={videoRef}
          source={{ uri: url }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          paused={!inView || fullscreen}
          muted={muted}
          repeat
          controls={false}
          onLoad={onVideoLoad}
          onProgress={onProgress}
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={handlePress} />
        <View style={vmS.timerBadge} pointerEvents="none">
          <Text style={vmS.timerText}>
            {vidDuration > 0 ? `${fmtSec(vidTime)} / ${fmtSec(vidDuration)}` : fmtSec(vidTime)}
          </Text>
        </View>
        <TouchableOpacity style={vmS.muteBtn} onPress={handleToggleMute} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name={muted ? "volume-x" : "volume-2"} size={14} color={gp.playing ? "rgba(255,255,255,0.35)" : "#fff"} />
        </TouchableOpacity>
      </View>

      {/* ── Fullscreen Modal ── */}
      <Modal visible={fullscreen} transparent={false} animationType="fade" onRequestClose={handleCloseFullscreen} statusBarTranslucent supportedOrientations={["portrait", "landscape"]}>
        <View style={vmS.fsBackdrop}>
          <VideoPlayer
            ref={fsVideoRef}
            source={{ uri: url }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
            paused={fsPaused}
            muted={false}
            controls={false}
            repeat
            rate={fsRate}
            onLoad={onFsLoad}
            onProgress={onProgress}
          />

          {/* Левая зона: двойной тап → −10с */}
          <DoubleTapZone
            style={vmS.fsTapLeft}
            onSingleTap={resetControlsTimer}
            onDoubleTap={() => seekBy(-10)}
            onPressIn={handleFsPressIn}
            onPressOut={handleFsPressOut}
          />

          {/* Правая зона: двойной тап → +10с */}
          <DoubleTapZone
            style={vmS.fsTapRight}
            onSingleTap={resetControlsTimer}
            onDoubleTap={() => seekBy(10)}
            onPressIn={handleFsPressIn}
            onPressOut={handleFsPressOut}
          />

          {/* 2x badge — снизу по центру, прозрачный */}
          {fsRate === 2 && (
            <View style={vmS.speedBadge} pointerEvents="none">
              <Text style={vmS.speedText}>2×</Text>
            </View>
          )}

          {/* Контролы — скрываются через 3с */}
          {showControls && (
            <View style={vmS.fsControls} pointerEvents="box-none">
              {/* Верхняя панель: закрыть */}
              <View style={vmS.fsTopBar}>
                <TouchableOpacity style={vmS.fsCloseBtn} onPress={handleCloseFullscreen}>
                  <Icon name="x" size={22} color="#fff" />
                </TouchableOpacity>
              </View>

              {/* Центр: кнопка play/pause */}
              <View style={vmS.fsCenterRow} pointerEvents="box-none">
                <TouchableOpacity
                  style={vmS.fsPlayBtn}
                  onPress={() => { setFsPaused((p) => !p); resetControlsTimer(); }}
                  activeOpacity={0.75}
                >
                  <Icon name={fsPaused ? "play" : "pause"} size={26} color="#fff" style={fsPaused ? { marginLeft: 3 } : {}} />
                </TouchableOpacity>
              </View>

              {/* Нижняя панель: время + прогресс-бар */}
              <View style={vmS.fsBottomBar}>
                <Text style={vmS.fsTime}>{fmtSec(vidTime)}</Text>
                <View
                  style={vmS.fsTrack}
                  onLayout={(e) => { fsTrackW.current = e.nativeEvent.layout.width; }}
                  {...fsScrubPan.panHandlers}
                >
                  <View style={vmS.fsTrackBg}>
                    <View style={[vmS.fsTrackFill, { width: `${progress * 100}%` as any }]} />
                  </View>
                  <View style={[vmS.fsThumb, { left: `${progress * 100}%` as any }]} />
                </View>
                <Text style={vmS.fsTime}>{fmtSec(vidDuration)}</Text>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
});
const vmS = StyleSheet.create({
  container:    { position: "relative", borderRadius: 12, overflow: "hidden", marginBottom: 4 },
  muteBtn:      { position: "absolute", top: 8, left: 8, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 8, padding: 5 },
  timerBadge:   { position: "absolute", bottom: 8, left: 8, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  timerText:    { color: "#fff", fontSize: 11, fontVariant: ["tabular-nums"] as any },
  fsBackdrop:   { flex: 1, backgroundColor: "#000" },
  // Зоны двойного тапа — левая и правая половина экрана
  fsTapLeft: {
    position: "absolute", top: 0, bottom: 0, left: 0, width: "50%",
  },
  fsTapRight: {
    position: "absolute", top: 0, bottom: 0, right: 0, width: "50%",
  },
  // 2× badge — снизу по центру, прозрачный
  speedBadge: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 80 : 60,
    alignSelf: "center",
    left: "50%",
    transform: [{ translateX: -22 }],
    backgroundColor: "rgba(0,0,0,0.40)",
    borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  speedText: { color: "rgba(255,255,255,0.75)", fontSize: 18, fontWeight: "700" },
  // Fullscreen controls overlay
  fsControls: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
  },
  fsTopBar: {
    flexDirection: "row", justifyContent: "flex-end",
    paddingTop: Platform.OS === "ios" ? 56 : 36,
    paddingHorizontal: 20,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  fsCloseBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center",
  },
  // Центр — кнопка play/pause
  fsCenterRow: {
    flex: 1, alignItems: "center", justifyContent: "center",
    pointerEvents: "box-none" as any,
  },
  fsPlayBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.25)",
  },
  // Нижняя панель с прогресс-баром
  fsBottomBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 44 : 24,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  fsTime: { fontSize: 12, color: "#fff", fontVariant: ["tabular-nums"] as any, minWidth: 38 },
  fsTrack: {
    flex: 1, paddingVertical: 10, position: "relative", justifyContent: "center",
  },
  fsTrackBg: {
    height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)", overflow: "hidden",
  },
  fsTrackFill: {
    position: "absolute", top: 0, bottom: 0, left: 0,
    backgroundColor: "#fff", borderRadius: 2,
  },
  fsThumb: {
    position: "absolute", width: 14, height: 14, borderRadius: 7,
    backgroundColor: "#fff", top: 10 - 5, marginLeft: -7,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4, shadowRadius: 2, elevation: 3,
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// FileMessage — размер + скачивание через fetch (без react-native-fs)
// ══════════════════════════════════════════════════════════════════════════════

// Иконка и цвет по расширению файла
function getFileIconInfo(ext: string): { icon: string; color: string } {
  const e = ext.toLowerCase();
  if (["pdf"].includes(e))                          return { icon: "file-text", color: "#ff6b6b" };
  if (["doc", "docx"].includes(e))                  return { icon: "file-text", color: "#4a9eff" };
  if (["xls", "xlsx", "csv"].includes(e))           return { icon: "grid",      color: "#4caf7d" };
  if (["ppt", "pptx"].includes(e))                  return { icon: "monitor",   color: "#ff9800" };
  if (["zip", "rar", "7z", "tar", "gz"].includes(e)) return { icon: "archive",  color: "#ffcc02" };
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(e)) return { icon: "image", color: "#a78bfa" };
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(e)) return { icon: "film",  color: "#fb923c" };
  if (["txt", "md", "json", "xml", "html"].includes(e)) return { icon: "file",  color: "#94a3b8" };
  return { icon: "paperclip", color: "#d0aeff" };
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

const FileMessage: React.FC<{ url: string; name: string; isOwn: boolean; fileSize?: number }> = ({ url, name, isOwn, fileSize }) => {
  const [fetchedSize, setFetchedSize] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Если размер не передан с сервера — пробуем HEAD запрос
  useEffect(() => {
    if (fileSize && fileSize > 0) return; // уже есть размер
    fetch(url, { method: "HEAD" })
      .then((r) => {
        const len = r.headers.get("content-length");
        if (!len) return;
        const b = parseInt(len, 10);
        setFetchedSize(formatBytes(b));
      })
      .catch(() => {});
  }, [url, fileSize]);

  const displaySize = fileSize && fileSize > 0 ? formatBytes(fileSize) : fetchedSize;
  const ext = name.split(".").pop()?.toUpperCase() ?? "FILE";
  const { icon, color } = getFileIconInfo(ext.toLowerCase());

  const handlePress = async () => {
    if (downloading) return;
    if (FileViewer) {
      setDownloading(true);
      try {
        await FileViewer.open(url, { showOpenWithDialog: true });
      } catch {
        Linking.openURL(url);
      } finally {
        setDownloading(false);
      }
    } else {
      Linking.openURL(url);
    }
  };

  return (
    <TouchableOpacity style={fmS.row} onPress={handlePress} activeOpacity={0.8}>
      <View style={[fmS.iconWrap, { backgroundColor: color + "22" }]}>
        {downloading
          ? <ActivityIndicator size="small" color={color} />
          : <Icon name={icon as any} size={20} color={color} />}
      </View>
      <View style={fmS.info}>
        <Text style={[fmS.name, isOwn && fmS.nameOwn]} numberOfLines={2}>{name}</Text>
        <View style={fmS.meta}>
          <View style={[fmS.extBadge, { backgroundColor: color + "30" }]}>
            <Text style={[fmS.ext, { color }]}>{ext}</Text>
          </View>
          {displaySize ? <Text style={[fmS.size, isOwn && fmS.sizeOwn]}>{displaySize}</Text> : null}
        </View>
      </View>
      <Icon name="download" size={16} color={isOwn ? colors.text + "99" : colors.primary + "60"} />
    </TouchableOpacity>
  );
};
const fmS = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4, paddingVertical: 6, minWidth: 200, maxWidth: 260 },
  iconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  info: { flex: 1 },
  name: { fontSize: 13, fontWeight: "600", color: colors.primary, lineHeight: 17 },
  nameOwn: { color: colors.text },
  meta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  extBadge: { borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  ext: { fontSize: 10, fontWeight: "700" },
  extOwn: { color: colors.text + "80" },
  size: { fontSize: 11, color: colors.primary + "60" },
  sizeOwn: { color: colors.text + "80" },
});

// ══════════════════════════════════════════════════════════════════════════════
// usePrefetchDuration — незаметно грузит длительность в durationCache
// через нулевой VideoPlayer (paused + muted + audioOnly)
// ══════════════════════════════════════════════════════════════════════════════
const DurationPrefetcher: React.FC<{ url: string; onReady: (dur: number) => void }> = React.memo(({ url, onReady }) => {
  const gp = useGlobalPlayer();
  const [done, setDone] = useState(false);

  const handleLoad = useCallback((data: any) => {
    const dur = data.duration ?? 0;
    if (dur > 0) {
      gp.durationCache.current[url] = dur;
      onReady(dur);
      setDone(true);
    }
  }, [url, gp.durationCache, onReady]);

  // Уже в кеше или загружено — ничего не рендерим
  if (!VideoPlayer || done || gp.durationCache.current[url]) return null;

  return (
    <VideoPlayer
      source={{ uri: url }}
      style={{ width: 0, height: 0, position: "absolute" }}
      paused
      muted
      audioOnly
      playInBackground={false}
      onLoad={handleLoad}
    />
  );
});


// Сам VideoPlayer-нод живёт в провайдере и не умирает при навигации.
// ══════════════════════════════════════════════════════════════════════════════
function useVideoAudioPlayer(
  url: string,
  meta?: { type?: GlobalPlayerType; title?: string | null; artist?: string | null; coverUrl?: string | null }
) {
  const gp = useGlobalPlayer();
  const active = gp.isActive(url);

  const playing     = active && gp.playing;
  const currentTime = active ? gp.currentTime : 0;
  // Когда трек активен — берём реальную длину, иначе смотрим в кеш
  const duration    = active ? gp.duration : (gp.durationCache.current[url] ?? 0);
  const loading     = active && gp.loading;
  const progressAnim = gp.progressAnim; // используем напрямую только когда active

  // Локальный Animated.Value для неактивного состояния (заморожен на 0)
  const idleAnim = useRef(new Animated.Value(0)).current;
  const effectiveProgressAnim = active ? progressAnim : idleAnim;

  const handlePlayPause = useCallback(() => {
    if (active && gp.playing) {
      gp.pause();
    } else if (active && !gp.playing) {
      gp.resume();
    } else {
      // Запускаем новый трек через глобальный контекст
      gp.play({
        url,
        type: meta?.type ?? "AUDIO",
        title: meta?.title ?? null,
        artist: meta?.artist ?? null,
        coverUrl: meta?.coverUrl ?? null,
      });
    }
  }, [active, gp, url, meta]);

  const seek = useCallback((ratio: number) => {
    if (!active) return;
    gp.seek(ratio);
  }, [active, gp]);

  const fmtSec = useCallback((s: number) =>
    `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`, []);

  // audioNode больше не нужен — нод живёт в GlobalPlayerProvider
  const audioNode = null;

  return {
    playing,
    currentTime,
    duration,
    loading,
    handlePlayPause,
    seek,
    fmtSec,
    audioNode,
    progressAnim: effectiveProgressAnim,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// AudioMessage — VOICE: волна + таймер через react-native-video
// ══════════════════════════════════════════════════════════════════════════════
const WAVEFORM_BARS = 30;

const AudioMessage: React.FC<{ url: string; isOwn: boolean }> = React.memo(({ url, isOwn }) => {
  const { playing, currentTime, duration, loading, handlePlayPause, fmtSec, audioNode, progressAnim } = useVideoAudioPlayer(url, { type: "VOICE", title: "Голосовое сообщение" });
  const gp = useGlobalPlayer();

  const [cachedDur, setCachedDur] = useState(() => gp.durationCache.current[url] ?? 0);
  // Обновляем когда трек стал активным и загрузился
  useEffect(() => { if (duration > 0) setCachedDur(duration); }, [duration]);
  const handlePrefetchReady = useCallback((dur: number) => setCachedDur(dur), []);

  const effectiveDuration = duration > 0 ? duration : cachedDur;

  const bars = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < url.length; i++) hash = (hash * 31 + url.charCodeAt(i)) & 0xffff;
    return Array.from({ length: WAVEFORM_BARS }, (_, i) => {
      const seed = Math.sin(hash + i * 7.3) * 10000;
      return 0.2 + Math.abs(seed - Math.floor(seed)) * 0.8;
    });
  }, [url]);

  // Подписываемся на Animated.Value чтобы обновлять только счётчик баров без лишних рендеров компонента
  const [playedCount, setPlayedCount] = useState(0);
  useEffect(() => {
    const id = progressAnim.addListener(({ value }) => {
      setPlayedCount(Math.floor(value * WAVEFORM_BARS));
    });
    return () => progressAnim.removeListener(id);
  }, [progressAnim]);

  return (
    <View style={amS.row}>
      {audioNode}
      <DurationPrefetcher url={url} onReady={handlePrefetchReady} />
      <TouchableOpacity style={amS.playBtn} onPress={handlePlayPause} activeOpacity={0.8} disabled={loading}>
        {loading
          ? <ActivityIndicator size="small" color="#fff" />
          : <Icon name={playing ? "pause" : "play"} size={16} color="#fff" style={playing ? {} : { marginLeft: 2 }} />}
      </TouchableOpacity>
      <View style={amS.waveWrap}>
        <View style={amS.wave}>
          {bars.map((h, i) => (
            <View
              key={i}
              style={[
                amS.bar,
                { height: 6 + h * 22 },
                i < playedCount
                  ? (isOwn ? amS.barPlayedOwn : amS.barPlayed)
                  : (isOwn ? amS.barIdleOwn   : amS.barIdle),
              ]}
            />
          ))}
        </View>
        <Text style={[amS.timer, isOwn && amS.timerOwn]}>
          {playing || currentTime > 0
            ? `${fmtSec(currentTime)} / ${effectiveDuration > 0 ? fmtSec(effectiveDuration) : "–:––"}`
            : `0:00 / ${effectiveDuration > 0 ? fmtSec(effectiveDuration) : "–:––"}`}
        </Text>
      </View>
    </View>
  );
});
const amS = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, minWidth: 210 },
  playBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accent,
    alignItems: "center", justifyContent: "center",
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 4,
  },
  waveWrap: { flex: 1, gap: 5 },
  wave: { flexDirection: "row", alignItems: "center", gap: 2, height: 30 },
  bar: { width: 3, borderRadius: 2 },
  barIdle:      { backgroundColor: colors.primary + "35" },
  barIdleOwn:   { backgroundColor: colors.text + "45" },
  barPlayed:    { backgroundColor: colors.accent },
  barPlayedOwn: { backgroundColor: colors.text + "CC" },
  timer: { fontSize: 11, color: colors.primary + "60", fontVariant: ["tabular-nums"] },
  timerOwn: { color: colors.text + "90" },
});

// ══════════════════════════════════════════════════════════════════════════════
// MusicMessage — обложка + название + автор → прогресс-бар
// ══════════════════════════════════════════════════════════════════════════════
const MusicMessage: React.FC<{
  url: string;
  title: string | null;
  artist: string | null;
  coverUrl: string | null;
  isOwn: boolean;
}> = React.memo(({ url, title, artist, coverUrl, isOwn }) => {
  const { playing, currentTime, duration, loading, handlePlayPause, seek, fmtSec, audioNode, progressAnim } = useVideoAudioPlayer(url, { type: "MUSIC", title, artist, coverUrl });
  const gp = useGlobalPlayer();

  // Длительность из кеша пока трек неактивен
  const [cachedDur, setCachedDur] = useState(() => gp.durationCache.current[url] ?? 0);
  // Обновляем когда трек стал активным и загрузился
  useEffect(() => { if (duration > 0) setCachedDur(duration); }, [duration]);
  const handlePrefetchReady = useCallback((dur: number) => setCachedDur(dur), []);

  const effectiveDuration = duration > 0 ? duration : cachedDur;

  const subColor     = isOwn ? colors.text + "AA" : colors.primary + "80";
  const thumbColor   = isOwn ? colors.text        : colors.accent;
  const trackFill    = isOwn ? colors.text + "EE"  : colors.accent;
  const trackBgColor = isOwn ? "rgba(255,255,255,0.2)" : colors.primary + "20";

  const [coverError, setCoverError] = useState(false);

  // Для scrub используем отдельный Animated.Value чтобы не конфликтовать с progressAnim из хука
  const scrubAnim     = useRef(new Animated.Value(0)).current;
  const isScrubbing   = useRef(false);
  const trackWidthRef = useRef(1);
  const seekRef       = useRef(seek);
  useEffect(() => { seekRef.current = seek; }, [seek]);

  // Пока не скраббим — зеркалим progressAnim в scrubAnim
  useEffect(() => {
    const id = progressAnim.addListener(({ value }) => {
      if (!isScrubbing.current) {
        scrubAnim.setValue(value);
      }
    });
    return () => progressAnim.removeListener(id);
  }, [progressAnim, scrubAnim]);

  const scrubPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 2,
      onMoveShouldSetPanResponderCapture: (_, gs) => Math.abs(gs.dx) > 4,
      onPanResponderGrant: (e) => {
        isScrubbing.current = true;
        const r = Math.max(0, Math.min(1, e.nativeEvent.locationX / Math.max(trackWidthRef.current, 1)));
        scrubAnim.setValue(r);
        seekRef.current(r);
      },
      onPanResponderMove: (e) => {
        const r = Math.max(0, Math.min(1, e.nativeEvent.locationX / Math.max(trackWidthRef.current, 1)));
        scrubAnim.setValue(r);
        seekRef.current(r);
      },
      onPanResponderRelease:   () => { isScrubbing.current = false; },
      onPanResponderTerminate: () => { isScrubbing.current = false; },
    })
  ).current;

  // Animated ширина заливки (0%..100%)
  const fillWidth = scrubAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  // Animated позиция большого пальца
  const thumbLeft = scrubAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  return (
    <View style={muS.card}>
      {audioNode}
      <DurationPrefetcher url={url} onReady={handlePrefetchReady} />
      <View style={muS.top}>
        <View style={muS.coverWrap}>
          {coverUrl && !coverError
            ? <Image
                source={{ uri: coverUrl }}
                style={muS.cover}
                resizeMode="cover"
                onError={() => setCoverError(true)}
              />
            : <View style={muS.coverPh}><Icon name="music" size={22} color={colors.accent + "AA"} /></View>}
          <TouchableOpacity style={muS.playOverlay} onPress={handlePlayPause} activeOpacity={0.85} disabled={loading}>
            <View style={muS.playCircle}>
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Icon name={playing ? "pause" : "play"} size={16} color="#fff" style={playing ? {} : { marginLeft: 2 }} />}
            </View>
          </TouchableOpacity>
        </View>

        <View style={muS.info}>
          <Text style={[muS.title, { color: colors.text }]} numberOfLines={2}>
            {title ?? "Аудио"}
          </Text>
          {!playing && !!artist && (
            <Text style={[muS.artist, { color: subColor }]} numberOfLines={1}>{artist}</Text>
          )}
          <Text style={[muS.timer, { color: subColor }]}>
            {loading
              ? "–:–– / –:––"
              : `${fmtSec(currentTime)} / ${effectiveDuration > 0 ? fmtSec(effectiveDuration) : "–:––"}`}
          </Text>
        </View>
      </View>

      {/* Scrubbar — плавный через Animated, захватывает жест до FlatList */}
      <View
        style={muS.trackContainer}
        onLayout={(e) => { trackWidthRef.current = e.nativeEvent.layout.width; }}
        {...scrubPan.panHandlers}
      >
        <View style={[muS.trackBg, { backgroundColor: trackBgColor }]}>
          <Animated.View style={[muS.trackFill, { width: fillWidth as any, backgroundColor: trackFill }]} />
        </View>
        <Animated.View style={[muS.thumb, { left: thumbLeft as any, backgroundColor: thumbColor }]} />
      </View>
    </View>
  );
});
const muS = StyleSheet.create({
  card: { width: 240, gap: 8 },
  top: { flexDirection: "row", gap: 12, alignItems: "center" },
  coverWrap: { position: "relative", width: 56, height: 56 },
  cover: { width: 56, height: 56, borderRadius: 10 },
  coverPh: {
    width: 56, height: 56, borderRadius: 10,
    backgroundColor: colors.secondary + "50",
    alignItems: "center", justifyContent: "center",
  },
  playOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  playCircle: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.52)",
    alignItems: "center", justifyContent: "center",
  },
  info: { flex: 1, gap: 3, justifyContent: "center" },
  title:  { fontSize: 13, fontWeight: "700", lineHeight: 17 },
  artist: { fontSize: 12, fontWeight: "400" },
  timer:  { fontSize: 11, fontVariant: ["tabular-nums"] },
  // Контейнер scrubbar — увеличенная hit-area
  trackContainer: { paddingVertical: 8, marginHorizontal: 2, position: "relative", justifyContent: "center" },
  trackBg:   { height: 6, borderRadius: 3, overflow: "hidden" },
  trackFill: { position: "absolute", top: 0, bottom: 0, left: 0, borderRadius: 3 },
  thumb: {
    position: "absolute", width: 14, height: 14, borderRadius: 7,
    top: 8 - 4,          // центр trackContainer (paddingVertical=8, trackHeight=6, thumb=14 → 8-4=4 от top контейнера)
    marginLeft: -7,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3, shadowRadius: 2, elevation: 3,
  },
});




interface BubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  isSelected: boolean;
  isSelectMode: boolean;
  isHighlighted: boolean;
  inView: boolean;
  onTap: (msg: Message, pageY: number) => void;
  onLongPress: (msg: Message) => void;
  onReact: (messageId: number, emoji: string) => void;
  onLayout?: (id: number, y: number, height: number) => void;
}

const MessageBubble: React.FC<BubbleProps> = React.memo(({
  message, isOwn, showAvatar, isSelected, isSelectMode, isHighlighted, inView,
  onTap, onLongPress, onReact, onLayout,
}) => {
  const initials = (message.sender?.nickName ?? "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const time = new Date(message.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
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
  }, [isHighlighted]);
  const rowBg = isSelected
    ? colors.accent + "22"
    : (flashAnim.interpolate({ inputRange: [0, 1], outputRange: ["transparent", colors.accent + "35"] }) as any);

  const renderContent = () => {
    const url = (message as any).mediaUrl ?? message.content;
    switch (message.type) {
      case "IMAGE":
        return url ? <ImageMessage url={url} /> : <Text style={[bS.text, isOwn && bS.textOwn]}>🖼 Фото</Text>;
      case "VIDEO":
        return <VideoMessage url={url ?? ""} isOwn={isOwn} inView={inView} />;
      case "VOICE":
        return <AudioMessage url={url ?? ""} isOwn={isOwn} />;
      case "AUDIO":
        return <AudioMessage url={url ?? ""} isOwn={isOwn} />;
      case "MUSIC": {
        const rawUrl: string = (message as any).mediaUrl ?? "";
        let parsedTitle: string | null  = (message as any).musicTitle  ?? null;
        let parsedArtist: string | null = (message as any).musicArtist ?? null;

        // Строим coverUrl: сначала прямой presigned, потом пробуем из ключа
        let coverUrl: string | null = (message as any).musicCoverUrl ?? null;
        if (!coverUrl && (message as any).musicCover && rawUrl) {
          try {
            // Берём схему+хост из mediaUrl и строим путь к обложке
            const base = new URL(rawUrl);
            const key: string = (message as any).musicCover;
            coverUrl = `${base.protocol}//${base.host}/${key}`;
          } catch (_) {}
        }

        if (!parsedTitle && rawUrl) {
          try {
            const decoded = decodeURIComponent(rawUrl.split("?")[0].split("/").pop() ?? "");
            const nameOnly = decoded.replace(/^[0-9a-f-]{36}-/i, "").replace(/\.[^.]+$/, "");
            const parts = nameOnly.split(" - ");
            if (parts.length >= 2) {
              parsedArtist = parsedArtist ?? parts[0].trim();
              parsedTitle  = parts.slice(1).join(" - ").trim();
            } else {
              parsedTitle = nameOnly.trim() || null;
            }
          } catch (_) {}
        }

        return (
          <MusicMessage
            url={rawUrl}
            title={parsedTitle}
            artist={parsedArtist}
            coverUrl={coverUrl}
            isOwn={isOwn}
          />
        );
      }
      case "FILE":
        return <FileMessage url={url ?? ""} name={message.content ?? "Файл"} isOwn={isOwn} fileSize={(message as any).fileSize ?? undefined} />;
      default:
        return <Text style={[bS.text, isOwn && bS.textOwn]}>{message.content ?? ""}</Text>;
    }
  };

  return (
    <Pressable
      onPress={(e) => onTap(message, e.nativeEvent.pageY)}
      onLongPress={() => onLongPress(message)}
      delayLongPress={250}
      unstable_pressDelay={isSelectMode ? 0 : 80}
      android_disableSound
      onLayout={(e) => onLayout?.(message.id, e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
    >
      <Animated.View style={[bS.row, isOwn ? bS.rowOwn : bS.rowOther, { backgroundColor: rowBg }]}>
        {isSelectMode && (
          <View style={[bS.check, isSelected && bS.checkActive]}>
            {isSelected && <Icon name="check" size={11} color={colors.text} />}
          </View>
        )}
        {!isOwn && (
          <View style={bS.avatarCol}>
            {showAvatar
              ? (message.sender?.avatarUrl
                ? <Image source={{ uri: message.sender.avatarUrl }} style={bS.avatar} />
                : <View style={bS.avatarPh}><Text style={bS.avatarIn}>{initials}</Text></View>)
              : <View style={bS.avatarSpacer} />
            }
          </View>
        )}
        <View style={[bS.col, isOwn && bS.colOwn, (message.type === "IMAGE" || message.type === "VIDEO") && bS.colMedia]}>
        <View style={[
            message.type === "IMAGE" || message.type === "VIDEO"
              ? bS.bubbleMedia
              : [bS.bubble, isOwn ? bS.bubbleOwn : bS.bubbleOther],
          ]}>
            {message.forwardedFrom && <ForwardedBubble message={message} isOwn={isOwn} />}
            {renderContent()}
            <View style={[bS.meta, (message.type === "IMAGE" || message.type === "VIDEO") && bS.metaOnMedia]}>
              {isEdited && <Text style={[bS.edited, isOwn && bS.editedOwn]}>изм.</Text>}
              <Text style={[bS.time, isOwn && bS.timeOwn, (message.type === "IMAGE" || message.type === "VIDEO") && bS.timeOnMedia]}>{time}</Text>
              {isOwn && <MessageStatus message={message} isOwn={isOwn} />}
            </View>
          </View>
          {Object.keys(grouped).length > 0 && (
            <View style={[bS.reactRow, isOwn && bS.reactRowOwn]}>
              {Object.entries(grouped).map(([emoji, count]) => (
                <TouchableOpacity
                  key={emoji} style={bS.reactChip}
                  onPress={() => onReact(message.id, emoji)} activeOpacity={0.7}
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
});

// ── MessageStatus: галочки прочитанности ──────────────────────────────────────
// pending (id < 0): "–"  — сообщение ещё не дошло до сервера
// sent   (id > 0, readReceipts пуст): ✗ — доставлено, не прочитано
// read   (readReceipts.length > 0):   ✗ с кружком — прочитано
const MessageStatus: React.FC<{ message: Message; isOwn: boolean }> = React.memo(({ message, isOwn }) => {
  if (!isOwn) return null;

  const isPending = message.id < 0;
  const isRead    = Array.isArray(message.readReceipts) && message.readReceipts.length > 0;

  const color = isOwn ? (colors.text + "AA") : (colors.primary + "60");

  if (isPending) {
    // "–" — ожидает отправки
    return (
      <View style={stS.wrap}>
        <View style={stS.dash} />
      </View>
    );
  }

  // X-форма из двух перекрещённых линий
  return (
    <View style={stS.wrap}>
      {isRead && <View style={stS.circle} />}
      <View style={[stS.line, stS.line1, { backgroundColor: color }]} />
      <View style={[stS.line, stS.line2, { backgroundColor: color }]} />
    </View>
  );
});

const stS = StyleSheet.create({
  wrap: {
    width: 13, height: 13, position: "relative",
    alignItems: "center", justifyContent: "center",
  },
  // Кружок для прочитанного статуса
  circle: {
    position: "absolute",
    width: 13, height: 13, borderRadius: 6.5,
    borderWidth: 1.5, borderColor: colors.text + "AA",
  },
  // Две линии образуют X
  line: {
    position: "absolute",
    width: 9, height: 1.7, borderRadius: 1,
  },
  line1: { transform: [{ rotate: "45deg" }] },
  line2: { transform: [{ rotate: "-45deg" }] },
  // Тире для pending
  dash: {
    width: 8, height: 1.7, borderRadius: 1,
    backgroundColor: colors.text + "AA",
  },
});

const bS = StyleSheet.create({
  row: { flexDirection: "row", marginVertical: 2, paddingHorizontal: 12, alignItems: "flex-end" },
  rowOwn: { justifyContent: "flex-end" },
  rowOther: { justifyContent: "flex-start" },
  check: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2,
    borderColor: colors.primary + "50", alignItems: "center", justifyContent: "center",
    marginRight: 8, marginBottom: 6,
  },
  checkActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  avatarCol: { width: 34, marginRight: 8, alignSelf: "flex-end", marginBottom: 4 },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  avatarPh: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.secondary + "60", alignItems: "center", justifyContent: "center",
  },
  avatarIn: { fontSize: 11, fontWeight: "700", color: colors.text },
  avatarSpacer: { width: 34 },
  col: { maxWidth: "75%", alignItems: "flex-start" },
  colOwn: { alignItems: "flex-end" },
  colMedia: { maxWidth: "75%" }, // убираем растяжку — размер определяет само медиа
  bubble: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, marginBottom: 2, overflow: "hidden" },
  bubbleOwn: { backgroundColor: colors.accent, borderBottomRightRadius: 3 },
  bubbleOther: { backgroundColor: colors.secondary + "35", borderBottomLeftRadius: 3, borderWidth: 0.5, borderColor: colors.primary + "20" },
  bubbleMedia: { borderRadius: 14, marginBottom: 2, overflow: "hidden", backgroundColor: "transparent" },
  text: { fontSize: 15, color: colors.primary, lineHeight: 21, paddingHorizontal: 2 },
  textOwn: { color: colors.text },
  meta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 4, paddingHorizontal: 2 },
  time: { fontSize: 11, color: colors.primary + "60" },
  timeOwn: { color: colors.text + "AA" },
  edited: { fontSize: 10, color: colors.primary + "50", fontStyle: "italic" },
  editedOwn: { color: colors.text + "80" },
  mediaImg: { width: 220, height: 160, borderRadius: 12, marginBottom: 4 },
  mediaRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4, paddingVertical: 4 },
  playBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center",
  },
  mediaText: { fontSize: 14, color: colors.primary, fontWeight: "500", flexShrink: 1 },
  reactRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  metaOnMedia: {
    position: "absolute", bottom: 6, right: 8,
    backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 8,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  timeOnMedia: { color: "#fff", fontSize: 11 },
  reactRowOwn: { justifyContent: "flex-end" },
  reactChip: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.secondary + "40", borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: colors.primary + "25",
  },
  reactEmoji: { fontSize: 14 },
  reactCount: { fontSize: 11, color: colors.primary, marginLeft: 3, fontWeight: "600" },
});

// ══════════════════════════════════════════════════════════════════════════════
// MediaPickerSheet — выбор файлов/фото/видео
// ══════════════════════════════════════════════════════════════════════════════
const MediaPickerSheet: React.FC<{
  visible: boolean;
  onClose: () => void;
  onPick: (f: PickedFile) => void;
}> = ({ visible, onClose, onPick }) => {
  const slideY = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }).start();
    } else {
      Animated.timing(slideY, { toValue: 300, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible]);

  const checkSize = (size?: number | null): boolean => {
    if (size && size > MAX_FILE_SIZE) {
      Alert.alert("Файл слишком большой", "Максимальный размер — 100 МБ");
      return false;
    }
    return true;
  };

  const go = async (action: () => Promise<void>) => {
    onClose();
    // небольшая задержка чтобы sheet успел закрыться перед открытием системного picker'а
    await new Promise((r) => setTimeout(r, 300));
    try {
      await action();
    } catch (err: any) {
      // пользователь отменил — не показываем ошибку
      if (err?.code !== "DOCUMENT_PICKER_CANCELED" && err?.code !== "camera_unavailable") {
        Alert.alert("Ошибка", "Не удалось получить файл");
      }
    }
  };

  const pickImage = async () => {
    const r = await launchImageLibrary({
      mediaType: "photo",
      quality: 1,
      selectionLimit: 1,
    });
    if (r.didCancel) return;
    const a = r.assets?.[0];
    if (!a?.uri) return;
    if (!checkSize(a.fileSize)) return;
    onPick({
      uri: a.uri,
      name: a.fileName ?? `photo_${Date.now()}.jpg`,
      type: a.type ?? "image/jpeg",
      mediaType: "IMAGE",
      size: a.fileSize ?? 0,
    });
  };

  const pickCamera = async () => {
    const r = await launchCamera({
      mediaType: "photo",
      quality: 1,
      saveToPhotos: false,
    });
    if (r.didCancel) return;
    const a = r.assets?.[0];
    if (!a?.uri) return;
    if (!checkSize(a.fileSize)) return;
    onPick({
      uri: a.uri,
      name: a.fileName ?? `photo_${Date.now()}.jpg`,
      type: a.type ?? "image/jpeg",
      mediaType: "IMAGE",
      size: a.fileSize ?? 0,
    });
  };

  const pickVideo = async () => {
    const r = await launchImageLibrary({
      mediaType: "video",
      selectionLimit: 1,
    });
    if (r.didCancel) return;
    const a = r.assets?.[0];
    if (!a?.uri) return;
    if (!checkSize(a.fileSize)) return;
    onPick({
      uri: a.uri,
      name: a.fileName ?? `video_${Date.now()}.mp4`,
      type: a.type ?? "video/mp4",
      mediaType: "VIDEO",
      size: a.fileSize ?? 0,
    });
  };

  const pickAudio = async () => {
    const results = await pick({
      type: ["audio/*"],
      allowMultiSelection: false,
    });
    const r = results?.[0];
    if (!r?.uri) return;
    const size = (r as any).size ?? 0;
    if (!checkSize(size)) return;
    const mime: string = (r as any).mimeType ?? r.type ?? "";
    const name: string = r.name ?? `audio_${Date.now()}`;
    // wav/ogg/webm/opus → голосовое, остальное → музыка
    const isVoice = /wav|ogg|webm|opus/i.test(mime) || /\.(wav|ogg|webm|opus)$/i.test(name);
    onPick({
      uri: r.uri,
      name,
      type: mime || (isVoice ? "audio/wav" : "audio/mpeg"),
      mediaType: isVoice ? "VOICE" : "MUSIC",
      size,
    });
  };

  const pickFile = async () => {
    const results = await pick({
      type: ["*/*"],
      allowMultiSelection: false,
    });
    const r = results?.[0];
    if (!r?.uri) return;
    const size = (r as any).size ?? 0;
    if (!checkSize(size)) return;
    const mime: string = (r as any).mimeType ?? r.type ?? "application/octet-stream";
    const name: string = r.name ?? `file_${Date.now()}`;

    // Если выбран аудио файл через "Файл" — определяем правильный тип
    let mediaType: PickedFile["mediaType"] = "FILE";
    if (/^audio\//i.test(mime) || /\.(mp3|m4a|aac|flac|ogg|wav|opus|webm)$/i.test(name)) {
      const isVoice = /wav|ogg|webm|opus/i.test(mime) || /\.(wav|ogg|webm|opus)$/i.test(name);
      mediaType = isVoice ? "VOICE" : "MUSIC";
    }

    onPick({
      uri: r.uri,
      name,
      type: mime,
      mediaType,
      size,
    });
  };

  const opts = [
    { icon: "image",     label: "Фото",   color: "#6ecfff", action: () => go(pickImage) },
    { icon: "camera",    label: "Камера", color: "#a0e4a0", action: () => go(pickCamera) },
    { icon: "video",     label: "Видео",  color: "#ffb86c", action: () => go(pickVideo) },
    { icon: "music",     label: "Аудио",  color: colors.accent, action: () => go(pickAudio) },
    { icon: "paperclip", label: "Файл",   color: "#d0aeff", action: () => go(pickFile) },
  ];

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={mpS.backdrop} />
      </TouchableWithoutFeedback>
      <Animated.View style={[mpS.sheet, { transform: [{ translateY: slideY }] }]}>
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
        <View style={{ height: Platform.OS === "ios" ? 32 : 20 }} />
      </Animated.View>
    </Modal>
  );
};
const mpS = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderWidth: 1, borderColor: colors.primary + "20",
    paddingHorizontal: 24, paddingTop: 8,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.primary + "40", alignSelf: "center", marginBottom: 16 },
  title: { fontSize: 17, fontWeight: "700", color: colors.text, marginBottom: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  option: { alignItems: "center", gap: 8, width: 60 },
  iconWrap: { width: 60, height: 60, borderRadius: 18, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  optLabel: { fontSize: 12, fontWeight: "600", color: colors.primary, textAlign: "center" },
});

// ══════════════════════════════════════════════════════════════════════════════
// AudioRecordingOverlay
// ══════════════════════════════════════════════════════════════════════════════
const AudioRecordingOverlay: React.FC<{
  visible: boolean;
  duration: number;
  slideX: Animated.Value;
  onCancel: () => void;
}> = ({ visible, duration, slideX, onCancel }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) { pulseAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.5, duration: 550, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 550, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visible]);

  if (!visible) return null;
  const cancelOpacity = slideX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0.4], extrapolate: "clamp" });
  const arrowOpacity  = slideX.interpolate({ inputRange: [-80, 0], outputRange: [0.3, 1], extrapolate: "clamp" });

  return (
    <View style={recS.overlay} pointerEvents="box-none">
      <View style={recS.left}>
        <View style={recS.dotWrap}>
          <Animated.View style={[recS.dotRipple, { transform: [{ scale: pulseAnim }] }]} />
          <View style={recS.redDot} />
        </View>
        <Text style={recS.timer}>{formatDuration(duration)}</Text>
      </View>
      <Animated.View style={[recS.slideHint, { opacity: arrowOpacity }]}>
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
  overlay: {
    position: "absolute", left: 0, right: 52, top: 0, bottom: 0,
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16,
    backgroundColor: colors.background, zIndex: 10,
  },
  left: { flexDirection: "row", alignItems: "center", gap: 8 },
  dotWrap: { width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  dotRipple: { position: "absolute", width: 20, height: 20, borderRadius: 10, backgroundColor: "#ff453a44" },
  redDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#ff453a" },
  timer: { fontSize: 16, fontWeight: "600", color: colors.text, fontVariant: ["tabular-nums"] },
  slideHint: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2 },
  slideText: { fontSize: 13, color: colors.primary + "60" },
  cancelLabel: { fontSize: 14, fontWeight: "600", color: "#ff453a" },
});

// ══════════════════════════════════════════════════════════════════════════════
// CircleRecordModal — видео-кружок
//
// Архитектура: два отдельных компонента чтобы не нарушать Rules of Hooks.
// Хуки VisionCamera (useCameraDevice, useCameraPermission) нельзя вызывать
// условно — они всегда должны быть в одном и том же компоненте.
// Поэтому:
//   CircleRecordModalVC  — версия с реальным превью (VisionCamera)
//   CircleRecordModalFallback — fallback через системную камеру
//   CircleRecordModal    — обёртка, выбирает нужный вариант
// ══════════════════════════════════════════════════════════════════════════════

interface CircleModalProps {
  visible: boolean;
  onClose: () => void;
  onSend: (file: PickedFile) => void;
}

// ─── Shared UI helper ─────────────────────────────────────────────────────────
const CircleModalUI: React.FC<{
  scaleAnim: Animated.Value;
  isRecording: boolean;
  duration: number;
  hasPermission: boolean;
  cameraSlot: React.ReactNode;
  showFlipBtn: boolean;
  onFlip?: () => void;
  onCancel: () => void;
  onStart: () => void;
  onStop: () => void;
}> = ({ scaleAnim, isRecording, duration, hasPermission, cameraSlot, showFlipBtn, onFlip, onCancel, onStart, onStop }) => (
  <View style={crS.backdrop}>
    <Animated.View style={[crS.container, { transform: [{ scale: scaleAnim }] }]}>
      <View style={crS.ringOuter}>
        <View style={[crS.circle, { width: CIRCLE_SIZE, height: CIRCLE_SIZE, borderRadius: CIRCLE_SIZE / 2 }]}>
          {cameraSlot}
        </View>
        {isRecording && <View style={[crS.progressRing, { borderColor: colors.accent }]} />}
      </View>

      {isRecording && (
        <View style={crS.timerOverlay}>
          <Text style={crS.durationBig}>{formatDuration(duration * 1000)}</Text>
        </View>
      )}

      <View style={crS.controls}>
        {!isRecording ? (
          <>
            <Text style={crS.hint}>{hasPermission ? "Нажмите для записи" : "Ожидание разрешений..."}</Text>
            <View style={crS.btnRow}>
              <TouchableOpacity style={crS.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
                <Icon name="x" size={22} color={colors.text} />
              </TouchableOpacity>
              {showFlipBtn && (
                <TouchableOpacity style={crS.flipBtn} onPress={onFlip} activeOpacity={0.8}>
                  <Icon name="refresh-cw" size={18} color={colors.text} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[crS.recordBtn, !hasPermission && crS.recordBtnDisabled]}
                onPress={onStart}
                activeOpacity={0.8}
                disabled={!hasPermission}
              >
                <View style={crS.recordDot} />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <Text style={crS.hint}>Нажмите для отправки</Text>
            <View style={crS.btnRow}>
              <TouchableOpacity style={crS.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
                <Icon name="x" size={22} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity style={crS.stopBtn} onPress={onStop} activeOpacity={0.8}>
                <Icon name="send" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Animated.View>
  </View>
);

// ─── VisionCamera версия (хуки вызываются безусловно внутри компонента) ──────
const CircleRecordModalVC: React.FC<CircleModalProps> = ({ visible, onClose, onSend }) => {
  // Импортируем здесь — компонент рендерится только если VISION_CAMERA_AVAILABLE
  const {
    Camera,
    useCameraDevice,
    useCameraPermission,
  } = require("react-native-vision-camera");

  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [useFrontCamera, setUseFrontCamera] = useState(true);

  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cameraRef = useRef<any>(null);

  // Хуки VisionCamera — вызываются безусловно, это нормально
  const device = useCameraDevice(useFrontCamera ? "front" : "back");
  const { hasPermission, requestPermission } = useCameraPermission();

  const MAX_DURATION = 60;

  useEffect(() => {
    if (!visible) return;
    (async () => {
      if (!hasPermission) {
        await requestPermission();
        if (Platform.OS === "android") await requestCameraPermission();
      }
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }).start();
    })();
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      scaleAnim.setValue(0.8);
      setIsRecording(false);
      setDuration(0);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [visible]);

  const handleCancel = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (isRecording && cameraRef.current) {
      try { await cameraRef.current.stopRecording(); } catch (_) {}
    }
    setIsRecording(false);
    setDuration(0);
    onClose();
  }, [isRecording, onClose]);

  const handleStart = useCallback(() => {
    if (!hasPermission || !cameraRef.current) return;
    setIsRecording(true);
    setDuration(0);
    timerRef.current = setInterval(() => {
      setDuration((d) => {
        if (d + 1 >= MAX_DURATION && timerRef.current) clearInterval(timerRef.current);
        return d + 1;
      });
    }, 1000);

    try {
      cameraRef.current.startRecording({
        onRecordingFinished: (video: any) => {
          if (timerRef.current) clearInterval(timerRef.current);
          setIsRecording(false);
          const uri = video.path.startsWith("file://") ? video.path : `file://${video.path}`;
          if (!video.duration || video.duration < 0.5) { onClose(); return; }
          onSend({ uri, name: `circle_${Date.now()}.mp4`, type: "video/mp4", mediaType: "VIDEO", size: 0 });
          onClose();
        },
        onRecordingError: () => {
          if (timerRef.current) clearInterval(timerRef.current);
          setIsRecording(false);
          onClose();
        },
      });
    } catch (err) {
      console.warn("VC startRecording error:", err);
      if (timerRef.current) clearInterval(timerRef.current);
      setIsRecording(false);
    }
  }, [hasPermission, onClose, onSend]);

  const handleStop = useCallback(async () => {
    if (!isRecording || !cameraRef.current) return;
    if (timerRef.current) clearInterval(timerRef.current);
    try { await cameraRef.current.stopRecording(); } catch (err) {
      console.warn("VC stopRecording error:", err);
      setIsRecording(false);
    }
  }, [isRecording]);

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={handleCancel}>
      <CircleModalUI
        scaleAnim={scaleAnim}
        isRecording={isRecording}
        duration={duration}
        hasPermission={hasPermission}
        showFlipBtn
        onFlip={() => setUseFrontCamera((v) => !v)}
        onCancel={handleCancel}
        onStart={handleStart}
        onStop={handleStop}
        cameraSlot={
          device && hasPermission ? (
            <Camera
              ref={cameraRef}
              style={crS.cameraFill}
              device={device}
              isActive={visible}
              video
              audio
            />
          ) : (
            <View style={crS.innerCircle}>
              <Icon name="video" size={48} color={colors.text + "80"} />
            </View>
          )
        }
      />
    </Modal>
  );
};

// ─── Fallback версия (без VisionCamera — через системный лаунчер) ─────────────
const CircleRecordModalFallback: React.FC<CircleModalProps> = ({ visible, onClose, onSend }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [hasPermission, setHasPermission] = useState(false);

  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const MAX_DURATION = 60;

  useEffect(() => {
    if (!visible) return;
    requestCameraPermission().then(setHasPermission);
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }).start();
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      scaleAnim.setValue(0.8);
      setIsRecording(false);
      setDuration(0);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [visible]);

  const handleCancel = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
    setDuration(0);
    onClose();
  }, [onClose]);

  const handleStart = useCallback(async () => {
    if (!hasPermission) {
      Alert.alert("Нет разрешения", "Разрешите доступ к камере и микрофону в настройках");
      return;
    }
    setIsRecording(true);
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    try {
      const r = await launchCamera({ mediaType: "video", videoQuality: "high", durationLimit: MAX_DURATION });
      if (timerRef.current) clearInterval(timerRef.current);
      setIsRecording(false);
      if (r.didCancel) { onClose(); return; }
      const a = r.assets?.[0];
      if (!a?.uri) { onClose(); return; }
      if ((a.fileSize ?? 0) > MAX_FILE_SIZE) {
        Alert.alert("Файл слишком большой", "Максимальный размер — 100 МБ");
        onClose();
        return;
      }
      onSend({ uri: a.uri, name: a.fileName ?? `circle_${Date.now()}.mp4`, type: a.type ?? "video/mp4", mediaType: "VIDEO", size: a.fileSize ?? 0 });
      onClose();
    } catch (_) {
      if (timerRef.current) clearInterval(timerRef.current);
      setIsRecording(false);
      onClose();
    }
  }, [hasPermission, onClose, onSend]);

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={handleCancel}>
      <CircleModalUI
        scaleAnim={scaleAnim}
        isRecording={isRecording}
        duration={duration}
        hasPermission={hasPermission}
        showFlipBtn={false}
        onCancel={handleCancel}
        onStart={handleStart}
        onStop={handleCancel} // fallback — системная камера сама останавливается
        cameraSlot={
          <View style={crS.innerCircle}>
            <Icon name="video" size={48} color={colors.text + "80"} />
            {isRecording && <Text style={crS.durationBig}>{formatDuration(duration * 1000)}</Text>}
          </View>
        }
      />
    </Modal>
  );
};

// ─── Обёртка — выбирает нужный компонент на основе доступности библиотеки ────
const CircleRecordModal: React.FC<CircleModalProps> = (props) => {
  if (VISION_CAMERA_AVAILABLE) {
    return <CircleRecordModalVC {...props} />;
  }
  return <CircleRecordModalFallback {...props} />;
};
const crS = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.90)", justifyContent: "center", alignItems: "center" },
  container: { alignItems: "center", gap: 32 },
  ringOuter: {
    padding: 4, borderRadius: 999,
    borderWidth: 3, borderColor: colors.accent,
    position: "relative",
  },
  progressRing: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 999,
    borderWidth: 3,
  },
  circle: {
    backgroundColor: colors.secondary + "40",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.primary + "20",
  },
  cameraFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  innerCircle: { alignItems: "center", gap: 12 },
  timerOverlay: {
    position: "absolute",
    bottom: 16,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  durationBig: { fontSize: 20, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] },
  controls: { alignItems: "center", gap: 16 },
  hint: { fontSize: 14, color: colors.primary + "80", textAlign: "center" },
  btnRow: { flexDirection: "row", gap: 20, alignItems: "center" },
  cancelBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.secondary + "60", borderWidth: 1, borderColor: colors.primary + "20",
    alignItems: "center", justifyContent: "center",
  },
  flipBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.secondary + "50", borderWidth: 1, borderColor: colors.primary + "20",
    alignItems: "center", justifyContent: "center",
  },
  recordBtn: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: "#ff453a",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#ff453a", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 8,
  },
  recordBtnDisabled: { backgroundColor: "#ff453a60" },
  recordDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#fff" },
  stopBtn: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: colors.accent,
    alignItems: "center", justifyContent: "center",
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 8,
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// RightActionButton
// ══════════════════════════════════════════════════════════════════════════════
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

const RightActionButton: React.FC<RightBtnProps> = ({
  mode, micSubMode, uploading, onSend,
  onMicPress, onMicLongPressIn, onMicLongPressOut, slideX,
}) => {
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
  btn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent,
    alignItems: "center", justifyContent: "center",
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28, shadowRadius: 6, elevation: 5,
  },
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

  // Ref на текущие сообщения — используется в handleMessageDeleted callback
  const _messagesCache_ref = useRef<Message[]>([]);

  const gp = useGlobalPlayer();

  // Коллбэк для остановки плеера при удалении аудио/музыки
  const handleMessageDeleted = useCallback((messageId: number) => {
    // Ищем удалённое сообщение в кеше чтобы получить его mediaUrl
    const deleted = _messagesCache_ref.current?.find((m) => m.id === messageId);
    if (deleted?.mediaUrl) {
      gp.stopIfUrl(deleted.mediaUrl);
    }
  }, [gp]);

  const {
    messages, markRead, pinnedMessages: rawPinnedMessages,
    sendMessage, sendMedia, editMessage, deleteMessage,
    reactToMessage, pinMessage, unpinMessage,
  } = useChatRoom(chatId, { onMessageDeleted: handleMessageDeleted });
  const pinnedMessages: PinnedMessage[] = rawPinnedMessages;
  const { typingUserIds, startTyping, stopTyping } = useTyping(chatId);

  const headerHeightRef = useRef(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Рендерим FlatList сразу — без задержки, чтобы не было мигания при повторном входе
  const isReady = true;

  const isFocusedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      return () => { isFocusedRef.current = false; };
    }, [])
  );

  const prevMsgLenRef = useRef(0);
  useEffect(() => {
    const prev = prevMsgLenRef.current;
    prevMsgLenRef.current = messages.length;
    if (!isFocusedRef.current) return;
    if (messages.length === 0) return;
    if (messages.length <= prev) return;
    markRead();
  }, [messages, markRead]);

  // Android keyboard height tracking
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

  // ── Audio recording state ──────────────────────────────────────────────────
  const [isAudioRecording, setIsAudioRecording] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [circleModalVisible, setCircleModalVisible] = useState(false);
  const [micSubMode, setMicSubMode] = useState<"audio" | "circle">("audio");
  const audioSlideX = useRef(new Animated.Value(0)).current;
  const longPressActive = useRef(false);
  // Отдельный ref для duration interval — без хаков
  const audioDurationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRecordingCancelledRef = useRef(false);
  const audioRecordStartTimeRef = useRef(0);
  // Ленивое создание инстанса — ТОЛЬКО внутри компонента, не на уровне модуля.
  // New Architecture требует чтобы нативные модули инициализировались после маунта.
  // react-native-audio-record не требует инстанса — это статический модуль

  const scrollOffsetRef = useRef(_scrollOffsetCache.get(chatId) ?? 0);

  const isSelectMode = selectedIds.size > 0;
  const inputMode: "send" | "mic" = inputText.trim().length > 0 || !!editTarget ? "send" : "mic";
  const listRef = useRef<FlatList>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPinActiveIndex(pinnedMessages.length > 0 ? pinnedMessages.length - 1 : 0);
  }, [pinnedMessages.length]);

  useEffect(() => {
    if (editTarget) setInputText(editTarget.content ?? "");
  }, [editTarget]);

  const reversedMessagesRef = useRef<Message[]>([]);
  const reversedMessages = useMemo(() => messages.slice().reverse(), [messages]);

  useEffect(() => {
    reversedMessagesRef.current = reversedMessages;
    _messagesCache_ref.current = messages; // синхронизируем ref для handleMessageDeleted
  }, [messages]);

  // Восстанавливаем позицию скролла после маунта (listRef и reversedMessagesRef уже объявлены)
  useEffect(() => {
    const saved = _scrollOffsetCache.get(chatId);
    if (saved && saved > 0) {
      const id = setTimeout(() => {
        listRef.current?.scrollToOffset({ offset: saved, animated: false });
      }, 50);
      return () => clearTimeout(id);
    }
  }, []); // только при маунте

  const pinnedMessageIds = new Set(pinnedMessages.map((p) => p.messageId));

  // ── Send text ──────────────────────────────────────────────────────────────
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

  // ── Media pick & upload ────────────────────────────────────────────────────
  const handleMediaPick = useCallback(async (file: PickedFile) => {
    setUploading(true);
    try {
      await sendMedia(file, file.mediaType as any, replyTo?.id);
      setReplyTo(null);
    } catch (err) {
      console.warn("sendMedia error:", err);
      Alert.alert("Ошибка", "Не удалось загрузить файл. Проверьте соединение.");
    } finally {
      setUploading(false);
    }
  }, [sendMedia, replyTo]);

  // ── Mic toggle (tap) ───────────────────────────────────────────────────────
  const handleMicPress = useCallback(() => {
    if (longPressActive.current) return;
    setMicSubMode((prev) => (prev === "audio" ? "circle" : "audio"));
  }, []);

  // ── Audio recording (react-native-audio-recorder-player) ──────────────────
  const startAudioRecording = useCallback(async () => {
    if (!AudioRecord) {
      Alert.alert("Ошибка записи", "Модуль недоступен.\nВыполни: npx react-native run-android");
      return;
    }

    const hasPerm = await requestMicPermission();
    if (!hasPerm) {
      Alert.alert("Нет доступа", "Разрешите доступ к микрофону в настройках");
      return;
    }

    try {
      // react-native-audio-record API:
      // init() настраивает параметры, start() начинает запись
      // wavFile — имя файла (без пути), библиотека сама кладёт в кэш
      AudioRecord.init({
        sampleRate: 16000,
        channels: 1,
        bitsPerSample: 16,
        audioSource: 6, // MIC с шумоподавлением
        wavFile: `voice_${Date.now()}.wav`,
      });

      AudioRecord.start();

      audioRecordingCancelledRef.current = false;
      audioRecordStartTimeRef.current = Date.now();
      setAudioDuration(0);
      setIsAudioRecording(true);

      // Обновляем таймер каждые 100ms через Date.now() — 
      // react-native-audio-record не имеет колбэка прогресса
      const startTime = Date.now();
      audioDurationIntervalRef.current = setInterval(() => {
        setAudioDuration(Date.now() - startTime);
      }, 100);
    } catch (err) {
      console.warn("AudioRecord.start error:", err);
      setIsAudioRecording(false);
      if (audioDurationIntervalRef.current) {
        clearInterval(audioDurationIntervalRef.current);
        audioDurationIntervalRef.current = null;
      }
      Alert.alert("Ошибка записи", "Не удалось начать запись голосового сообщения");
    }
  }, []);

  const stopAudioRecording = useCallback(async (cancel = false) => {
    if (!AudioRecord) return;

    // Останавливаем таймер длительности
    if (audioDurationIntervalRef.current) {
      clearInterval(audioDurationIntervalRef.current);
      audioDurationIntervalRef.current = null;
    }

    try {
      // stop() возвращает путь к записанному файлу
      const filePath: string = await AudioRecord.stop();
      setIsAudioRecording(false);
      setAudioDuration(0);

      if (cancel || audioRecordingCancelledRef.current) {
        audioRecordingCancelledRef.current = false;
        return;
      }
      if (!filePath) return;

      const uri = filePath.startsWith("file://") ? filePath : `file://${filePath}`;

      await handleMediaPick({
        uri,
        name: `voice_${Date.now()}.wav`,
        type: "audio/wav",
        mediaType: "VOICE",
      });
    } catch (err) {
      console.warn("AudioRecord.stop error:", err);
      setIsAudioRecording(false);
    }
  }, [handleMediaPick]);

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

    if (micSubMode === "circle") {
      audioSlideX.setValue(0);
      return;
    }

    // Проверяем насколько далеко сдвинул пользователь для отмены
    const xVal: number = (audioSlideX as any)._value ?? 0;
    const cancelled = xVal < -60;
    if (cancelled) audioRecordingCancelledRef.current = true;
    stopAudioRecording(cancelled);
    audioSlideX.setValue(0);
  }, [micSubMode, stopAudioRecording, audioSlideX]);

  const handleCancelRecording = useCallback(() => {
    audioRecordingCancelledRef.current = true;
    longPressActive.current = false;
    stopAudioRecording(true);
    audioSlideX.setValue(0);
  }, [stopAudioRecording, audioSlideX]);

  // Cleanup при размонтировании
  useEffect(() => {
    return () => {
      if (audioDurationIntervalRef.current) {
        clearInterval(audioDurationIntervalRef.current);
      }
      if (AudioRecord && isAudioRecording) {
        AudioRecord.stop().catch(() => {});
      }
    };
  }, []);

  // ── Tap / longpress ───────────────────────────────────────────────────────
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

  const handleLongPress = useCallback((msg: Message) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(msg.id)) next.delete(msg.id);
      else next.add(msg.id);
      return next;
    });
  }, []);

  // ── Scroll to message + flash ─────────────────────────────────────────────
  const handleGoToMessage = useCallback((msgId: number) => {
    const idx = reversedMessagesRef.current.findIndex((m) => m.id === msgId);
    if (idx < 0) return;
    listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
    setTimeout(() => {
      setHighlightedId(msgId);
      setTimeout(() => setHighlightedId(null), 1_800);
    }, 350);
  }, []);

  const handlePinnedBannerPress = useCallback(() => {
    if (!pinnedMessages.length) return;
    handleGoToMessage(pinnedMessages[pinActiveIndex].messageId);
    setPinActiveIndex((prev) => (prev <= 0 ? pinnedMessages.length - 1 : prev - 1));
  }, [pinnedMessages, pinActiveIndex, handleGoToMessage]);

  // ── Delete ────────────────────────────────────────────────────────────────
  const requestDelete = useCallback((target: Message | Message[]) => {
    setDeleteTarget(target);
    setDeleteVisible(true);
  }, []);
  const handleDeleteSelf = useCallback(() => {
    setDeleteVisible(false);
    if (!deleteTarget) return;
    (Array.isArray(deleteTarget) ? deleteTarget : [deleteTarget]).forEach((m) => deleteMessage(m.id, false));
    exitSelectMode();
  }, [deleteTarget, deleteMessage]);
  const handleDeleteAll = useCallback(() => {
    setDeleteVisible(false);
    if (!deleteTarget) return;
    (Array.isArray(deleteTarget) ? deleteTarget : [deleteTarget]).forEach((m) => deleteMessage(m.id, true));
    exitSelectMode();
  }, [deleteTarget, deleteMessage]);

  // ── Forward ───────────────────────────────────────────────────────────────
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

  // ── Multiselect ───────────────────────────────────────────────────────────
  const exitSelectMode = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const getSelected = useCallback(() => messages.filter((m) => selectedIds.has(m.id)), [messages, selectedIds]);
  const handleMultiCopy = useCallback(() => {
    const text = getSelected().filter((m) => m.type === "TEXT" && m.content).map((m) => m.content!).join("\n");
    if (text) Clipboard.setString(text);
    exitSelectMode();
  }, [getSelected, exitSelectMode]);
  const handleMultiDelete = useCallback(() => requestDelete(getSelected()), [getSelected, requestDelete]);

  // ── Pin ───────────────────────────────────────────────────────────────────
  const handlePinRequest = useCallback((msg: Message) => { setPinTarget(msg); setPinDialogVisible(true); }, []);
  const handlePinSelf = useCallback(() => { setPinDialogVisible(false); if (pinTarget) pinMessage(pinTarget.id, false); setPinTarget(null); }, [pinTarget, pinMessage]);
  const handlePinAll = useCallback(() => { setPinDialogVisible(false); if (pinTarget) pinMessage(pinTarget.id, true); setPinTarget(null); }, [pinTarget, pinMessage]);
  const handleUnpinRequest = useCallback((msg: Message) => unpinMessage(msg.id), [unpinMessage]);
  const handleCopy = useCallback((msg: Message) => { if (msg.content) Clipboard.setString(msg.content); }, []);
  const cancelCompose = () => { setReplyTo(null); setEditTarget(null); setInputText(""); };

  const otherInitials = otherUser.nickName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const tapIsOwn = !!me && !!tapMessage && Number(tapMessage.senderId) === Number(me.id);
  const tapIsPinned = !!tapMessage && pinnedMessageIds.has(tapMessage.id);

  const handleOpenProfile = useCallback(() => {
    navigation.navigate("UserProfileScreen", {
      user: {
        id: otherUser.id,
        nickName: otherUser.nickName,
        username: otherUser.username,
        avatarUrl: otherUser.avatarUrl ?? null,
        bannerUrl: otherUser.bannerUrl ?? null,
      },
    });
  }, [navigation, otherUser]);

  const [viewableIds, setViewableIds] = useState<Set<number>>(new Set());
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 30 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    setViewableIds(new Set(viewableItems.map((v) => v.item.id)));
  }).current;

  const renderMessage = useCallback(({ item, index }: { item: Message; index: number }) => {
    const isOwn = Number(item.senderId) === Number(me?.id);
    const nextItem = reversedMessagesRef.current[index - 1];
    const showAvatar = !isOwn && (!nextItem || nextItem.senderId !== item.senderId);
    const inView = viewableIds.has(item.id);
    return (
      <MessageBubble
        message={item}
        isOwn={isOwn}
        showAvatar={showAvatar}
        isSelected={selectedIds.has(item.id)}
        isSelectMode={isSelectMode}
        isHighlighted={highlightedId === item.id}
        inView={inView}
        onTap={handleTap}
        onLongPress={handleLongPress}
        onReact={reactToMessage}
      />
    );
  }, [me?.id, reactToMessage, selectedIds, isSelectMode, handleTap, handleLongPress, highlightedId, viewableIds]);

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      <View style={s.container}>
        {/* Header */}
        <View
          style={s.headerWrap}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            headerHeightRef.current = h;
            setHeaderHeight(h);
          }}
        >
          {otherUser.bannerUrl
            ? <Image source={{ uri: otherUser.bannerUrl }} style={s.headerBanner} resizeMode="cover" blurRadius={Platform.OS === "ios" ? 20 : 4} />
            : null
          }
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
                    <Icon name="copy" size={18} color={colors.text + "CC"} />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.iconBtn} onPress={handleMultiForwardRequest}>
                    <Icon name="share-2" size={18} color={colors.text + "CC"} />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.iconBtn} onPress={handleMultiDelete}>
                    <Icon name="trash-2" size={18} color="#ff453a" />
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={s.iconBtn}
                  onPress={() => navigation.canGoBack() && navigation.goBack()}
                >
                  <Icon name="arrow-left" size={22} color={colors.text} />
                </TouchableOpacity>
                <TouchableOpacity style={s.headerInfo} activeOpacity={0.75} onPress={handleOpenProfile}>
                  <View style={s.avatarWrap}>
                    {otherUser.avatarUrl
                      ? <Image source={{ uri: otherUser.avatarUrl }} style={s.headerAvatar} />
                      : <View style={s.headerAvatarPh}><Text style={s.headerAvatarIn}>{otherInitials}</Text></View>
                    }
                    {isOnline && <View style={s.onlineDot} />}
                  </View>
                  <View style={s.headerTextCol}>
                    <Text style={s.headerName} numberOfLines={1}>{otherUser.nickName}</Text>
                    <Text style={[s.headerStatus, isOnline && s.headerStatusOnline]}>
                      {isOnline ? "онлайн" : `@${otherUser.username}`}
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={s.iconBtn} onPress={() => setSearchVisible((v) => !v)}>
                  <Icon name={searchVisible ? "x" : "search"} size={19} color={colors.text + "CC"} />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {searchVisible && !isSelectMode && (
          <SearchBar chatId={chatId} onClose={() => setSearchVisible(false)} onGoTo={handleGoToMessage} />
        )}
        {pinnedMessages.length > 0 && !searchVisible && !isSelectMode && (
          <PinnedBanner pinnedMessages={pinnedMessages} activeIndex={pinActiveIndex} onPress={handlePinnedBannerPress} />
        )}

        <KeyboardAvoidingView
          style={{ flex: 1, paddingBottom: Platform.OS === "android" ? keyboardHeight : 0 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight : 0}
        >
          <View style={{ flex: 1 }}>
            {isReady ? (
            <FlatList
              ref={listRef}
              data={reversedMessages}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderMessage}
              inverted
              showsVerticalScrollIndicator={false}
              contentContainerStyle={s.msgList}
              windowSize={10}
              maxToRenderPerBatch={10}
              initialNumToRender={20}
              removeClippedSubviews={Platform.OS === "android"}
              viewabilityConfig={viewabilityConfig}
              onViewableItemsChanged={onViewableItemsChanged}
              onScroll={(e) => {
                const y = e.nativeEvent.contentOffset.y;
                scrollOffsetRef.current = y;
                _scrollOffsetCache.set(chatId, y);
              }}
              scrollEventThrottle={100}
              onScrollToIndexFailed={(info) => {
                setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 }), 100);
              }}
              ListHeaderComponent={
                typingUserIds.length > 0
                  ? <View style={{ paddingBottom: 4 }}><TypingIndicator /></View>
                  : null
              }
            />
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator color={colors.accent} />
              </View>
            )}
          </View>

          {(replyTo || editTarget) && !isSelectMode && (
            <ComposeBanner
              mode={editTarget ? "edit" : "reply"}
              message={(editTarget ?? replyTo)!}
              onCancel={cancelCompose}
            />
          )}

          {/* Нижний бар — всегда рендерится чтобы список не прыгал */}
          <View style={s.inputBar}>
            {isSelectMode ? (
              // ── Режим выделения ─────────────────────────────────────────────
              <>
                {selectedIds.size === 1 ? (
                  <TouchableOpacity
                    style={s.selectActionBtn}
                    activeOpacity={0.75}
                    onPress={() => {
                      const msg = messages.find((m) => selectedIds.has(m.id));
                      if (msg) { setReplyTo(msg); setEditTarget(null); exitSelectMode(); }
                    }}
                  >
                    <Icon name="corner-up-left" size={20} color={colors.accent} />
                    <Text style={[s.selectActionLabel, { color: colors.accent }]}>Ответить</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={s.selectActionBtn} />
                )}
                <TouchableOpacity
                  style={s.selectActionBtn}
                  activeOpacity={0.75}
                  onPress={handleMultiForwardRequest}
                >
                  <Icon name="share-2" size={20} color={colors.primary + "CC"} />
                  <Text style={[s.selectActionLabel, { color: colors.primary + "CC" }]}>Переслать</Text>
                </TouchableOpacity>
              </>
            ) : (
              // ── Обычный инпут ───────────────────────────────────────────────
              <>
                <TouchableOpacity
                  style={s.attachBtn}
                  onPress={() => setMediaPickerVisible(true)}
                  disabled={uploading || isAudioRecording}
                  activeOpacity={0.8}
                >
                  <Icon
                    name="paperclip"
                    size={17}
                    color={isAudioRecording ? colors.primary + "30" : colors.primary + "90"}
                  />
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
              </>
            )}
          </View>
        </KeyboardAvoidingView>

        <CircleRecordModal
          visible={circleModalVisible}
          onClose={() => setCircleModalVisible(false)}
          onSend={handleMediaPick}
        />

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
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 56 : 36,
    paddingBottom: 14, paddingHorizontal: 16, gap: 12,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.secondary + "40", alignItems: "center", justifyContent: "center" },
  headerInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  avatarWrap: { position: "relative" },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: colors.accent + "50" },
  headerAvatarPh: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.secondary + "60",
    borderWidth: 2, borderColor: colors.accent + "40", alignItems: "center", justifyContent: "center",
  },
  headerAvatarIn: { fontSize: 13, fontWeight: "700", color: colors.text },
  onlineDot: {
    position: "absolute", bottom: 0, right: 0,
    width: 11, height: 11, borderRadius: 5.5,
    backgroundColor: (colors as any).onlineColor, borderWidth: 2, borderColor: colors.background,
  },
  headerTextCol: { flex: 1 },
  headerName: { fontSize: 16, fontWeight: "700", color: colors.text, letterSpacing: -0.2 },
  headerStatus: { fontSize: 12, color: colors.primary + "60", marginTop: 1 },
  headerStatusOnline: { color: (colors as any).onlineColor, fontWeight: "600" },
  selectCount: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.text, marginLeft: 4 },
  selectActions: { flexDirection: "row", gap: 4 },
  msgList: { paddingVertical: 12, paddingBottom: 6 },
  inputBar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 8, paddingVertical: 6, paddingBottom: 6,
    borderTopWidth: 1, borderTopColor: colors.primary + "12",
    backgroundColor: colors.background, gap: 6,
  },
  attachBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  selectActionBtn: {
    flex: 1, alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 6, paddingVertical: 8,
  },
  selectActionLabel: { fontSize: 15, fontWeight: "600" },
  inputWrap: {
    flex: 1, backgroundColor: colors.secondary + "30",
    borderRadius: 20, borderWidth: 1, borderColor: colors.primary + "20",
    paddingHorizontal: 14, paddingVertical: Platform.OS === "ios" ? 8 : 4,
    maxHeight: 100, minHeight: 36, justifyContent: "center", overflow: "hidden",
  },
  input: { color: colors.text, fontSize: 14, lineHeight: 19 },
  headerWrap: { position: "relative", overflow: "hidden", borderBottomWidth: 1, borderBottomColor: colors.primary + "15" },
  headerBanner: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  headerOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(17, 13, 22, 0.78)" },
  headerOverlayNoBanner: { backgroundColor: colors.background },
});

export default ChatScreen;