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
import { OfflineBanner } from '../../components/OfflineBanner';
import { useNetwork } from '../../context/NetworkContext';

// ─── Lazy-load react-native-fs для локального медиа-кэша ─────────────────────
let RNFS: any = null;
try { RNFS = require("react-native-fs"); } catch (_) {}

// ─── Локальный медиа-кэш (переживает навигацию, сбрасывается при перезапуске) ─
// url → локальный путь на диске
const _mediaDiskCache = new Map<string, string>();

// Определяем расширение файла по типу медиа — без расширения react-native-video
// не может определить кодек и просто не воспроизводит файл
function _extForType(mediaType?: string): string {
  switch (mediaType) {
    case "MUSIC": return ".mp3";
    case "VOICE":
    case "AUDIO": return ".wav";
    case "VIDEO": return ".mp4";
    case "IMAGE": return ".jpg";
    default:      return "";
  }
}

// Безопасное имя файла — убираем спецсимволы и query string
function _safeFilename(remoteUrl: string, mediaType?: string): string {
  const raw = remoteUrl.split("?")[0].split("/").pop() ?? `media_${Date.now()}`;
  // decode % и заменяем всё кроме букв/цифр/дефиса/точки на _
  let name = "";
  try { name = decodeURIComponent(raw); } catch { name = raw; }
  name = name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  // Если нет расширения — добавляем по типу медиа
  if (!name.includes(".")) name += _extForType(mediaType);
  return name;
}

/**
 * useMediaUrl — возвращает URL для воспроизведения.
 * Онлайн: скачивает файл в фоне при первом обращении → следующий раз из кэша.
 * Оффлайн: отдаёт кэшированный локальный путь если есть, иначе null.
 *
 * mediaType нужен чтобы добавить правильное расширение файлу без него.
 */
function useMediaUrl(remoteUrl: string, mediaType?: string): { url: string | null; cached: boolean } {
  const { isOnline } = useNetwork();
  const [localUrl, setLocalUrl] = useState<string | null>(
    () => _mediaDiskCache.get(remoteUrl) ?? null
  );
  const downloading = useRef(false);

  useEffect(() => {
    if (!remoteUrl) return;

    // Инвалидируем старый кэш если файл был сохранён без расширения
    const cached = _mediaDiskCache.get(remoteUrl);
    if (cached) {
      const hasExt = cached.split("?")[0].includes(".");
      if (!hasExt) {
        _mediaDiskCache.delete(remoteUrl);
        setLocalUrl(null);
      } else {
        setLocalUrl(cached);
        return;
      }
    }

    if (!isOnline || !RNFS) return;
    if (downloading.current) return;
    downloading.current = true;

    const filename = _safeFilename(remoteUrl, mediaType);
    const destPath = `${RNFS.CachesDirectoryPath}/media_cache/${filename}`;

    RNFS.mkdir(`${RNFS.CachesDirectoryPath}/media_cache`)
      .catch(() => {})
      .then(() => RNFS.exists(destPath))
      .then((exists: boolean) => {
        if (exists) {
          const fileUrl = `file://${destPath}`;
          _mediaDiskCache.set(remoteUrl, fileUrl);
          setLocalUrl(fileUrl);
          downloading.current = false;
          return;
        }
        return RNFS.downloadFile({ fromUrl: remoteUrl, toFile: destPath }).promise
          .then((res: any) => {
            if (res.statusCode === 200) {
              const fileUrl = `file://${destPath}`;
              _mediaDiskCache.set(remoteUrl, fileUrl);
              setLocalUrl(fileUrl);
            }
          });
      })
      .catch(() => {})
      .finally(() => { downloading.current = false; });
  }, [remoteUrl, isOnline]);

  // Онлайн и нет кэша — отдаём remote сразу, кэш скачается в фоне
  if (isOnline && !localUrl) return { url: remoteUrl, cached: false };
  return { url: localUrl, cached: !!localUrl };
}

// ─── Плейсхолдер для медиа недоступного оффлайн ──────────────────────────────
const MEDIA_OFFLINE_LABELS: Partial<Record<MessageType, { icon: string; label: string }>> = {
  IMAGE: { icon: "image",     label: "Фото"     },
  VIDEO: { icon: "video",     label: "Видео"     },
  VOICE: { icon: "mic",       label: "Голосовое" },
  AUDIO: { icon: "mic",       label: "Голосовое" },
  MUSIC: { icon: "music",     label: "Музыка"    },
  FILE:  { icon: "paperclip", label: "Файл"      },
};

const MediaOfflinePlaceholder: React.FC<{ type: MessageType; isOwn: boolean }> = ({ type, isOwn }) => {
  const info = MEDIA_OFFLINE_LABELS[type] ?? { icon: "paperclip", label: "Медиа" };
  return (
    <View style={mopS.wrap}>
      <Icon name={info.icon as any} size={15} color={isOwn ? colors.text + "80" : colors.primary + "60"} />
      <Text style={[mopS.label, isOwn ? mopS.labelOwn : mopS.labelOther]}>{info.label}</Text>
      <View style={[mopS.badge, isOwn ? mopS.badgeOwn : mopS.badgeOther]}>
        <Icon name="wifi-off" size={10} color={isOwn ? colors.text + "70" : colors.primary + "50"} />
        <Text style={[mopS.badgeText, isOwn ? mopS.badgeTextOwn : mopS.badgeTextOther]}>недоступно</Text>
      </View>
    </View>
  );
};
const mopS = StyleSheet.create({
  wrap:           { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 4, paddingHorizontal: 2, minWidth: 160 },
  label:          { fontSize: 14, fontWeight: "500", flex: 1 },
  labelOwn:       { color: colors.text + "CC" },
  labelOther:     { color: colors.primary },
  badge:          { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  badgeOwn:       { backgroundColor: "rgba(255,255,255,0.12)" },
  badgeOther:     { backgroundColor: colors.primary + "12" },
  badgeText:      { fontSize: 10, fontWeight: "600" },
  badgeTextOwn:   { color: colors.text + "70" },
  badgeTextOther: { color: colors.primary + "55" },
});

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

const ImageMessage: React.FC<{ url: string; isOwn: boolean }> = React.memo(({ url, isOwn }) => {
  const { url: resolvedUrl } = useMediaUrl(url, "IMAGE");
  const [fullscreen, setFullscreen] = useState(false);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!resolvedUrl) return;
    Image.getSize(
      resolvedUrl,
      (w, h) => {
        const ratio = w / h;
        let width = MAX_MEDIA_W;
        let height = width / ratio;
        if (height > MAX_MEDIA_H) { height = MAX_MEDIA_H; width = height * ratio; }
        setSize({ width: Math.round(width), height: Math.round(height) });
      },
      () => setSize({ width: MAX_MEDIA_W, height: MAX_MEDIA_W * 0.75 }),
    );
  }, [resolvedUrl]);

  // Оффлайн и не кешировано
  if (!resolvedUrl) return <MediaOfflinePlaceholder type="IMAGE" isOwn={isOwn} />;

  const imgStyle = size
    ? { width: size.width, height: size.height, borderRadius: 12 }
    : { width: MAX_MEDIA_W, height: MAX_MEDIA_W * 0.75, borderRadius: 12 };

  return (
    <>
      <TouchableOpacity onPress={() => setFullscreen(true)} activeOpacity={0.92}>
        {size
          ? <Image source={{ uri: resolvedUrl }} style={imgStyle} resizeMode="cover" />
          : <View style={[imgStyle, { backgroundColor: colors.secondary + "40", alignItems: "center", justifyContent: "center" }]}>
              <ActivityIndicator color={colors.accent} />
            </View>}
      </TouchableOpacity>
      <Modal visible={fullscreen} transparent animationType="fade" onRequestClose={() => setFullscreen(false)} statusBarTranslucent>
        <View style={imS.backdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setFullscreen(false)} />
          <Image source={{ uri: resolvedUrl }} style={imS.fullImg} resizeMode="contain" />
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
  const { url: resolvedUrl } = useMediaUrl(url, "VIDEO");
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
        onPress={() => resolvedUrl && Linking.openURL(resolvedUrl)}
      >
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" }}>
          <Icon name="play" size={16} color="#fff" />
        </View>
        <Text style={{ fontSize: 14, color: isOwn ? colors.text : colors.primary, fontWeight: "500", flexShrink: 1 }}>Видео</Text>
      </TouchableOpacity>
    );
  }

  if (!resolvedUrl) return <MediaOfflinePlaceholder type="VIDEO" isOwn={isOwn} />;

  return (
    <>
      <View style={[vmS.container, { width: size.width, height: size.height }]}>
        <VideoPlayer
          ref={videoRef}
          source={{ uri: resolvedUrl }}
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
            source={{ uri: resolvedUrl }}
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
  const { url: resolvedUrl } = useMediaUrl(url, "VOICE");
  const { playing, currentTime, duration, loading, handlePlayPause, fmtSec, audioNode, progressAnim } = useVideoAudioPlayer(resolvedUrl ?? "", { type: "VOICE", title: "Голосовое сообщение" });
  const gp = useGlobalPlayer();

  const [cachedDur, setCachedDur] = useState(() => gp.durationCache.current[url] ?? 0);
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

  const [playedCount, setPlayedCount] = useState(0);
  useEffect(() => {
    const id = progressAnim.addListener(({ value }) => {
      setPlayedCount(Math.floor(value * WAVEFORM_BARS));
    });
    return () => progressAnim.removeListener(id);
  }, [progressAnim]);

  if (!resolvedUrl) return <MediaOfflinePlaceholder type="VOICE" isOwn={isOwn} />;

  return (
    <View style={amS.row}>
      {audioNode}
      <DurationPrefetcher url={resolvedUrl} onReady={handlePrefetchReady} />
      <TouchableOpacity style={amS.playBtn} onPress={handlePlayPause} activeOpacity={0.8} disabled={loading}>
        {loading
          ? <ActivityIndicator size="small" color={colors.accent} />
          : <Icon name={playing ? "pause" : "play"} size={16} color={colors.accent} style={playing ? {} : { marginLeft: 2 }} />}
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
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.secondary + "60",
    borderWidth: 1.5, borderColor: colors.accent + "90",
    alignItems: "center", justifyContent: "center",
  },
  waveWrap: { flex: 1, gap: 5 },
  wave: { flexDirection: "row", alignItems: "center", gap: 2, height: 32 },
  bar: { width: 3, borderRadius: 2 },
  barIdle:      { backgroundColor: colors.primary + "40" },
  barIdleOwn:   { backgroundColor: colors.primary + "50" },
  barPlayed:    { backgroundColor: colors.accent },
  barPlayedOwn: { backgroundColor: colors.accent + "DD" },
  timer: { fontSize: 11, color: colors.primary + "60", fontVariant: ["tabular-nums"] },
  timerOwn: { color: colors.primary + "80" },
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
  const { url: resolvedUrl } = useMediaUrl(url, "MUSIC");
  const { playing, currentTime, duration, loading, handlePlayPause, seek, fmtSec, audioNode, progressAnim } = useVideoAudioPlayer(resolvedUrl ?? "", { type: "MUSIC", title, artist, coverUrl });
  const gp = useGlobalPlayer();

  const [cachedDur, setCachedDur] = useState(() => gp.durationCache.current[url] ?? 0);
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

  if (!resolvedUrl) return <MediaOfflinePlaceholder type="MUSIC" isOwn={isOwn} />;

  return (
    <View style={muS.card}>
      {audioNode}
      <DurationPrefetcher url={resolvedUrl} onReady={handlePrefetchReady} />
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




// ══════════════════════════════════════════════════════════════════════════════
// CircleVideoMessage — видео-кружок как в Telegram (VIDEO_NOTE)
// ══════════════════════════════════════════════════════════════════════════════
const CIRCLE_MSG_SIZE = 200;

const CircleVideoMessage: React.FC<{ url: string; isOwn: boolean; inView?: boolean }> = React.memo(({ url, isOwn, inView = true }) => {

  const { url: resolvedUrl } = useMediaUrl(url, "VIDEO");
  const [muted, setMuted]       = useState(true);
  const [paused, setPaused]     = useState(false); // автовоспроизведение как VideoMessage
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef    = useRef<any>(null);
  const prevInView  = useRef(inView);
  const deregRef    = useRef<(() => void) | null>(null);
  const gp          = useGlobalPlayer();

  const fmtSec = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;

  // Автопауза когда уходит из видимой области (как у VideoMessage)
  useEffect(() => {
    if (!inView && prevInView.current) {
      setPaused(true);
      setMuted(true);
      deregRef.current?.();
      deregRef.current = null;
      videoRef.current?.seek(0);
      setProgress(0);
    }
    if (inView && !prevInView.current) {
      setPaused(false);
    }
    prevInView.current = inView;
  }, [inView]);

  // Если глобальный аудио-плеер запустился — глушим
  useEffect(() => {
    if (gp.playing && !muted) {
      setMuted(true);
      deregRef.current?.();
      deregRef.current = null;
    }
  }, [gp.playing]);

  // Тап — переключить звук (как VideoMessage)
  const handlePress = useCallback(() => {
    if (paused) {
      // Был на паузе — возобновить без звука
      setPaused(false);
      return;
    }
    if (muted) {
      if (!gp.playing) {
        setMuted(false);
        deregRef.current?.();
        deregRef.current = GlobalAudio.register(() => setMuted(true));
      }
    } else {
      setMuted(true);
      deregRef.current?.();
      deregRef.current = null;
    }
  }, [paused, muted, gp.playing]);

  const onLoad = useCallback((data: any) => {
    setDuration(data.duration ?? 0);
  }, []);

  const onProgress = useCallback((data: any) => {
    if (duration > 0) setProgress(data.currentTime / duration);
  }, [duration]);

  const onEnd = useCallback(() => {
    setPaused(true);
    setMuted(true);
    setProgress(0);
    deregRef.current?.();
    deregRef.current = null;
    videoRef.current?.seek(0);
  }, []);

  if (!resolvedUrl) return <MediaOfflinePlaceholder type="VIDEO" isOwn={isOwn} />;

  const strokeColor = isOwn ? colors.text : colors.accent;

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.92} style={[cvS.wrap, isOwn ? cvS.wrapOwn : cvS.wrapOther]}>
      {/* Прогресс-кольцо */}
      <View style={[cvS.ring, { borderColor: !paused ? strokeColor : colors.primary + "30" }]}>
        <View style={cvS.circle}>
          {VideoPlayer ? (
            // Двойной overflow:hidden — внешний View гарантирует обрезку на Android
            // где react-native-video игнорирует overflow родителя
            <View style={{
              width: CIRCLE_MSG_SIZE,
              height: CIRCLE_MSG_SIZE,
              borderRadius: 16,
              overflow: "hidden",
              position: "absolute",
              top: 0, left: 0,
            }}>
              <VideoPlayer
                ref={videoRef}
                source={{ uri: resolvedUrl }}
                style={{
                  position: "absolute",
                  top: 0, left: 0,
                  width: CIRCLE_MSG_SIZE,
                  height: CIRCLE_MSG_SIZE,
                }}
                paused={paused}
                resizeMode="cover"
                repeat={false}
                muted={muted}
                onLoad={onLoad}
                onProgress={onProgress}
                onEnd={onEnd}
              />
            </View>
          ) : (
            <View style={cvS.placeholder}>
              <Icon name="video" size={32} color={colors.text + "80"} />
            </View>
          )}
          {/* Иконка состояния — пауза или без звука */}
          {paused && (
            <View style={cvS.playOverlay}>
              <View style={cvS.playBtn}>
                <Icon name="play" size={22} color="#fff" style={{ marginLeft: 3 }} />
              </View>
            </View>
          )}
          {!paused && muted && (
            <View style={cvS.muteIndicator}>
              <Icon name="volume-x" size={12} color="#fff" />
            </View>
          )}
          {/* Таймер */}
          <View style={cvS.timerWrap}>
            <Text style={cvS.timer}>
              {duration > 0
                ? (paused && progress === 0 ? fmtSec(duration) : fmtSec(progress * duration))
                : ""}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

const cvS = StyleSheet.create({
  wrap:      { width: CIRCLE_MSG_SIZE + 11, height: CIRCLE_MSG_SIZE + 11 },
  wrapOwn:   {},
  wrapOther: {},
  ring: {
    width:  CIRCLE_MSG_SIZE + 11,
    height: CIRCLE_MSG_SIZE + 11,
    borderRadius: 20,
    borderWidth: 2.5,
    borderColor: colors.primary + "30",
    padding: 2.5,
    alignItems: "center",
    justifyContent: "center",
  },
  circle: {
    width: CIRCLE_MSG_SIZE,
    height: CIRCLE_MSG_SIZE,
    borderRadius: 16,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },
  video: {
    width: CIRCLE_MSG_SIZE,
    height: CIRCLE_MSG_SIZE,
  },
  placeholder: { alignItems: "center", justifyContent: "center", flex: 1 },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  playBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: "rgba(0,0,0,0.50)",
    alignItems: "center", justifyContent: "center",
  },
  muteIndicator: {
    position: "absolute", bottom: 10, left: 10,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.50)",
    alignItems: "center", justifyContent: "center",
  },
  timerWrap: {
    position: "absolute", bottom: 10,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  timer: { fontSize: 12, color: "#fff", fontVariant: ["tabular-nums"], fontWeight: "600" },
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
        return url ? <ImageMessage url={url} isOwn={isOwn} /> : <Text style={[bS.text, isOwn && bS.textOwn]}>🖼 Фото</Text>;
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
      {(message.type as any) === "VIDEO_NOTE" ? (
        // ── Кружок — полностью изолированный рендер ──────────────────────────
        <View style={[
          bS.rowCircleWrap,
          isOwn ? bS.rowCircleWrapOwn : bS.rowCircleWrapOther,
          { backgroundColor: rowBg as any },
        ]}>
          <CircleVideoMessage url={(message as any).mediaUrl ?? message.content ?? ""} isOwn={isOwn} inView={inView} />
          <View style={[bS.metaCircle, isOwn ? bS.metaCircleOwn : bS.metaCircleOther]}>
            {isEdited && <Text style={[bS.edited, isOwn && bS.editedOwn]}>изм.</Text>}
            <Text style={[bS.time, isOwn && bS.timeOwn]}>{time}</Text>
            {isOwn && <MessageStatus message={message} isOwn={isOwn} />}
          </View>
        </View>
      ) : (
        <Animated.View style={[
          bS.row,
          isOwn ? bS.rowOwn : bS.rowOther,
          { backgroundColor: rowBg },
        ]}>
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
              {message.type === "TEXT" ? (
                <View style={bS.textWrap}>
                  <Text style={[bS.text, isOwn && bS.textOwn]}>
                    {message.content ?? ""}
                    {"  "}
                  </Text>
                  <View style={[bS.metaInline, isOwn && bS.metaInlineOwn]}>
                    {isEdited && <Text style={[bS.edited, isOwn && bS.editedOwn]}>изм.</Text>}
                    <Text style={[bS.time, isOwn && bS.timeOwn]}>{time}</Text>
                    {isOwn && <MessageStatus message={message} isOwn={isOwn} />}
                  </View>
                </View>
              ) : (
                <>
                  {renderContent()}
                  <View style={[bS.meta, (message.type === "IMAGE" || message.type === "VIDEO") && bS.metaOnMedia]}>
                    {isEdited && <Text style={[bS.edited, isOwn && bS.editedOwn]}>изм.</Text>}
                    <Text style={[bS.time, isOwn && bS.timeOwn, (message.type === "IMAGE" || message.type === "VIDEO") && bS.timeOnMedia]}>{time}</Text>
                    {isOwn && <MessageStatus message={message} isOwn={isOwn} />}
                  </View>
                </>
              )}
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
      )}
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

  const color = isRead
    ? colors.accent + "CC"
    : colors.primary + "70";

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
    width: 14, height: 14, position: "relative",
    alignItems: "center", justifyContent: "center",
  },
  // Кружок для прочитанного статуса
  circle: {
    position: "absolute",
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 1.5, borderColor: colors.accent + "CC",
  },
  // Две линии образуют X
  line: {
    position: "absolute",
    width: 7, height: 1.5, borderRadius: 1,
  },
  line1: { transform: [{ rotate: "45deg" }] },
  line2: { transform: [{ rotate: "-45deg" }] },
  // Тире для pending
  dash: {
    width: 8, height: 1.7, borderRadius: 1,
    backgroundColor: colors.primary + "60",
  },
});

const bS = StyleSheet.create({
  row: { flexDirection: "row", marginVertical: 2, paddingHorizontal: 12, alignItems: "flex-end" },
  rowOwn: { justifyContent: "flex-end" },
  rowOther: { justifyContent: "flex-start" },
  // Кружок — отдельная колонка, фиксированная ширина и высота, никакого overflow
  rowCircleWrap: {
    flexDirection: "column",
    paddingHorizontal: 12,
    paddingVertical: 30,
    minHeight: CIRCLE_MSG_SIZE + 11 + 24,
  },
  rowCircleWrapOwn:   { alignItems: "flex-end" },
  rowCircleWrapOther: { alignItems: "flex-start" },
  metaCircle: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, paddingHorizontal: 2 },
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
  colMediaOwn: { alignItems: "flex-end" },
  bubbleCircle: { backgroundColor: "transparent", marginBottom: 2 }, // кружок — без padding/border
  bubble: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, marginBottom: 2, overflow: "hidden" },
  bubbleOwn: { backgroundColor: "#3a2040", borderBottomRightRadius: 3, borderWidth: 0.5, borderColor: colors.secondary + "90" },
  bubbleOther: { backgroundColor: colors.secondary + "35", borderBottomLeftRadius: 3, borderWidth: 0.5, borderColor: colors.primary + "20" },
  bubbleMedia: { borderRadius: 14, marginBottom: 2, overflow: "hidden", backgroundColor: "transparent" },
  text: { fontSize: 15, color: colors.primary, lineHeight: 21, paddingHorizontal: 2 },
  textOwn: { color: colors.text },
  textWrap: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end" },
  metaInline: {
    flexDirection: "row", alignItems: "center", gap: 3,
    alignSelf: "flex-end", marginBottom: 1, marginLeft: 2,
  },
  metaInlineOwn: {},
  meta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 4, paddingHorizontal: 2 },
  time: { fontSize: 10, color: colors.primary + "60" },
  timeOwn: { color: colors.primary + "80" },
  edited: { fontSize: 10, color: colors.primary + "50", fontStyle: "italic" },
  editedOwn: { color: colors.primary + "60" },
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
  // Кружок — явные width+height чтобы Android правильно считал высоту строки
  circleCol:     { alignItems: "flex-start",  width: CIRCLE_MSG_SIZE + 11, alignSelf: "flex-start" },
  circleColOwn:  { alignItems: "flex-end",    width: CIRCLE_MSG_SIZE + 11, alignSelf: "flex-end"   },
  metaCircleOwn:   { justifyContent: "flex-end",  width: CIRCLE_MSG_SIZE + 11 },
  metaCircleOther: { justifyContent: "flex-start", width: CIRCLE_MSG_SIZE + 11 },
  reactChip: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.secondary + "40", borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: colors.primary + "25",
  },
  reactEmoji: { fontSize: 14 },
  reactCount: { fontSize: 11, color: colors.primary, marginLeft: 3, fontWeight: "600" },
});

// ══════════════════════════════════════════════════════════════════════════════
// MediaPickerSheet — Telegram-style: табы Галерея / Музыка / Документы
// ══════════════════════════════════════════════════════════════════════════════

// Lazy-load image-crop-picker
let ImageCropPicker: any = null;
try { ImageCropPicker = require("react-native-image-crop-picker"); } catch (_) {}

// Lazy-load CameraRoll для чтения галереи без открытия системного UI
let CameraRoll: any = null;
try { CameraRoll = require("@react-native-camera-roll/camera-roll").CameraRoll; } catch (_) {}

type GalleryPhoto = { uri: string; mime: string; size?: number; filename?: string; node?: any };
type MusicFile = { uri: string; name: string; size: number; path: string };
type DocFile   = { uri: string; name: string; size: number; path: string; ext: string };
type Tab = "gallery" | "music" | "files";

const GALLERY_COL = 3;
const GALLERY_CELL = Math.floor((SCREEN_W - 2) / GALLERY_COL);

// Форматируем размер файла
function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

// Иконка документа по расширению
function docIcon(ext: string): string {
  const e = ext.toLowerCase();
  if (/pdf/.test(e)) return "file-text";
  if (/docx?|odt/.test(e)) return "file-text";
  if (/xlsx?|csv|ods/.test(e)) return "grid";
  if (/pptx?|odp/.test(e)) return "monitor";
  if (/zip|rar|7z|tar|gz/.test(e)) return "package";
  if (/txt|md/.test(e)) return "align-left";
  return "paperclip";
}

const AUDIO_EXTS = /\.(mp3|m4a|aac|flac|ogg|opus|wav|wma|alac)$/i;
const DOC_EXTS   = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|csv|zip|rar|7z)$/i;

// Строим список папок динамически — надёжнее хардкода /sdcard/...
function getMusicDirs(): string[] {
  if (!RNFS) return [];
  const bases: string[] = [];
  try { if (RNFS.ExternalStorageDirectoryPath) bases.push(RNFS.ExternalStorageDirectoryPath); } catch {}
  bases.push("/storage/emulated/0", "/sdcard");
  const dirs: string[] = [];
  for (const b of bases) {
    dirs.push(`${b}/Music`, `${b}/music`, `${b}/Download`, `${b}/Downloads`, `${b}/MUSIC`, `${b}/Музыка`);
  }
  return [...new Set(dirs)];
}

function getDocDirs(): string[] {
  if (!RNFS) return [];
  const bases: string[] = [];
  try { if (RNFS.ExternalStorageDirectoryPath) bases.push(RNFS.ExternalStorageDirectoryPath); } catch {}
  bases.push("/storage/emulated/0", "/sdcard");
  const dirs: string[] = [];
  for (const b of bases) {
    dirs.push(`${b}/Download`, `${b}/Downloads`, `${b}/Documents`, `${b}/Document`, `${b}/Документы`);
  }
  return [...new Set(dirs)];
}

// Сканирует папку + 1 уровень подпапок (Artist/Album и т.д.)
async function scanDirs(dirs: string[], extRe: RegExp): Promise<{ path: string; name: string; size: number }[]> {
  if (!RNFS) return [];
  const results: { path: string; name: string; size: number }[] = [];

  const scanOne = async (dir: string, depth: number) => {
    try {
      const items = await RNFS.readDir(dir);
      for (const item of items) {
        if (item.isFile() && extRe.test(item.name)) {
          results.push({ path: item.path, name: item.name, size: Number(item.size) || 0 });
        } else if (!item.isFile() && depth < 1) {
          await scanOne(item.path, depth + 1);
        }
      }
    } catch {}
  };

  for (const dir of dirs) {
    try {
      const exists = await RNFS.exists(dir);
      if (!exists) continue;
      await scanOne(dir, 0);
    } catch {}
  }

  // Дедуп по полному пути
  const seen = new Set<string>();
  return results.filter((f) => { if (seen.has(f.path)) return false; seen.add(f.path); return true; });
}

const MediaPickerSheet: React.FC<{
  visible: boolean;
  onClose: () => void;
  onPick: (f: PickedFile) => void;
}> = ({ visible, onClose, onPick }) => {
  const slideY = useRef(new Animated.Value(500)).current;
  const [tab, setTab] = useState<Tab>("gallery");

  // ── Галерея ──────────────────────────────────────────────────────────────
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryLoaded, setGalleryLoaded] = useState(false);
  const [galleryCursor, setGalleryCursor] = useState<string | undefined>(undefined);
  const [galleryHasMore, setGalleryHasMore] = useState(true);

  // ── Музыка ───────────────────────────────────────────────────────────────
  const [musicFiles, setMusicFiles] = useState<MusicFile[]>([]);
  const [musicLoading, setMusicLoading] = useState(false);
  const [musicLoaded, setMusicLoaded] = useState(false);

  // ── Документы ────────────────────────────────────────────────────────────
  const [docFiles, setDocFiles] = useState<DocFile[]>([]);
  const [docLoading, setDocLoading] = useState(false);
  const [docLoaded, setDocLoaded] = useState(false);

  useEffect(() => {
    if (visible) {
      slideY.setValue(500);
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
      setTab("gallery");
      if (!galleryLoaded) loadGalleryPage();
    } else {
      Animated.timing(slideY, { toValue: 500, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible]);

  // Переключение таба — подгружаем данные лениво
  useEffect(() => {
    if (!visible) return;
    if (tab === "music" && !musicLoaded) loadMusic();
    if (tab === "files" && !docLoaded) loadDocs();
  }, [tab, visible]);

  // ── Запрос прав на медиа (Android 13+) ───────────────────────────────────
  const requestMediaPermissions = async (): Promise<boolean> => {
    if (Platform.OS !== "android") return true;
    try {
      const sdk = parseInt(Platform.Version as string, 10);
      if (sdk >= 33) {
        const res = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
          "android.permission.READ_MEDIA_VIDEO" as any,
        ]);
        return Object.values(res).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
      } else {
        const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
        return res === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch { return false; }
  };

  // ── Загрузка галереи через CameraRoll ────────────────────────────────────
  const loadGalleryPage = async (cursor?: string) => {
    if (galleryLoading) return;
    setGalleryLoading(true);
    try {
      await requestMediaPermissions();
      if (CameraRoll) {
        // @react-native-camera-roll/camera-roll — читает без UI
        const res = await CameraRoll.getPhotos({
          first: 60,
          after: cursor,
          assetType: "All",          // и фото, и видео
          include: ["filename", "fileSize", "fileExtension", "imageSize", "playableDuration"],
        });
        const newPhotos: GalleryPhoto[] = res.edges.map((e: any) => ({
          uri:      e.node.image.uri,
          mime:     e.node.type ?? "image/jpeg",
          size:     e.node.image.fileSize ?? 0,
          filename: e.node.image.filename ?? undefined,
          node:     e.node,
        }));
        setPhotos((prev) => cursor ? [...prev, ...newPhotos] : newPhotos);
        setGalleryCursor(res.page_info.has_next_page ? res.page_info.end_cursor : undefined);
        setGalleryHasMore(res.page_info.has_next_page);
        setGalleryLoaded(true);
      } else if (ImageCropPicker) {
        // Fallback — image-crop-picker (только изображения)
        const result = await launchImageLibrary({ mediaType: "mixed", selectionLimit: 0, includeExtra: true });
        const arr = result.assets ?? [];
        setPhotos(arr.map((a: any) => ({
          uri:      a.uri,
          mime:     a.type ?? "image/jpeg",
          size:     a.fileSize ?? 0,
          filename: a.fileName ?? undefined,
        })));
        setGalleryLoaded(true);
        setGalleryHasMore(false);
      } else {
        setGalleryLoaded(true);
        setGalleryHasMore(false);
      }
    } catch {
      setGalleryLoaded(true);
      setGalleryHasMore(false);
    } finally {
      setGalleryLoading(false);
    }
  };

  // ── Загрузка музыки через RNFS ────────────────────────────────────────────
  const loadMusic = async () => {
    setMusicLoading(true);
    try {
      // Android 13+ требует READ_MEDIA_AUDIO для доступа к аудиофайлам
      if (Platform.OS === "android") {
        const sdk = parseInt(Platform.Version as string, 10);
        if (sdk >= 33) {
          await PermissionsAndroid.request("android.permission.READ_MEDIA_AUDIO" as any);
        } else {
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
        }
      }
      const found = await scanDirs(getMusicDirs(), AUDIO_EXTS);
      setMusicFiles(found.map((f) => ({ uri: `file://${f.path}`, name: f.name, size: f.size, path: f.path })));
    } catch {}
    setMusicLoaded(true);
    setMusicLoading(false);
  };

  // ── Загрузка документов через RNFS ───────────────────────────────────────
  const loadDocs = async () => {
    setDocLoading(true);
    try {
      if (Platform.OS === "android") {
        const sdk = parseInt(Platform.Version as string, 10);
        if (sdk < 33) {
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
        }
      }
      const found = await scanDirs(getDocDirs(), DOC_EXTS);
      setDocFiles(found.map((f) => {
        const ext = f.name.split(".").pop() ?? "";
        return { uri: `file://${f.path}`, name: f.name, size: f.size, path: f.path, ext };
      }));
    } catch {}
    setDocLoaded(true);
    setDocLoading(false);
  };

  const checkSize = (size?: number | null) => {
    if (size && size > MAX_FILE_SIZE) { Alert.alert("Файл слишком большой", "Максимум 100 МБ"); return false; }
    return true;
  };

  const handleGalleryTap = (photo: GalleryPhoto) => {
    if (!checkSize(photo.size)) return;
    const isVideo = /video/i.test(photo.mime)
      || /\.(mp4|mov|avi|mkv|webm)$/i.test(photo.filename ?? "")
      || (photo.node?.type ?? "").startsWith("video");
    onPick({
      uri: photo.uri,
      name: photo.filename ?? `media_${Date.now()}`,
      type: photo.mime,
      mediaType: isVideo ? "VIDEO" : "IMAGE",
      size: photo.size ?? 0,
    });
    onClose();
  };

  const handleMusicTap = (f: MusicFile) => {
    if (!checkSize(f.size)) return;
    const ext = f.name.split(".").pop() ?? "";
    const isVoice = /wav|ogg|opus/.test(ext);
    onPick({ uri: f.uri, name: f.name, type: `audio/${ext || "mpeg"}`, mediaType: isVoice ? "VOICE" : "MUSIC", size: f.size });
    onClose();
  };

  const handleDocTap = (f: DocFile) => {
    if (!checkSize(f.size)) return;
    onPick({ uri: f.uri, name: f.name, type: `application/${f.ext || "octet-stream"}`, mediaType: "FILE", size: f.size });
    onClose();
  };

  // Камера — первая ячейка в галерее
  const openCamera = async () => {
    onClose();
    await new Promise((r) => setTimeout(r, 300));
    try {
      const r = await launchCamera({ mediaType: "photo", quality: 1, saveToPhotos: false });
      if (r.didCancel) return;
      const a = r.assets?.[0];
      if (!a?.uri) return;
      onPick({ uri: a.uri, name: a.fileName ?? `photo_${Date.now()}.jpg`, type: a.type ?? "image/jpeg", mediaType: "IMAGE", size: a.fileSize ?? 0 });
    } catch {}
  };

  // Системный файловый пикер — аудио
  const openAudio = async () => {
    onClose();
    await new Promise((r) => setTimeout(r, 300));
    try {
      const results = await pick({ type: ["audio/*"], allowMultiSelection: false });
      const r = results?.[0]; if (!r?.uri) return;
      const size = (r as any).size ?? 0; if (!checkSize(size)) return;
      const mime: string = (r as any).mimeType ?? r.type ?? "";
      const name: string = r.name ?? `audio_${Date.now()}`;
      const isVoice = /wav|ogg|webm|opus/i.test(mime) || /\.(wav|ogg|webm|opus)$/i.test(name);
      onPick({ uri: r.uri, name, type: mime || "audio/mpeg", mediaType: isVoice ? "VOICE" : "MUSIC", size });
    } catch {}
  };

  // Системный файловый пикер — любые файлы
  const openFile = async () => {
    onClose();
    await new Promise((r) => setTimeout(r, 300));
    try {
      const results = await pick({ type: ["*/*"], allowMultiSelection: false });
      const r = results?.[0]; if (!r?.uri) return;
      const size = (r as any).size ?? 0; if (!checkSize(size)) return;
      const mime: string = (r as any).mimeType ?? r.type ?? "application/octet-stream";
      const name: string = r.name ?? `file_${Date.now()}`;
      let mediaType: PickedFile["mediaType"] = "FILE";
      if (/^audio\//i.test(mime) || /\.(mp3|m4a|aac|flac|ogg|wav|opus|webm)$/i.test(name)) {
        mediaType = /wav|ogg|webm|opus/i.test(mime) ? "VOICE" : "MUSIC";
      }
      onPick({ uri: r.uri, name, type: mime, mediaType, size });
    } catch {}
  };

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "gallery", label: "Галерея", icon: "image" },
    { key: "music",   label: "Музыка",  icon: "music" },
    { key: "files",   label: "Файлы",   icon: "paperclip" },
  ];

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={mpS.backdrop} />
      </TouchableWithoutFeedback>

      <Animated.View style={[mpS.sheet, { transform: [{ translateY: slideY }] }]}>
        <View style={mpS.handle} />

        {/* ── Табы ─────────────────────────────────────────────── */}
        <View style={mpS.tabRow}>
          {tabs.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[mpS.tabBtn, tab === t.key && mpS.tabBtnActive]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.7}
            >
              <Icon name={t.icon as any} size={15} color={tab === t.key ? colors.accent : colors.primary + "70"} />
              <Text style={[mpS.tabLabel, tab === t.key && mpS.tabLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Галерея ───────────────────────────────────────────── */}
        {tab === "gallery" && (
          <>
            {galleryLoading && photos.length === 0 ? (
              <View style={mpS.center}><ActivityIndicator color={colors.accent} /></View>
            ) : (
              <FlatList
                data={[{ _camera: true } as any, ...photos]}
                keyExtractor={(_, i) => String(i)}
                numColumns={GALLERY_COL}
                scrollEnabled
                showsVerticalScrollIndicator={false}
                style={mpS.grid}
                columnWrapperStyle={{ gap: 1 }}
                ItemSeparatorComponent={() => <View style={{ height: 1 }} />}
                onEndReached={() => { if (galleryHasMore && galleryCursor && !galleryLoading) loadGalleryPage(galleryCursor); }}
                onEndReachedThreshold={0.4}
                ListFooterComponent={galleryLoading && photos.length > 0 ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 12 }} /> : null}
                renderItem={({ item }) => {
                  if (item._camera) {
                    return (
                      <TouchableOpacity
                        style={[mpS.cell, mpS.cameraCell, { width: GALLERY_CELL, height: GALLERY_CELL }]}
                        onPress={openCamera}
                        activeOpacity={0.8}
                      >
                        <Icon name="camera" size={28} color={colors.primary + "80"} />
                        <Text style={mpS.cameraLabel}>Камера</Text>
                      </TouchableOpacity>
                    );
                  }
                  const isVideo = /video/i.test(item.mime)
                    || /\.(mp4|mov|avi|mkv|webm)$/i.test(item.filename ?? "")
                    || (item.node?.type ?? "").startsWith("video");
                  return (
                    <TouchableOpacity
                      style={[mpS.cell, { width: GALLERY_CELL, height: GALLERY_CELL }]}
                      onPress={() => handleGalleryTap(item)}
                      activeOpacity={0.82}
                    >
                      <Image source={{ uri: item.uri }} style={mpS.cellImg} resizeMode="cover" />
                      {isVideo && (
                        <View style={mpS.videoOverlay}>
                          <View style={mpS.videoIcon}>
                            <Icon name="play" size={11} color="#fff" />
                          </View>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View style={mpS.center}>
                    <Icon name="image" size={36} color={colors.primary + "30"} />
                    <Text style={mpS.emptyText}>Нет медиа</Text>
                  </View>
                }
              />
            )}
          </>
        )}

        {/* ── Музыка ────────────────────────────────────────────── */}
        {tab === "music" && (
          <>
            {musicLoading ? (
              <View style={mpS.center}><ActivityIndicator color={colors.accent} /></View>
            ) : musicFiles.length === 0 ? (
              <View style={mpS.center}>
                <View style={mpS.bigIconWrap}>
                  <Icon name="music" size={32} color={colors.accent} />
                </View>
                <Text style={mpS.emptyTitle}>Музыка не найдена</Text>
                <Text style={mpS.emptyText}>Выберите файл вручную</Text>
                <TouchableOpacity style={mpS.tabActionBtn} onPress={openAudio} activeOpacity={0.8}>
                  <Icon name="folder" size={16} color={colors.text} />
                  <Text style={mpS.tabActionBtnText}>Открыть файлы</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <FlatList
                data={musicFiles}
                keyExtractor={(f) => f.path}
                style={mpS.listFlex}
                showsVerticalScrollIndicator={false}
                ItemSeparatorComponent={() => <View style={mpS.separator} />}
                ListHeaderComponent={
                  <TouchableOpacity style={mpS.listHeader} onPress={openAudio} activeOpacity={0.8}>
                    <Icon name="folder" size={15} color={colors.accent} />
                    <Text style={mpS.listHeaderText}>Открыть другой файл...</Text>
                  </TouchableOpacity>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity style={mpS.listRow} onPress={() => handleMusicTap(item)} activeOpacity={0.75}>
                    <View style={mpS.listIconWrap}>
                      <Icon name="music" size={18} color={colors.accent} />
                    </View>
                    <View style={mpS.listTextCol}>
                      <Text style={mpS.listName} numberOfLines={1}>{item.name.replace(/\.[^.]+$/, "")}</Text>
                      <Text style={mpS.listSub}>{fmtSize(item.size)}</Text>
                    </View>
                    <Icon name="chevron-right" size={16} color={colors.primary + "40"} />
                  </TouchableOpacity>
                )}
              />
            )}
          </>
        )}

        {/* ── Документы / Файлы ─────────────────────────────────── */}
        {tab === "files" && (
          <>
            {docLoading ? (
              <View style={mpS.center}><ActivityIndicator color={colors.accent} /></View>
            ) : docFiles.length === 0 ? (
              <View style={mpS.center}>
                <View style={[mpS.bigIconWrap, { borderColor: "#d0aeff40" }]}>
                  <Icon name="paperclip" size={32} color="#d0aeff" />
                </View>
                <Text style={mpS.emptyTitle}>Файлы не найдены</Text>
                <Text style={mpS.emptyText}>Любой формат до 100 МБ</Text>
                <TouchableOpacity style={[mpS.tabActionBtn, { borderColor: "#d0aeff60" }]} onPress={openFile} activeOpacity={0.8}>
                  <Icon name="folder" size={16} color={colors.text} />
                  <Text style={mpS.tabActionBtnText}>Открыть файлы</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <FlatList
                data={docFiles}
                keyExtractor={(f) => f.path}
                style={mpS.listFlex}
                showsVerticalScrollIndicator={false}
                ItemSeparatorComponent={() => <View style={mpS.separator} />}
                ListHeaderComponent={
                  <TouchableOpacity style={mpS.listHeader} onPress={openFile} activeOpacity={0.8}>
                    <Icon name="folder" size={15} color="#d0aeff" />
                    <Text style={[mpS.listHeaderText, { color: "#d0aeff" }]}>Открыть все файлы...</Text>
                  </TouchableOpacity>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity style={mpS.listRow} onPress={() => handleDocTap(item)} activeOpacity={0.75}>
                    <View style={[mpS.listIconWrap, { backgroundColor: "#d0aeff15" }]}>
                      <Icon name={docIcon(item.ext) as any} size={18} color="#d0aeff" />
                    </View>
                    <View style={mpS.listTextCol}>
                      <Text style={mpS.listName} numberOfLines={1}>{item.name}</Text>
                      <Text style={mpS.listSub}>{item.ext.toUpperCase()}  •  {fmtSize(item.size)}</Text>
                    </View>
                    <Icon name="chevron-right" size={16} color={colors.primary + "40"} />
                  </TouchableOpacity>
                )}
              />
            )}
          </>
        )}

        <View style={{ height: Platform.OS === "ios" ? 28 : 10 }} />
      </Animated.View>
    </Modal>
  );
};
const mpS = StyleSheet.create({
  backdrop:  { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderTopWidth: 1, borderColor: colors.primary + "18",
    maxHeight: SCREEN_H * 0.75,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.primary + "35", alignSelf: "center", marginTop: 10, marginBottom: 10 },
  // Табы
  tabRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.primary + "15", marginBottom: 2 },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10 },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: colors.accent },
  tabLabel: { fontSize: 13, fontWeight: "600", color: colors.primary + "70" },
  tabLabelActive: { color: colors.accent },
  // Галерея
  grid: { flex: 1 },
  cell: { overflow: "hidden" },
  cellImg: { width: "100%", height: "100%" },
  cameraCell: { backgroundColor: colors.secondary + "30", alignItems: "center", justifyContent: "center", gap: 6 },
  cameraLabel: { fontSize: 11, color: colors.primary + "70", fontWeight: "600" },
  videoOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.15)", justifyContent: "flex-end", alignItems: "flex-start", padding: 4 },
  videoIcon: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center",
  },
  // Пустые состояния
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 40 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  emptyText: { fontSize: 13, color: colors.primary + "50" },
  bigIconWrap: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: colors.secondary + "40", borderWidth: 1, borderColor: colors.primary + "20",
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  tabActionBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginTop: 8, paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 14, backgroundColor: colors.accent + "18",
    borderWidth: 1.5, borderColor: colors.accent + "50",
  },
  tabActionBtnText: { fontSize: 14, fontWeight: "700", color: colors.text },
  // Список музыки / документов
  listFlex: { flex: 1 },
  separator: { height: 1, backgroundColor: colors.primary + "0C", marginLeft: 64 },
  listHeader: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.primary + "12",
  },
  listHeaderText: { fontSize: 14, fontWeight: "600", color: colors.accent },
  listRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  listIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: colors.accent + "15",
    alignItems: "center", justifyContent: "center",
  },
  listTextCol: { flex: 1 },
  listName: { fontSize: 14, fontWeight: "600", color: colors.text },
  listSub:  { fontSize: 12, color: colors.primary + "55", marginTop: 2 },
  // Старые — нужны чтобы TS не ругался (openGalleryBtn/Text больше не нужны)
  openGalleryBtn: {},
  openGalleryText: {},
  tabActionTitle: {},
  tabActionSub: {},
});

// ══════════════════════════════════════════════════════════════════════════════
// AudioRecordingOverlay — два режима:
//   обычный: зажата кнопка — таймер + "сдвиньте влево" + fade-отмена
//   залоченный: палец отпущен, запись продолжается — таймер + "Отмена" + "Отправить"
// ══════════════════════════════════════════════════════════════════════════════
const AudioRecordingOverlay: React.FC<{
  visible: boolean;
  duration: number;
  slideX: Animated.Value;
  isLocked: boolean;
  onCancel: () => void;
  onSend: () => void;
}> = ({ visible, duration, slideX, isLocked, onCancel, onSend }) => {
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

  // ── Залоченный режим: кнопки Отмена / Отправить ──────────────────────────
  if (isLocked) {
    return (
      <View style={[recS.overlay, recS.overlayLocked]} pointerEvents="box-none">
        <TouchableOpacity style={recS.lockedCancel} onPress={onCancel} activeOpacity={0.8}>
          <Icon name="trash-2" size={16} color="#ff453a" />
        </TouchableOpacity>
        <View style={recS.left}>
          <View style={recS.dotWrap}>
            <Animated.View style={[recS.dotRipple, { transform: [{ scale: pulseAnim }] }]} />
            <View style={recS.redDot} />
          </View>
          <Text style={recS.timer}>{formatDuration(duration)}</Text>
        </View>
        <View style={recS.lockedLock}>
          <Icon name="lock" size={14} color={colors.accent} />
          <Text style={recS.lockedLockText}>Заперто</Text>
        </View>
      </View>
    );
  }

  // ── Обычный режим: зажата кнопка ─────────────────────────────────────────
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
      <Animated.View style={[recS.slideHint, recS.lockHint, { opacity: arrowOpacity }]}>
        <Icon name="chevron-up" size={13} color={colors.primary + "40"} />
        <Text style={recS.lockText}>Зафикс.</Text>
      </Animated.View>
      <Animated.Text style={[recS.cancelLabel, { opacity: cancelOpacity }]} onPress={onCancel}>
        Отмена
      </Animated.Text>
    </View>
  );
};
const recS = StyleSheet.create({
  overlay: {
    // Абсолютный — покрывает весь inputBar (скрепка + inputWrap)
    // right: 44 — оставляем место для кнопки микрофона справа (она поверх через zIndex)
    position: "absolute", left: 0, right: 44, top: 0, bottom: 0,
    flexDirection: "row", alignItems: "center", paddingHorizontal: 12,
    backgroundColor: colors.background, zIndex: 10, gap: 4,
  },
  overlayLocked: { right: 0, paddingHorizontal: 14, gap: 8 },
  left: { flexDirection: "row", alignItems: "center", gap: 8 },
  dotWrap: { width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  dotRipple: { position: "absolute", width: 20, height: 20, borderRadius: 10, backgroundColor: "#ff453a44" },
  redDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#ff453a" },
  timer: { fontSize: 15, fontWeight: "600", color: colors.text, fontVariant: ["tabular-nums"] },
  slideHint: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2 },
  slideText: { fontSize: 12, color: colors.primary + "60" },
  lockHint:  { flex: 0, flexDirection: "column", alignItems: "center", gap: 1, marginRight: 2 },
  lockText:  { fontSize: 10, color: colors.primary + "40" },
  cancelLabel: { fontSize: 13, fontWeight: "600", color: "#ff453a" },
  // Залоченный режим
  lockedCancel: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "#ff453a18", alignItems: "center", justifyContent: "center",
  },
  lockedLock: { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: "auto" as any },
  lockedLockText: { fontSize: 12, color: colors.accent, fontWeight: "600" },
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
}> = ({ scaleAnim, isRecording, duration, hasPermission, cameraSlot, showFlipBtn, onFlip, onCancel, onStart, onStop }) => {
  // Пульсация кольца при записи
  const ringPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isRecording) { ringPulse.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(ringPulse, { toValue: 1.04, duration: 700, useNativeDriver: true }),
      Animated.timing(ringPulse, { toValue: 1,    duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [isRecording]);

  const MAX_DURATION = 60;
  const progress = Math.min(duration / MAX_DURATION, 1);

  return (
    <View style={crS.backdrop}>
      <Animated.View style={[crS.container, { transform: [{ scale: scaleAnim }] }]}>

        {/* Кружок с камерой */}
        <Animated.View style={[crS.ringOuter, isRecording && { transform: [{ scale: ringPulse }] }]}>
          {/* SVG-прогресс было бы лучше, но без зависимостей делаем через borderColor */}
          <View style={[
            crS.progressBorder,
            isRecording && { borderColor: colors.accent },
            !isRecording && { borderColor: colors.primary + "30" },
          ]}>
            <View
              style={[crS.circle, { width: CIRCLE_SIZE, height: CIRCLE_SIZE, borderRadius: 20 }]}
            >
              {cameraSlot}
              {/* Таймер поверх кружка */}
              {isRecording && (
                <View style={crS.timerOverlay}>
                  <Text style={crS.durationBig}>{formatDuration(duration * 1000)}</Text>
                </View>
              )}
            </View>
          </View>
        </Animated.View>

        {/* Управление */}
        <View style={crS.controls}>
          {!isRecording ? (
            <>
              <Text style={crS.hint}>{hasPermission ? "Подготовка..." : "Ожидание разрешений..."}</Text>
              <View style={crS.btnRow}>
                <TouchableOpacity style={crS.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
                  <Icon name="x" size={22} color={colors.text} />
                </TouchableOpacity>
                {showFlipBtn && (
                  <TouchableOpacity style={crS.flipBtn} onPress={onFlip} activeOpacity={0.8}>
                    <Icon name="refresh-cw" size={18} color={colors.text} />
                  </TouchableOpacity>
                )}
              </View>
            </>
          ) : (
            <>
              <Text style={crS.hint}>Остановить и отправить</Text>
              <View style={crS.btnRow}>
                <TouchableOpacity style={crS.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
                  <Icon name="trash-2" size={20} color="#ff453a" />
                </TouchableOpacity>
                {showFlipBtn && (
                  <TouchableOpacity style={crS.flipBtn} onPress={onFlip} activeOpacity={0.8}>
                    <Icon name="refresh-cw" size={18} color={colors.text} />
                  </TouchableOpacity>
                )}
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
};

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
  const cancelledRef = useRef(false);

  // Хуки VisionCamera — вызываются безусловно, это нормально
  const device = useCameraDevice(useFrontCamera ? "front" : "back");
  const { hasPermission, requestPermission } = useCameraPermission();

  const MAX_DURATION = 60;

  useEffect(() => {
    if (!visible) return;
    cancelledRef.current = false;
    (async () => {
      if (!hasPermission) {
        await requestPermission();
        if (Platform.OS === "android") await requestCameraPermission();
      }
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }).start();
      // Небольшая задержка чтобы камера успела инициализироваться
      setTimeout(() => { handleStart(); }, 600);
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
    cancelledRef.current = true;
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
    if (isRecording) return; // уже идёт
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
          if (cancelledRef.current) { return; }
          const uri = video.path.startsWith("file://") ? video.path : `file://${video.path}`;
          if (!video.duration || video.duration < 0.5) { onClose(); return; }
          onSend({ uri, name: `circle_${Date.now()}.mp4`, type: "video/mp4", mediaType: "VIDEO_NOTE" as any, size: 0 });
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
    <Modal transparent animationType="fade" visible={visible} onRequestClose={handleCancel} statusBarTranslucent>
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
            <View style={{ width: CIRCLE_SIZE, height: CIRCLE_SIZE, borderRadius: 20, overflow: "hidden" }}>
              <Camera
                ref={cameraRef}
                style={{
                  position: "absolute",
                  // Камера пишет 16:9 — чтобы превью выглядело как кружок,
                  // делаем view шире/выше чем нужно и центрируем
                  width: CIRCLE_SIZE,
                  height: CIRCLE_SIZE,
                  top: 0,
                  left: 0,
                }}
                device={device}
                isActive={visible}
                video
                audio
                // Низкое разрешение = меньше файл, быстрее загрузка
                videoQualityPreset="medium"
              />
            </View>
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
  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const MAX_DURATION = 60;

  useEffect(() => {
    if (!visible) return;
    requestCameraPermission().then((granted) => {
      setHasPermission(granted);
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }).start();
      // Автостарт после небольшой задержки (анимация открытия)
      if (granted) setTimeout(() => { handleStart(); }, 400);
    });
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      scaleAnim.setValue(0.8);
      setIsRecording(false);
      setDuration(0);
      progressAnim.setValue(0);
      if (timerRef.current) clearInterval(timerRef.current);
      progressAnimRef.current?.stop();
    }
  }, [visible]);

  const handleCancel = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    progressAnimRef.current?.stop();
    progressAnim.setValue(0);
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
    setDuration(0);
    progressAnim.setValue(0);
    // Анимируем прогресс-кольцо за MAX_DURATION секунд
    progressAnimRef.current = Animated.timing(progressAnim, {
      toValue: 1,
      duration: MAX_DURATION * 1000,
      useNativeDriver: false,
    });
    progressAnimRef.current.start();
    timerRef.current = setInterval(() => setDuration((d) => {
      if (d + 1 >= MAX_DURATION) { handleStop(); }
      return d + 1;
    }), 1000);
    try {
      // Запускаем системную камеру для видео — она сама управляет записью
      const r = await launchCamera({ mediaType: "video", videoQuality: "high", durationLimit: MAX_DURATION });
      if (timerRef.current) clearInterval(timerRef.current);
      progressAnimRef.current?.stop();
      setIsRecording(false);
      if (r.didCancel) { onClose(); return; }
      const a = r.assets?.[0];
      if (!a?.uri) { onClose(); return; }
      if ((a.fileSize ?? 0) > MAX_FILE_SIZE) {
        Alert.alert("Файл слишком большой", "Максимальный размер — 100 МБ");
        onClose();
        return;
      }
      onSend({ uri: a.uri, name: a.fileName ?? `circle_${Date.now()}.mp4`, type: a.type ?? "video/mp4", mediaType: "VIDEO_NOTE" as any, size: a.fileSize ?? 0 });
      onClose();
    } catch (_) {
      if (timerRef.current) clearInterval(timerRef.current);
      progressAnimRef.current?.stop();
      setIsRecording(false);
      onClose();
    }
  }, [hasPermission, onClose, onSend]);

  const handleStop = useCallback(() => {
    // Для fallback-режима через launchCamera остановка происходит нажатием кнопки в системной камере.
    // Эта кнопка нужна для UX — подсказывает что надо остановить в системной камере.
    if (timerRef.current) clearInterval(timerRef.current);
    progressAnimRef.current?.stop();
  }, []);

  if (!visible) return null;

  const progressDeg = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={handleCancel} statusBarTranslucent>
      <CircleModalUI
        scaleAnim={scaleAnim}
        isRecording={isRecording}
        duration={duration}
        hasPermission={hasPermission}
        showFlipBtn={false}
        onCancel={handleCancel}
        onStart={handleStart}
        onStop={handleStop}
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
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center", alignItems: "center" },
  container: { alignItems: "center", gap: 36 },
  ringOuter: { alignItems: "center", justifyContent: "center" },
  progressBorder: {
    padding: 4,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: colors.accent,
    overflow: "hidden",
  },
  circle: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.85)",
    borderRadius: 20,
  },
  cameraFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  cameraClip: { overflow: "hidden", position: "absolute", top: 0, left: 0 },
  innerCircle: { alignItems: "center", justifyContent: "center", flex: 1, gap: 12 },
  timerOverlay: {
    position: "absolute",
    bottom: 14,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.60)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  durationBig: { fontSize: 18, fontWeight: "700", color: "#fff", fontVariant: ["tabular-nums"] },
  controls: { alignItems: "center", gap: 14 },
  hint: { fontSize: 14, color: colors.primary + "90", textAlign: "center" },
  btnRow: { flexDirection: "row", gap: 22, alignItems: "center" },
  cancelBtn: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: colors.secondary + "60", borderWidth: 1, borderColor: colors.primary + "20",
    alignItems: "center", justifyContent: "center",
  },
  flipBtn: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: colors.secondary + "50", borderWidth: 1, borderColor: colors.primary + "20",
    alignItems: "center", justifyContent: "center",
  },
  recordBtn: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: "#ff453a",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#ff453a", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55, shadowRadius: 14, elevation: 10,
  },
  recordBtnDisabled: { backgroundColor: "#ff453a55", shadowOpacity: 0, elevation: 0 },
  recordDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#fff" },
  stopBtn: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accent,
    alignItems: "center", justifyContent: "center",
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55, shadowRadius: 14, elevation: 10,
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// RightActionButton
// ══════════════════════════════════════════════════════════════════════════════
// Telegram-style:
//   • audio-режим: зажал → запись, потянул влево → отмена, потянул вверх → лок
//   • circle-режим: тап → открыть модал записи кружка
//   • короткий тап в audio-режиме: переключить audio ↔ circle
// ══════════════════════════════════════════════════════════════════════════════
interface RightBtnProps {
  mode: "send" | "mic";
  micSubMode: "audio" | "circle";
  uploading: boolean;
  onSend: () => void;
  onMicPress: () => void;
  onMicLongPressIn: (forCircle?: boolean) => void;
  onOpenCircle: () => void;
  onMicLongPressOut: (cancelled: boolean, locked: boolean) => void;
  onMicLock: () => void;
  slideX: Animated.Value;
  isRecording: boolean;
  isLocked: boolean;
}

const CANCEL_THRESHOLD = -80;  // px влево → отмена
const LOCK_THRESHOLD   = -60;  // px вверх → лок

const RightActionButton: React.FC<RightBtnProps> = ({
  mode, micSubMode, uploading, onSend,
  onMicPress, onMicLongPressIn, onOpenCircle, onMicLongPressOut, onMicLock,
  slideX, isRecording, isLocked,
}) => {
  const scaleAnim    = useRef(new Animated.Value(1)).current;
  const rippleAnim   = useRef(new Animated.Value(0)).current;
  const btnScaleAnim = useRef(new Animated.Value(1)).current;
  const prevKey      = useRef(`${mode}-${micSubMode}`);

  // Анимация смены иконки
  useEffect(() => {
    const key = `${mode}-${micSubMode}`;
    if (prevKey.current !== key) {
      prevKey.current = key;
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 0.65, duration: 75, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 220, friction: 8 }),
      ]).start();
    }
  }, [mode, micSubMode]);

  // Разрастание кнопки при записи
  useEffect(() => {
    Animated.spring(btnScaleAnim, {
      toValue: isRecording ? 1.25 : 1,
      useNativeDriver: true,
      tension: 120,
      friction: 8,
    }).start();
  }, [isRecording]);

  // Ref чтобы PanResponder видел актуальные значения без пересоздания
  const modeRef         = useRef(mode);
  const micSubModeRef   = useRef(micSubMode);
  const isLockedRef     = useRef(isLocked);
  const onOpenCircleRef = useRef(onOpenCircle);
  const onMicPressRef   = useRef(onMicPress);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { micSubModeRef.current = micSubMode; }, [micSubMode]);
  useEffect(() => { isLockedRef.current = isLocked; }, [isLocked]);
  useEffect(() => { onOpenCircleRef.current = onOpenCircle; }, [onOpenCircle]);
  useEffect(() => { onMicPressRef.current = onMicPress; }, [onMicPress]);

  const pressStartTime   = useRef(0);
  const gestureActive    = useRef(false);
  const lockedRef        = useRef(false);
  const recordingStarted = useRef(false);
  const holdTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  const HOLD_DELAY = 600; // мс удержания для запуска записи

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder:        () => modeRef.current === "mic",
      onStartShouldSetPanResponderCapture: () => modeRef.current === "mic",
      onMoveShouldSetPanResponder:         () => modeRef.current === "mic" && recordingStarted.current,
      onMoveShouldSetPanResponderCapture:  () => modeRef.current === "mic" && recordingStarted.current,

      onPanResponderGrant: () => {
        pressStartTime.current   = Date.now();
        gestureActive.current    = true;
        lockedRef.current        = false;
        recordingStarted.current = false;

        // Через HOLD_DELAY — запускаем запись или открываем кружок
        holdTimerRef.current = setTimeout(() => {
          if (!gestureActive.current) return;
          recordingStarted.current = true;

          if (micSubModeRef.current === "circle") {
            // Зажали в circle-режиме → открыть модал кружка
            onOpenCircleRef.current();
          } else {
            // Зажали в audio-режиме → начать запись голосового
            onMicLongPressIn();
            Animated.spring(rippleAnim, { toValue: 1, useNativeDriver: false, tension: 80, friction: 10 }).start();
          }
        }, HOLD_DELAY);
      },

      onPanResponderMove: (_, gs) => {
        if (!recordingStarted.current) return;
        if (micSubModeRef.current === "circle") return;
        if (lockedRef.current) return;

        if (gs.dx < 0) slideX.setValue(Math.max(gs.dx, -140));

        if (gs.dy < LOCK_THRESHOLD && !lockedRef.current) {
          lockedRef.current = true;
          slideX.setValue(0);
          Animated.timing(rippleAnim, { toValue: 0, duration: 150, useNativeDriver: false }).start();
          onMicLock();
        }
      },

      onPanResponderRelease: (_, gs) => {
        if (!gestureActive.current) return;
        gestureActive.current = false;

        if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
        }

        Animated.timing(rippleAnim, { toValue: 0, duration: 150, useNativeDriver: false }).start();

        if (!recordingStarted.current) {
          // Палец отпущен до HOLD_DELAY — это просто тап → переключить режим
          slideX.setValue(0);
          onMicPressRef.current();
          return;
        }

        // Запись была запущена
        if (micSubModeRef.current === "circle") return; // модал сам управляет собой

        if (lockedRef.current) return; // залочено — управляет оверлей

        const cancelled = gs.dx < CANCEL_THRESHOLD;
        slideX.setValue(0);
        onMicLongPressOut(cancelled, false);
      },

      onPanResponderTerminate: () => {
        if (!gestureActive.current) return;
        gestureActive.current = false;

        if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
        }

        rippleAnim.setValue(0);
        slideX.setValue(0);

        if (recordingStarted.current && micSubModeRef.current !== "circle" && !lockedRef.current) {
          onMicLongPressOut(true, false);
        }
        recordingStarted.current = false;
      },
    })
  ).current;

  const rippleSize    = rippleAnim.interpolate({ inputRange: [0, 1], outputRange: [36, 64] });
  const rippleOpacity = rippleAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.28] });

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

  const iconName    = micSubMode === "audio" ? "mic" : "video";
  const btnColor    = micSubMode === "audio" ? colors.secondary + "60" : colors.accent + "30";
  const iconColor   = micSubMode === "audio" ? colors.text : colors.accent;
  const borderColor = micSubMode === "audio" ? colors.primary + "25" : colors.accent + "60";

  return (
    <Animated.View
      style={[rbS.micWrap, { transform: [{ scale: Animated.multiply(scaleAnim, btnScaleAnim) }] }]}
      {...panResponder.panHandlers}
    >
      {/* Пульсирующий ореол при записи */}
      <Animated.View
        style={[rbS.ripple, {
          width: rippleSize, height: rippleSize,
          borderRadius: 40, opacity: rippleOpacity,
          backgroundColor: micSubMode === "audio" ? "#ff453a" : colors.accent,
        }]}
        pointerEvents="none"
      />
      <Animated.View style={[rbS.btn, rbS.micBtn, { backgroundColor: btnColor, borderColor }]}>
        <Icon name={iconName} size={17} color={isRecording && micSubMode === "audio" ? "#ff453a" : iconColor} />
      </Animated.View>
    </Animated.View>
  );
};
const rbS = StyleSheet.create({
  btn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent,
    alignItems: "center", justifyContent: "center",
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4, elevation: 4,
  },
  micBtn: {
    backgroundColor: colors.secondary + "60", borderWidth: 1.5,
    borderColor: colors.primary + "25", shadowOpacity: 0, elevation: 0,
  },
  micWrap: { position: "relative", alignItems: "center", justifyContent: "center" },
  ripple:  { position: "absolute", backgroundColor: colors.accent },
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
  const [isRecordingLocked, setIsRecordingLocked] = useState(false);
  const isLockedRef = useRef(false); // ref-зеркало isRecordingLocked для использования в замыканиях
  const [audioDuration, setAudioDuration] = useState(0);
  const [circleModalVisible, setCircleModalVisible] = useState(false);
  const [micSubMode, setMicSubMode] = useState<"audio" | "circle">("audio");
  const audioSlideX = useRef(new Animated.Value(0)).current;
  const longPressActive = useRef(false);
  const audioDurationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRecordingCancelledRef = useRef(false);
  const audioRecordStartTimeRef = useRef(0);

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
    setMicSubMode((prev) => (prev === "audio" ? "circle" : "audio"));
  }, []);

  const handleMicLock = useCallback(() => {
    setIsRecordingLocked(true);
    isLockedRef.current = true;
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
      setIsRecordingLocked(false);
      isLockedRef.current = false;

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

  const handleMicLongPressIn = useCallback((forCircle?: boolean) => {
    if (forCircle || micSubMode === "circle") {
      setCircleModalVisible(true);
      return;
    }
    longPressActive.current = true;
    setIsRecordingLocked(false);
    isLockedRef.current = false;
    startAudioRecording();
  }, [micSubMode, startAudioRecording]);

  const handleMicLongPressOut = useCallback((cancelled: boolean, _locked: boolean) => {
    if (!longPressActive.current) return;
    longPressActive.current = false;

    // Залочено — пользователь отпустил палец, запись продолжается
    // её остановит кнопка отправки/отмены в AudioRecordingOverlay
    if (isLockedRef.current) return;

    if (cancelled) audioRecordingCancelledRef.current = true;
    stopAudioRecording(cancelled);
    audioSlideX.setValue(0);
  }, [stopAudioRecording, audioSlideX]);

  const handleCancelRecording = useCallback(() => {
    audioRecordingCancelledRef.current = true;
    longPressActive.current = false;
    setIsRecordingLocked(false);
    isLockedRef.current = false;
    stopAudioRecording(true);
    audioSlideX.setValue(0);
  }, [stopAudioRecording, audioSlideX]);

  const handleSendLocked = useCallback(() => {
    longPressActive.current = false;
    setIsRecordingLocked(false);
    isLockedRef.current = false;
    stopAudioRecording(false);
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

        <OfflineBanner />

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
              removeClippedSubviews={false}
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

                {isRecordingLocked ? (
                  // Залочено — показываем кнопку отправки
                  <TouchableOpacity style={s.sendLockedBtn} onPress={handleSendLocked} activeOpacity={0.85}>
                    <Icon name="send" size={15} color={colors.text} />
                  </TouchableOpacity>
                ) : (
                  <RightActionButton
                    mode={inputMode}
                    micSubMode={micSubMode}
                    uploading={uploading}
                    onSend={handleSend}
                    onMicPress={handleMicPress}
                    onMicLongPressIn={handleMicLongPressIn}
                    onOpenCircle={() => setCircleModalVisible(true)}
                    onMicLongPressOut={handleMicLongPressOut}
                    onMicLock={handleMicLock}
                    slideX={audioSlideX}
                    isRecording={isAudioRecording}
                    isLocked={isRecordingLocked}
                  />
                )}
              </>
            )}
            {/* Оверлей записи — поверх всего inputBar, включая скрепку */}
            {isAudioRecording && (
              <AudioRecordingOverlay
                visible={isAudioRecording}
                duration={audioDuration}
                slideX={audioSlideX}
                isLocked={isRecordingLocked}
                onCancel={handleCancelRecording}
                onSend={handleSendLocked}
              />
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
    paddingHorizontal: 8, paddingVertical: 4, paddingBottom: Platform.OS === "ios" ? 6 : 4,
    borderTopWidth: 1, borderTopColor: colors.primary + "12",
    backgroundColor: colors.background, gap: 5,
  },
  attachBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  sendLockedBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent,
    alignItems: "center", justifyContent: "center",
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 4,
  },
  selectActionBtn: {
    flex: 1, alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 6, paddingVertical: 6,
  },
  selectActionLabel: { fontSize: 15, fontWeight: "600" },
  inputWrap: {
    flex: 1, backgroundColor: colors.secondary + "30",
    borderRadius: 18, borderWidth: 1, borderColor: colors.primary + "20",
    paddingHorizontal: 12, paddingVertical: Platform.OS === "ios" ? 6 : 2,
    maxHeight: 90, minHeight: 32, justifyContent: "center", overflow: "hidden",
  },
  input: { color: colors.text, fontSize: 14, lineHeight: 18 },
  headerWrap: { position: "relative", overflow: "hidden", borderBottomWidth: 1, borderBottomColor: colors.primary + "15" },
  headerBanner: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  headerOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(17, 13, 22, 0.78)" },
  headerOverlayNoBanner: { backgroundColor: colors.background },
});

export default ChatScreen;