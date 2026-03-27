/**
 * GlobalPlayerContext
 *
 * Аудио-нод (react-native-video) живёт ВНУТРИ провайдера —
 * он не размонтируется при переходах между экранами.
 *
 * Компоненты AudioMessage / MusicMessage вызывают useGlobalPlayer()
 * и управляют воспроизведением через него.
 * При выходе из чата нод остаётся смонтированным → звук не прерывается.
 *
 * Оборачивай корень приложения:
 *   <GlobalPlayerProvider>
 *     <NavigationContainer>...</NavigationContainer>
 *   </GlobalPlayerProvider>
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Icon from "react-native-vector-icons/Feather";
import { colors } from "../styles/colors";

// ─── Lazy VideoPlayer ─────────────────────────────────────────────────────────
let VideoPlayer: any = null;
try { VideoPlayer = require("react-native-video").default; } catch (_) {}

// ─── Types ────────────────────────────────────────────────────────────────────
export type GlobalPlayerType = "VOICE" | "AUDIO" | "MUSIC";

export interface GlobalTrack {
  url: string;
  type: GlobalPlayerType;
  title?: string | null;
  artist?: string | null;
  coverUrl?: string | null;
}

interface GlobalPlayerCtx {
  track: GlobalTrack | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  loading: boolean;
  progressAnim: Animated.Value;

  play: (track: GlobalTrack) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  seek: (ratio: number) => void;
  isActive: (url: string) => boolean;
  /** Пауза из-за видео — запоминает что было playing */
  pauseForVideo: () => void;
  /** Возобновить после закрытия видео (только если играло до паузы) */
  resumeAfterVideo: () => void;
  /** Кеш длительностей: url → секунды (заполняется при первом воспроизведении) */
  durationCache: React.MutableRefObject<Record<string, number>>;
  /** Остановить плеер если активный трек совпадает с url (используется при удалении сообщения) */
  stopIfUrl: (url: string) => void;
}

const Ctx = createContext<GlobalPlayerCtx | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────
export const GlobalPlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [track, setTrack]       = useState<GlobalTrack | null>(null);
  const [playing, setPlaying]   = useState(false);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading]   = useState(false);
  const [displayTime, setDisplayTime] = useState(0);

  const videoRef       = useRef<any>(null);
  const durationRef    = useRef(0);
  const currentTimeRef = useRef(0);
  const scrubbingRef   = useRef(false);
  const scrubTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayTimer   = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressAnim   = useRef(new Animated.Value(0)).current;
  // Запоминаем состояние до паузы из-за видео
  const wasPlayingRef  = useRef(false);
  // Кеш длительностей url → секунды
  const durationCache  = useRef<Record<string, number>>({});

  useEffect(() => { durationRef.current = duration; }, [duration]);

  // Таймер отображения — обновляем 4 раза в секунду
  useEffect(() => {
    if (playing) {
      displayTimer.current = setInterval(() => {
        setDisplayTime(currentTimeRef.current);
      }, 250);
    } else {
      if (displayTimer.current) { clearInterval(displayTimer.current); displayTimer.current = null; }
    }
    return () => {
      if (displayTimer.current) { clearInterval(displayTimer.current); displayTimer.current = null; }
    };
  }, [playing]);

  const play = useCallback((newTrack: GlobalTrack) => {
    setTrack((prev) => {
      if (prev?.url === newTrack.url) {
        // Тот же трек — просто снимаем паузу
        setPlaying(true);
        return prev;
      }
      // Новый трек — сброс
      currentTimeRef.current = 0;
      setDisplayTime(0);
      progressAnim.setValue(0);
      durationRef.current = 0;
      setDuration(0);
      setLoading(true);
      setPlaying(true);
      return newTrack;
    });
  }, [progressAnim]);

  const pause  = useCallback(() => setPlaying(false), []);
  const resume = useCallback(() => setPlaying(true), []);

  const stop = useCallback(() => {
    setPlaying(false);
    setTrack(null);
    currentTimeRef.current = 0;
    setDisplayTime(0);
    progressAnim.setValue(0);
    durationRef.current = 0;
    setDuration(0);
  }, [progressAnim]);

  const seek = useCallback((ratio: number) => {
    const dur = durationRef.current;
    if (dur <= 0) return;
    const t = Math.max(0, Math.min(dur, ratio * dur));
    currentTimeRef.current = t;
    setDisplayTime(t);
    progressAnim.setValue(ratio);
    scrubbingRef.current = true;
    if (scrubTimer.current) clearTimeout(scrubTimer.current);
    scrubTimer.current = setTimeout(() => { scrubbingRef.current = false; }, 500);
    videoRef.current?.seek(t);
  }, [progressAnim]);

  const pauseForVideo = useCallback(() => {
    setPlaying((prev) => {
      wasPlayingRef.current = prev;
      return false;
    });
  }, []);

  const resumeAfterVideo = useCallback(() => {
    if (wasPlayingRef.current) {
      setPlaying(true);
      wasPlayingRef.current = false;
    }
  }, []);

  const stopIfUrl = useCallback((url: string) => {
    setTrack((prev) => {
      if (prev?.url === url) {
        // Останавливаем плеер — сбрасываем всё состояние
        setPlaying(false);
        currentTimeRef.current = 0;
        setDisplayTime(0);
        progressAnim.setValue(0);
        durationRef.current = 0;
        setDuration(0);
        return null;
      }
      return prev;
    });
  }, [progressAnim]);

  const isActive = useCallback((url: string) => track?.url === url, [track]);

  const onLoad = useCallback((data: any) => {
    const dur = data.duration ?? 0;
    if (dur > 0) {
      setDuration(dur);
      durationRef.current = dur;
      // Сохраняем в кеш по текущему URL
      setTrack((prev) => {
        if (prev?.url) durationCache.current[prev.url] = dur;
        return prev;
      });
    }
    setLoading(false);
  }, []);

  const onProgress = useCallback((data: any) => {
    if (scrubbingRef.current) return;
    const t = data.currentTime ?? 0;
    currentTimeRef.current = t;
    const dur = durationRef.current;
    if (dur > 0) progressAnim.setValue(t / dur);
  }, [progressAnim]);

  const onEnd = useCallback(() => {
    setPlaying(false);
    currentTimeRef.current = 0;
    setDisplayTime(0);
    progressAnim.setValue(0);
    videoRef.current?.seek(0);
  }, [progressAnim]);

  // Стабильная часть — меняется только при смене трека/состояния (не каждые 250мс)
  const ctx: GlobalPlayerCtx = useMemo(() => ({
    track, playing, currentTime: displayTime, duration, loading, progressAnim,
    play, pause, resume, stop, seek, isActive, pauseForVideo, resumeAfterVideo,
    durationCache, stopIfUrl,
  }), [track, playing, displayTime, duration, loading,
       play, pause, resume, stop, seek, isActive, pauseForVideo, resumeAfterVideo, durationCache, stopIfUrl]);

  return (
    <Ctx.Provider value={ctx}>
      {children}
      {/* Аудио-нод живёт здесь — не размонтируется при навигации */}
      {VideoPlayer && track ? (
        <VideoPlayer
          ref={videoRef}
          source={{ uri: track.url }}
          style={{ width: 0, height: 0, position: "absolute" }}
          paused={!playing}
          muted={false}
          onLoad={onLoad}
          onProgress={onProgress}
          onEnd={onEnd}
          progressUpdateInterval={100}
          audioOnly
          playInBackground
          ignoreSilentSwitch="ignore"
        />
      ) : null}
    </Ctx.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useGlobalPlayer(): GlobalPlayerCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useGlobalPlayer must be inside GlobalPlayerProvider");
  return ctx;
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmtSec(s: number): string {
  const sec = Math.floor(Math.max(0, s));
  return `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, "0")}`;
}

// ─── MiniPlayerBanner — вставляется в ChatsScreen над списком чатов ───────────

export const MiniPlayerBanner: React.FC = () => {
  const { track, playing, currentTime, duration, pause, resume, stop, progressAnim } = useGlobalPlayer();
  if (!track) return null;
  const isVoice = track.type === "VOICE" || track.type === "AUDIO";

  return (
    <View style={mb.container}>
      <View style={mb.coverWrap}>
        {track.coverUrl && !isVoice ? (
          <Image source={{ uri: track.coverUrl }} style={mb.cover} resizeMode="cover" />
        ) : (
          <View style={mb.coverPh}>
            <Icon name={isVoice ? "mic" : "music"} size={16} color={colors.accent + "CC"} />
          </View>
        )}
      </View>

      <View style={mb.info}>
        <Text style={mb.title} numberOfLines={1}>
          {track.title ?? (isVoice ? "Голосовое сообщение" : "Аудио")}
        </Text>
        {track.artist && !isVoice && (
          <Text style={mb.artist} numberOfLines={1}>{track.artist}</Text>
        )}
        <View style={mb.trackBg}>
          <Animated.View
            style={[mb.trackFill, {
              width: progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"],
              }) as any,
            }]}
          />
        </View>
        <Text style={mb.timer}>
          {fmtSec(currentTime)}{duration > 0 ? ` / ${fmtSec(duration)}` : ""}
        </Text>
      </View>

      <TouchableOpacity
        style={mb.btn}
        onPress={playing ? pause : resume}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Icon name={playing ? "pause" : "play"} size={18} color={colors.text} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[mb.btn, { marginLeft: 2 }]}
        onPress={stop}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Icon name="x" size={16} color={colors.primary + "80"} />
      </TouchableOpacity>
    </View>
  );
};

const mb = StyleSheet.create({
  container: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingVertical: 9,
    backgroundColor: colors.secondary + "40",
    borderBottomWidth: 1, borderBottomColor: colors.primary + "18",
  },
  coverWrap: { width: 36, height: 36 },
  cover:     { width: 36, height: 36, borderRadius: 8 },
  coverPh: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: colors.accent + "20", borderWidth: 1, borderColor: colors.accent + "40",
    alignItems: "center", justifyContent: "center",
  },
  info:      { flex: 1, gap: 2 },
  title:     { fontSize: 13, fontWeight: "600", color: colors.text },
  artist:    { fontSize: 11, color: colors.primary + "70" },
  trackBg:   { height: 3, borderRadius: 2, backgroundColor: colors.primary + "20", overflow: "hidden" },
  trackFill: { position: "absolute", top: 0, bottom: 0, left: 0, backgroundColor: colors.accent, borderRadius: 2 },
  timer:     { fontSize: 10, color: colors.primary + "55", fontVariant: ["tabular-nums"] as any },
  btn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: colors.secondary + "50", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.primary + "15",
  },
});