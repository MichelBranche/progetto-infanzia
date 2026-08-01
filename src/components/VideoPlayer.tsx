import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type MouseEvent } from "react";
import { isTauri } from "@tauri-apps/api/core";
import Hls, { type Level, type MediaPlaylist } from "hls.js";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { castTransport, getCastPosition, saveWatchProgress } from "../lib/api";
import {
  invalidateScStreamUrl,
  saveStreamingWatchProgress,
} from "../lib/addonsApi";
import { PlayerLoadingScreen } from "./PlayerLoadingScreen";
import { logCloudWatchEvent } from "../lib/cloudWatchSync";
import {
  endWatchSession,
  startAddonWatchSession,
  startWatchSession,
  updateWatchSession,
} from "../lib/parentalApi";
import { compareEpisodes, episodeCodeLabel, episodeDisplayTitle, nextEpisode, prevEpisode } from "../lib/browse";
import { useProfile } from "../context/ProfileContext";
import { useNotifications } from "../context/NotificationContext";
import { achievementUnlockNotifications } from "../lib/achievementNotifications";
import { useCloudAccount } from "../context/CloudAccountContext";
import { useAppAccess } from "../context/AppAccessContext";
import { useGuestPlaybackMeter } from "../hooks/useGuestPlaybackMeter";
import type { CastDevice, MediaItem } from "../types/media";
import { PosterImage } from "./PosterImage";
import { CastDialog } from "./CastDialog";
import { PlayerChromeShell } from "./PlayerChromeShell";
import {
  PlayerActionFeedback,
  type PlayerActionKind,
  type PlayerActionPulse,
} from "./PlayerActionFeedback";
import { WatchPartyPanel } from "./WatchPartyPanel";
import { useWatchPartySync, DRIFT_THRESHOLD_SEC } from "../hooks/useWatchPartySync";
import { closeCloudWatchParty } from "../lib/cloudWatchParty";
import { closeWatchParty } from "../lib/watchPartyApi";
import { useWatchPartyHost } from "../context/WatchPartyHostContext";
import { closeChatPopup } from "../lib/chatPopup";
import { WatchPartyChatDock } from "./WatchPartyChatDock";
import type { WatchPartySession } from "../types/watchParty";
import { parseRemoteProxyId } from "../lib/cast";
import {
  formatAudioTrackLabel,
  pickAudioTrackIndex,
} from "../lib/audioLanguage";
import {
  PLAYER_STREAM_AUDIO_OPTIONS,
  readPlayerAudioLanguage,
  savePlayerAudioLanguage,
  type PlayerStreamAudioLanguage,
} from "../lib/playerAudioLanguage";
import { normalizePlaybackUrl } from "../lib/streamUrl";

function formatPlayerClock(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}
/**
 * Messaggio d'errore leggibile ma diagnosticabile: l'utente deve poterlo
 * riferire e noi capire da dove arriva senza aprire la console.
 */
function describeHlsError(data: {
  type?: string;
  details?: string;
  response?: { code?: number };
}): string {
  const status = data.response?.code;
  const code = [data.details, status ? `HTTP ${status}` : null]
    .filter(Boolean)
    .join(" Â· ");
  if (status === 403) {
    return `Il server dei contenuti ha rifiutato la richiesta (${code}). Riprova: il link di streaming Ã¨ probabilmente scaduto.`;
  }
  if (status === 404 || status === 410) {
    return `Lo stream non Ã¨ piÃ¹ disponibile (${code}). Premi Riprova per rigenerarlo.`;
  }
  if (data.type === "networkError") {
    return `Errore di rete durante il caricamento del video (${code}). Controlla la connessione e riprova.`;
  }
  if (data.type === "mediaError") {
    return `Il video non puÃ² essere decodificato da questo dispositivo (${code}).`;
  }
  return `Impossibile avviare lo stream${code ? ` (${code})` : ""}. Riprova tra qualche secondo.`;
}

interface VideoPlayerProps {
  streamUrl: string;
  media: MediaItem;
  episodes?: MediaItem[];
  isHls?: boolean;
  isDash?: boolean;
  /** Proxy locale per licenza Widevine (Mediaset Infinity). */
  drmWidevineLicenseUrl?: string | null;
  remotePlayback?: {
    contentType: string;
    videoId: string;
    catalogPrefix?: string;
    titleId?: string;
    slug?: string;
    titleName?: string;
    episodeLabel?: string;
    poster?: string;
  };
  onBack: () => void | Promise<void>;
  onPlayEpisode?: (id: string) => void;
  watchPartySession?: WatchPartySession | null;
  onWatchPartySessionChange?: (session: WatchPartySession | null) => void;
  onStreamAudioLanguageChange?: (
    lang: PlayerStreamAudioLanguage,
  ) => void | Promise<void>;
  /** Primo frame / playback avviato: spegne la schermata di avvio del parent. */
  onReady?: () => void;
  /**
   * Ri-risolve lo stream da zero. Serve quando gli URL `/remote/...` non sono
   * più validi (riavvio app desktop o redeploy del server): la registry del
   * proxy è in memoria, quindi l'unico recupero è chiedere un nuovo URL.
   */
  onRetryStream?: () => void;
}

export interface VideoPlayerHandle {
  flushWatchProgress: () => Promise<void>;
}

/** Secondi prima della fine in cui mostrare "Continua a guardare" (5â€“10 min, ~12% runtime). */
function upNextLeadSeconds(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 90;
  const fromPercent = duration * 0.12;
  return Math.min(600, Math.max(300, fromPercent));
}

function episodeCode(ep: MediaItem) {
  return episodeCodeLabel(ep) ?? "";
}

interface QualityOption {
  level: number;
  label: string;
}

interface SubtitleOption {
  track: number;
  label: string;
}

interface AudioOption {
  track: number;
  label: string;
}

function qualityLabel(level: Level, index: number) {
  if (level.height) return `${level.height}p`;
  if (level.width) return `${level.width}p`;
  if (level.bitrate) return `${Math.round(level.bitrate / 1000)} kbps`;
  return `QualitÃ  ${index + 1}`;
}

function buildQualityOptions(levels: Level[]): QualityOption[] {
  const options: QualityOption[] = [{ level: -1, label: "Auto" }];
  levels.forEach((level, index) => {
    options.push({ level: index, label: qualityLabel(level, index) });
  });
  return options;
}

function buildSubtitleOptions(tracks: MediaPlaylist[]): SubtitleOption[] {
  const options: SubtitleOption[] = [{ track: -1, label: "Off" }];
  tracks.forEach((track, index) => {
    const name = track.name?.trim();
    const lang = track.lang?.trim();
    options.push({
      track: index,
      label: name || lang || `Traccia ${index + 1}`,
    });
  });
  return options;
}

function buildAudioOptions(tracks: MediaPlaylist[]): AudioOption[] {
  return tracks.map((track, index) => ({
    track: index,
    label: formatAudioTrackLabel(track, index),
  }));
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  function VideoPlayer(
    {
      streamUrl,
      media,
      episodes = [],
      isHls = false,
      isDash = false,
      drmWidevineLicenseUrl = null,
      remotePlayback,
      onBack,
      onPlayEpisode,
      watchPartySession: watchPartySessionProp,
      onWatchPartySessionChange,
      onStreamAudioLanguageChange,
      onReady,
      onRetryStream,
    },
    ref,
  ) {
  const { activeProfile } = useProfile();
  const { notify } = useNotifications();
  const { profile: cloudProfile } = useCloudAccount();
  const { setHostSession } = useWatchPartyHost();
  const profileId = activeProfile?.id ?? "";
  const profileName = activeProfile?.name ?? "Utente";
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const shakaRef = useRef<{ destroy: () => Promise<void> } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastSave = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartRef = useRef(0);
  const autoplayCancelledRef = useRef(false);
  const episodeNavTriggeredRef = useRef(false);
  const castDeviceRef = useRef<CastDevice | null>(null);
  const saveChainRef = useRef(Promise.resolve());
  const leavingRef = useRef(false);
  const partySessionRef = useRef<WatchPartySession | null>(null);
  const remoteSyncTargetRef = useRef<{
    playing: boolean;
    position: number;
    receivedAt: number;
  } | null>(null);
  const pendingGuestSeekRef = useRef<number | null>(null);
  const applyingPartyRemoteRef = useRef(false);
  const syncSeekInFlightRef = useRef(false);
  const hostLiveTimeRef = useRef(0);
  const uiTimeFlushAtRef = useRef(0);
  const durationRef = useRef(0);
  const timeLabelRef = useRef<HTMLSpanElement>(null);
  const lastCueTextRef = useRef<string | null>(null);
  const TIME_UI_MS = 200;
  const notifyPartySeekRef = useRef<(position: number, nextPlaying?: boolean) => void>(
    () => {},
  );
  const actionPulseIdRef = useRef(0);
  const actionPulseTimerRef = useRef<number | null>(null);
  const pendingSurfaceTapRef = useRef<number | null>(null);
  const lastSurfaceTapRef = useRef<{ at: number; xRatio: number } | null>(null);
  const { isGuest, guestAccessBlocked } = useAppAccess();

  const [playing, setPlaying] = useState(() => {
    if (watchPartySessionProp?.role === "guest") {
      return watchPartySessionProp.room.playing;
    }
    return true;
  });
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const showControlsRef = useRef(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  /** Scrub / volume drag: niente setCurrentTime dal timeupdate. */
  const controlsBusyRef = useRef(false);
  const [guestBlocked, setGuestBlocked] = useState(false);
  const [showEpisodes, setShowEpisodes] = useState(false);
  const [showUpNext, setShowUpNext] = useState(false);
  const [autoplaySeconds, setAutoplaySeconds] = useState<number | null>(null);
  /** Solo avvio / cambio stream: schermata a tutto schermo. */
  const [bootLoading, setBootLoading] = useState(true);
  /** Rebuffer a metÃ  film: spinner piccolo, non la schermata di avvio. */
  const [buffering, setBuffering] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const bootDoneRef = useRef(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onRetryStreamRef = useRef(onRetryStream);
  onRetryStreamRef.current = onRetryStream;
  const [showCast, setShowCast] = useState(false);
  const [showPartyPanel, setShowPartyPanel] = useState(false);
  const [partySession, setPartySession] = useState<WatchPartySession | null>(
    watchPartySessionProp ?? null,
  );
  const [partyStreamUrl, setPartyStreamUrl] = useState(streamUrl);
  const [partyIsHls, setPartyIsHls] = useState(isHls);
  const [castDevice, setCastDevice] = useState<CastDevice | null>(null);
  castDeviceRef.current = castDevice;
  const [qualityOptions, setQualityOptions] = useState<QualityOption[]>([]);
  const [selectedQuality, setSelectedQuality] = useState(-1);
  const [subtitleOptions, setSubtitleOptions] = useState<SubtitleOption[]>([]);
  const [selectedSubtitle, setSelectedSubtitle] = useState(-1);
  const [audioOptions, setAudioOptions] = useState<AudioOption[]>([]);
  const [selectedAudio, setSelectedAudio] = useState(0);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [streamAudioLang, setStreamAudioLang] = useState<PlayerStreamAudioLanguage>(
    () => readPlayerAudioLanguage(),
  );
  const [audioSwitching, setAudioSwitching] = useState(false);
  const [actionPulse, setActionPulse] = useState<PlayerActionPulse | null>(null);
  const streamAudioLangRef = useRef<PlayerStreamAudioLanguage>(streamAudioLang);
  streamAudioLangRef.current = streamAudioLang;
  const canShowAudioMenu =
    audioOptions.length > 1 || Boolean(onStreamAudioLanguageChange);
  const [activeCueText, setActiveCueText] = useState<string | null>(null);
  const castingTo = castDevice?.name ?? null;
  const effectiveStreamUrl = normalizePlaybackUrl(
    partySession?.role === "guest" && partyStreamUrl ? partyStreamUrl : streamUrl,
  );
  const effectiveIsHls =
    partySession?.role === "guest" && partyStreamUrl ? partyIsHls : isHls;
  const effectiveLicenseUrl = normalizePlaybackUrl(
    drmWidevineLicenseUrl?.trim() || "",
  );
  const usesWidevine = Boolean(effectiveLicenseUrl) && (isDash || !effectiveIsHls);
  const isPartyGuest = partySession?.role === "guest";
  const isPartyHost = partySession?.role === "host";
  const remoteProxyId = useMemo(
    () => parseRemoteProxyId(effectiveStreamUrl),
    [effectiveStreamUrl],
  );
  const canCast =
    isTauri() && Boolean(remoteProxyId || media.filePath);

  const partyMediaId = useMemo(() => {
    if (
      remotePlayback?.catalogPrefix === "sc" &&
      remotePlayback.slug &&
      remotePlayback.titleId
    ) {
      const base = `sc:${remotePlayback.contentType}:${remotePlayback.titleId}:${remotePlayback.slug}`;
      return remotePlayback.videoId ? `${base}:${remotePlayback.videoId}` : base;
    }
    if (
      remotePlayback?.catalogPrefix === "saturn" &&
      remotePlayback.slug
    ) {
      const base = `saturn:${remotePlayback.contentType}:${remotePlayback.slug}`;
      return remotePlayback.videoId ? `${base}:${remotePlayback.videoId}` : base;
    }
    if (
      remotePlayback?.catalogPrefix === "loonex" &&
      remotePlayback.slug
    ) {
      const base = `loonex:${remotePlayback.contentType}:${remotePlayback.slug}`;
      return remotePlayback.videoId ? `${base}:${remotePlayback.videoId}` : base;
    }
    if (
      remotePlayback?.catalogPrefix === "raiplay" &&
      remotePlayback.slug
    ) {
      const base = `raiplay:${remotePlayback.contentType}:${remotePlayback.slug}`;
      return remotePlayback.videoId ? `${base}:${remotePlayback.videoId}` : base;
    }
    return media.id;
  }, [media.id, remotePlayback]);

  const resumeAt = media.watchPosition ?? 0;
  const orderedEpisodes = useMemo(
    () => [...episodes].sort(compareEpisodes),
    [episodes],
  );
  const hasEpisodes = orderedEpisodes.length > 1;
  const prevEp = prevEpisode(orderedEpisodes, media.id);
  const nextEp = nextEpisode(orderedEpisodes, media.id);

  const saveProgress = useCallback(
    async (position: number, dur: number) => {
      if (!profileId) return;
      const persist = async () => {
        if (
          (remotePlayback?.catalogPrefix === "sc" ||
            remotePlayback?.catalogPrefix === "saturn" ||
            remotePlayback?.catalogPrefix === "loonex" ||
            remotePlayback?.catalogPrefix === "raiplay") &&
          remotePlayback.slug &&
          (remotePlayback.titleId ||
            remotePlayback.catalogPrefix === "saturn" ||
            remotePlayback.catalogPrefix === "loonex" ||
            remotePlayback.catalogPrefix === "raiplay")
        ) {
          try {
            const unlocks = await saveStreamingWatchProgress(profileId, {
              catalogPrefix: remotePlayback.catalogPrefix,
              contentType: remotePlayback.contentType,
              titleId:
                remotePlayback.titleId ||
                remotePlayback.slug ||
                remotePlayback.videoId ||
                media.id,
              slug: remotePlayback.slug,
              videoId:
                remotePlayback.videoId?.trim() ||
                remotePlayback.titleId ||
                media.id,
              titleName: remotePlayback.titleName ?? media.title,
              episodeLabel: remotePlayback.episodeLabel,
              poster: remotePlayback.poster ?? media.posterUrl,
              positionSecs: position,
              durationSecs: dur > 0 ? dur : undefined,
            });
            for (const item of achievementUnlockNotifications(unlocks)) {
              notify(item);
            }
            void logCloudWatchEvent({
              titleName: remotePlayback.titleName ?? media.title,
              contentType: remotePlayback.contentType,
              catalogPrefix: remotePlayback.catalogPrefix,
              slug: remotePlayback.slug,
              episodeLabel: remotePlayback.episodeLabel,
              secondsWatched: position,
            });
          } catch {
            // silent
          }
          return;
        }
        if (remotePlayback) return;
        try {
          await saveWatchProgress(profileId, media.id, position, dur || undefined);
          void logCloudWatchEvent({
            titleName: media.title,
            secondsWatched: position,
          });
        } catch {
          // silent
        }
      };
      saveChainRef.current = saveChainRef.current.then(persist, persist);
      await saveChainRef.current;
    },
    [media.id, media.title, media.posterUrl, profileId, remotePlayback, notify],
  );

  const saveProgressRef = useRef(saveProgress);
  saveProgressRef.current = saveProgress;

  const flushWatchProgress = useCallback(async () => {
    await saveChainRef.current.catch(() => {});
    if (castDeviceRef.current) {
      try {
        const pos = await getCastPosition(castDeviceRef.current);
        await saveProgressRef.current(pos.positionSecs, pos.durationSecs);
      } catch {
        // ignore
      }
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    await saveProgressRef.current(video.currentTime, video.duration);
  }, []);

  useEffect(() => {
    leavingRef.current = false;
  }, [media.id, effectiveStreamUrl]);

  useImperativeHandle(ref, () => ({ flushWatchProgress }), [flushWatchProgress]);

  const handleBack = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    videoRef.current?.pause();
    void flushWatchProgress();
    void Promise.resolve(onBack()).finally(() => {
      leavingRef.current = false;
    });
  }, [flushWatchProgress, onBack]);

  const resetHideTimer = useCallback(() => {
    // Ogni mousemove chiamava setShowControls(true) â†’ re-render dell'intero
    // chrome. Solo se i controlli sono nascosti facciamo setState.
    if (!showControlsRef.current) {
      showControlsRef.current = true;
      setShowControls(true);
    }
    clearTimeout(hideTimer.current);
    if (controlsBusyRef.current) return;
    if (
      !showEpisodes &&
      !showQualityMenu &&
      !showSubtitleMenu &&
      !showAudioMenu &&
      !showMoreMenu
    ) {
      hideTimer.current = setTimeout(() => {
        if (controlsBusyRef.current) return;
        showControlsRef.current = false;
        setShowControls(false);
      }, 3500);
    }
  }, [showEpisodes, showQualityMenu, showSubtitleMenu, showAudioMenu, showMoreMenu]);

  const onPlayerPointerMove = useCallback(() => {
    if (controlsBusyRef.current) return;
    resetHideTimer();
  }, [resetHideTimer]);

  const flashAction = useCallback((kind: PlayerActionKind, delta?: number) => {
    if (actionPulseTimerRef.current != null) {
      window.clearTimeout(actionPulseTimerRef.current);
    }
    actionPulseIdRef.current += 1;
    const id = actionPulseIdRef.current;
    setActionPulse({ id, kind, delta });
    actionPulseTimerRef.current = window.setTimeout(() => {
      setActionPulse((current) => (current?.id === id ? null : current));
      actionPulseTimerRef.current = null;
    }, 720);
  }, []);

  useEffect(
    () => () => {
      if (actionPulseTimerRef.current != null) {
        window.clearTimeout(actionPulseTimerRef.current);
      }
      if (pendingSurfaceTapRef.current != null) {
        window.clearTimeout(pendingSurfaceTapRef.current);
      }
      clearTimeout(hideTimer.current);
    },
    [],
  );

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current as
      | (HTMLElement & {
          webkitRequestFullscreen?: () => Promise<void> | void;
        })
      | null;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    const active = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
    if (active) {
      if (doc.exitFullscreen) await doc.exitFullscreen();
      else await doc.webkitExitFullscreen?.();
      return;
    }
    if (el?.requestFullscreen) await el.requestFullscreen();
    else await el?.webkitRequestFullscreen?.();
  }, []);

  const exitFullscreen = useCallback(() => {
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    if (doc.fullscreenElement) {
      void doc.exitFullscreen();
      return;
    }
    if (doc.webkitFullscreenElement) {
      void doc.webkitExitFullscreen?.();
    }
  }, []);

  const playEpisode = useCallback(
    (episode: MediaItem) => {
      if (!onPlayEpisode || episodeNavTriggeredRef.current) return;
      episodeNavTriggeredRef.current = true;
      setShowUpNext(false);
      setAutoplaySeconds(null);
      onPlayEpisode(episode.id);
    },
    [onPlayEpisode],
  );

  const playNextEpisode = useCallback(() => {
    if (!nextEp) return;
    playEpisode(nextEp);
  }, [nextEp, playEpisode]);

  const playPrevEpisode = useCallback(() => {
    if (!prevEp) return;
    autoplayCancelledRef.current = true;
    playEpisode(prevEp);
  }, [prevEp, playEpisode]);

  const cancelAutoplay = useCallback(() => {
    autoplayCancelledRef.current = true;
    setShowUpNext(false);
    setAutoplaySeconds(null);
  }, []);

  const markBootDone = useCallback(() => {
    setBootLoading(false);
    setBuffering(false);
    if (!bootDoneRef.current) {
      bootDoneRef.current = true;
      onReadyRef.current?.();
    }
  }, []);

  const failPlayback = useCallback(
    (message: string) => {
      invalidateScStreamUrl(effectiveStreamUrl);
      setPlaybackError(message);
      setPlaying(false);
      markBootDone();
    },
    [effectiveStreamUrl, markBootDone],
  );

  useEffect(() => {
    autoplayCancelledRef.current = false;
    episodeNavTriggeredRef.current = false;
    setShowUpNext(false);
    setAutoplaySeconds(null);
    bootDoneRef.current = false;
    setBootLoading(true);
    setBuffering(false);
    setPlaybackError(null);
    setGuestBlocked(isGuest && guestAccessBlocked);
    setPlaying(!(isGuest && guestAccessBlocked));
    setCastDevice(null);
    setQualityOptions([]);
    setSelectedQuality(-1);
    setSubtitleOptions([]);
    setSelectedSubtitle(-1);
    setShowQualityMenu(false);
    setShowSubtitleMenu(false);
    setActiveCueText(null);
  }, [media.id, effectiveStreamUrl, effectiveIsHls, isGuest, guestAccessBlocked]);

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;

    void (async () => {
      try {
        const id = remotePlayback
          ? await startAddonWatchSession(
              profileId,
              remotePlayback.contentType,
              remotePlayback.videoId,
              media.title,
            )
          : await startWatchSession(profileId, media.id);
        if (!cancelled) {
          sessionIdRef.current = id;
          sessionStartRef.current = Date.now();
        }
      } catch {
        // ignore
      }
    })();

    const interval = window.setInterval(() => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      const elapsed = Math.floor((Date.now() - sessionStartRef.current) / 1000);
      void updateWatchSession(sid, elapsed);
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      const sid = sessionIdRef.current;
      if (sid) {
        const elapsed = Math.floor((Date.now() - sessionStartRef.current) / 1000);
        void updateWatchSession(sid, elapsed);
        void endWatchSession(sid, false);
        sessionIdRef.current = null;
      }
    };
  }, [profileId, media.id, media.title, remotePlayback]);

  useEffect(() => {
    if (!isGuest) {
      setGuestBlocked(false);
      return;
    }
    if (guestAccessBlocked) {
      setGuestBlocked(true);
      setPlaying(false);
      videoRef.current?.pause();
    }
  }, [isGuest, guestAccessBlocked]);

  useGuestPlaybackMeter(isGuest && playing && !guestBlocked);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || castDevice || !effectiveStreamUrl) return;

    setAudioOptions([]);
    setSelectedAudio(0);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (shakaRef.current) {
      void shakaRef.current.destroy();
      shakaRef.current = null;
    }

    if (usesWidevine) {
      let cancelled = false;
      const licenseUrl = effectiveLicenseUrl;

      void (async () => {
        try {
          const shakaMod = await import("shaka-player");
          const shaka = shakaMod.default ?? shakaMod;
          if (cancelled || !videoRef.current) return;

          if (shaka.polyfill?.installAll) {
            shaka.polyfill.installAll();
          }
          if (!shaka.Player.isBrowserSupported()) {
            failPlayback(
              "Questo browser non supporta la riproduzione DRM (serve Chrome o Edge con Widevine).",
            );
            return;
          }

          const player = new shaka.Player();
          await player.attach(videoRef.current);
          if (cancelled) {
            await player.destroy();
            return;
          }
          shakaRef.current = player;

          player.configure({
            drm: {
              servers: {
                "com.widevine.alpha": licenseUrl,
              },
            },
            streaming: {
              bufferingGoal: 20,
              rebufferingGoal: 4,
              bufferBehind: 15,
            },
          });

          player.addEventListener("error", ((event: Event) => {
            const detail = (event as { detail?: { code?: number; message?: string } }).detail;
            const msg =
              detail?.message ||
              (detail?.code != null
                ? `Errore player DRM (${detail.code})`
                : "Errore riproduzione Widevine");
            failPlayback(msg);
          }) as (event: Event) => void);

          await player.load(effectiveStreamUrl);
          if (cancelled) return;

          video.muted = false;
          const play = video.play();
          if (play && typeof play.catch === "function") {
            play.catch(() => {
              video.muted = true;
              void video
                .play()
                .then(() => {
                  video.muted = false;
                  setPlaying(true);
                })
                .catch(() => setPlaying(false));
            });
          }
        } catch (err) {
          if (!cancelled) {
            failPlayback(
              err instanceof Error
                ? err.message
                : "Impossibile avviare lo stream Widevine Mediaset.",
            );
          }
        }
      })();

      return () => {
        cancelled = true;
        if (shakaRef.current) {
          void shakaRef.current.destroy();
          shakaRef.current = null;
        }
      };
    }

    if (effectiveIsHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        enableWebVTT: true,
        // Buffer più stretti: finestre enormi facevano scattare l'UI
        // durante scrub/volume (main thread + rete).
        maxBufferLength: 30,
        maxMaxBufferLength: 45,
        maxBufferSize: 40 * 1000 * 1000,
        backBufferLength: 15,
        capLevelToPlayerSize: true,
        startFragPrefetch: true,
        abrEwmaDefaultEstimate: 1_500_000,
        fragLoadingMaxRetry: 6,
        manifestLoadingMaxRetry: 6,
        levelLoadingMaxRetry: 6,
        levelLoadingTimeOut: 15_000,
        manifestLoadingTimeOut: 15_000,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 10,
      });
      hlsRef.current = hls;

      const syncQualityOptions = () => {
        if (hls.levels.length > 0) {
          setQualityOptions(buildQualityOptions(hls.levels));
          setSelectedQuality(hls.currentLevel);
        }
      };

      const syncSubtitleOptions = () => {
        if (hls.subtitleTracks.length > 0) {
          setSubtitleOptions(buildSubtitleOptions(hls.subtitleTracks));
          setSelectedSubtitle(hls.subtitleTrack);
        }
      };

      const syncAudioOptions = () => {
        const tracks = hls.audioTracks;
        if (tracks.length <= 1) {
          setAudioOptions([]);
          setSelectedAudio(0);
          return;
        }
        setAudioOptions(buildAudioOptions(tracks));
        const preferred = pickAudioTrackIndex(
          tracks,
          streamAudioLangRef.current === "en" ? "en" : "it",
        );
        const nextIndex =
          preferred != null && preferred >= 0 ? preferred : hls.audioTrack;
        if (nextIndex >= 0 && nextIndex < tracks.length) {
          hls.audioTrack = nextIndex;
          setSelectedAudio(nextIndex);
        }
      };

      const tryPlay = () => {
        video.muted = false;
        const play = video.play();
        if (play && typeof play.catch === "function") {
          play.catch(() => {
            video.muted = true;
            void video
              .play()
              .then(() => {
                video.muted = false;
                setPlaying(true);
              })
              .catch(() => {
                setPlaying(false);
                // Non togliere il loading qui: aspetta `playing` o errore fatale.
              });
          });
        }
      };

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        syncQualityOptions();
        syncSubtitleOptions();
        syncAudioOptions();
        hls.subtitleDisplay = false;
        hls.subtitleTrack = -1;
        setSelectedSubtitle(-1);
        tryPlay();
      });
      hls.on(Hls.Events.LEVELS_UPDATED, syncQualityOptions);
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, syncSubtitleOptions);
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, syncAudioOptions);
      hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, (_event, data) => {
        setSelectedSubtitle(data.id);
      });
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_event, data) => {
        setSelectedAudio(data.id);
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        setSelectedQuality(data.level);
      });
      let recoveryAttempts = 0;
      let reresolveDone = false;
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;

        // La registry del proxy vive in memoria: dopo un riavvio dell'app o un
        // redeploy del server gli URL `/remote/...` non esistono più. Nessun
        // retry di rete può recuperarli, serve ri-risolvere lo stream.
        const registryLost =
          (data.response?.code === 404 || data.response?.code === 410) &&
          typeof data.url === "string" &&
          data.url.includes("/remote/");

        if (registryLost && !reresolveDone && onRetryStreamRef.current) {
          reresolveDone = true;
          invalidateScStreamUrl(effectiveStreamUrl);
          onRetryStreamRef.current();
          return;
        }

        if (!registryLost && recoveryAttempts < 3) {
          recoveryAttempts += 1;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
            return;
          }
        }

        failPlayback(describeHlsError(data));
      });
      hls.loadSource(effectiveStreamUrl);
      hls.attachMedia(video);
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    video.src = effectiveStreamUrl;
    return () => {
      video.removeAttribute("src");
      video.load();
    };
  }, [
    effectiveStreamUrl,
    effectiveIsHls,
    usesWidevine,
    effectiveLicenseUrl,
    castDevice,
    markBootDone,
    failPlayback,
  ]);

  const stopCast = useCallback(async () => {
    if (!castDevice) return;
    try {
      await castTransport(castDevice, "stop");
    } catch {
      // ignora errori in chiusura
    }
    setCastDevice(null);
    setPlaying(false);
  }, [castDevice]);

  useEffect(() => {
    setPartySession(watchPartySessionProp ?? null);
  }, [watchPartySessionProp]);

  partySessionRef.current = partySession;

  useEffect(() => {
    if (!partySession || partySession.role !== "guest") {
      setPartyStreamUrl(streamUrl);
      setPartyIsHls(isHls);
    }
  }, [streamUrl, isHls, partySession]);

  const handleRemoteSync = useCallback((nextPlaying: boolean, position: number) => {
    const receivedAt = Date.now();
    remoteSyncTargetRef.current = {
      playing: nextPlaying,
      position,
      receivedAt,
    };
    const video = videoRef.current;
    if (!video) return;

    applyingPartyRemoteRef.current = true;

    const drift = Math.abs(video.currentTime - position);
    const pausedDriftLimit = 0.18;
    // Host heartbeat ~800ms: non cercare troppo spesso mentre riproduce.
    const playingDriftLimit = Math.max(DRIFT_THRESHOLD_SEC, 1.15);
    const shouldSeek =
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
        ? true
        : drift > (nextPlaying ? playingDriftLimit : pausedDriftLimit);

    if (shouldSeek) {
      syncSeekInFlightRef.current = true;
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        pendingGuestSeekRef.current = position;
      } else {
        try {
          video.currentTime = position;
        } catch {
          pendingGuestSeekRef.current = position;
        }
        setCurrentTime(position);
        pendingGuestSeekRef.current = null;
      }
      window.setTimeout(() => {
        syncSeekInFlightRef.current = false;
      }, 700);
    }

    if (nextPlaying) {
      if (video.paused) {
        void video
          .play()
          .then(() => setPlaying(true))
          .catch(() => setPlaying(false));
      } else {
        setPlaying(true);
      }
    } else {
      if (video.playbackRate !== 1) video.playbackRate = 1;
      if (!video.paused) video.pause();
      setPlaying(false);
    }

    window.setTimeout(() => {
      applyingPartyRemoteRef.current = false;
    }, 350);
  }, []);

  useEffect(() => {
    if (partySession?.role !== "guest") {
      remoteSyncTargetRef.current = null;
      pendingGuestSeekRef.current = null;
      syncSeekInFlightRef.current = false;
      const video = videoRef.current;
      if (video && video.playbackRate !== 1) video.playbackRate = 1;
      return;
    }

    const MAX_EXTRAPOLATE_SEC = 3;
    // Oltre questo scarto si riallinea con un seek secco; sotto, si converge
    // gradualmente variando la velocitÃ  di riproduzione (nessuno scatto visibile).
    const HARD_SEEK_LIMIT_SEC = 1.0;
    const RATE_CORRECT_MIN_SEC = 0.1;
    const expectedTargetTime = (target: {
      playing: boolean;
      position: number;
      receivedAt: number;
    }) => {
      if (!target.playing) return target.position;
      // Estrapolazione con clock LOCALE del guest (receivedAt): immune allo
      // sfasamento tra l'orologio dell'host e quello del guest.
      const ageSec = (Date.now() - target.receivedAt) / 1000;
      return target.position + Math.min(Math.max(ageSec, 0), MAX_EXTRAPOLATE_SEC);
    };

    const id = window.setInterval(() => {
      const target = remoteSyncTargetRef.current;
      const video = videoRef.current;
      if (!target || !video || applyingPartyRemoteRef.current) {
        return;
      }

      const expected = expectedTargetTime(target);

      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        if (pendingGuestSeekRef.current == null) {
          pendingGuestSeekRef.current = expected;
        }
        return;
      }

      // drift firmato: >0 => guest AVANTI rispetto all'host, <0 => INDIETRO.
      const drift = video.currentTime - expected;
      const absDrift = Math.abs(drift);

      if (target.playing) {
        if (absDrift > HARD_SEEK_LIMIT_SEC) {
          // Scarto grande (buffering lungo, salto): riallinea con un seek secco.
          syncSeekInFlightRef.current = true;
          try {
            video.currentTime = expected;
          } catch {
            // ignore seek errors during buffering
          }
          setCurrentTime(expected);
          if (video.playbackRate !== 1) video.playbackRate = 1;
          window.setTimeout(() => {
            syncSeekInFlightRef.current = false;
          }, 700);
        } else if (absDrift > RATE_CORRECT_MIN_SEC) {
          // Scarto piccolo: converge in modo impercettibile modulando la velocitÃ 
          // (guest indietro => accelera, guest avanti => rallenta). Niente seek,
          // quindi nessuno scatto nÃ© buffering tra un heartbeat e l'altro.
          const rate = Math.min(1.1, Math.max(0.9, 1 - drift * 0.6));
          if (Math.abs(video.playbackRate - rate) > 0.005) {
            video.playbackRate = rate;
          }
        } else if (video.playbackRate !== 1) {
          // Allineati: torna a velocitÃ  normale.
          video.playbackRate = 1;
        }
      } else {
        if (video.playbackRate !== 1) video.playbackRate = 1;
        if (absDrift > 0.12) {
          syncSeekInFlightRef.current = true;
          try {
            video.currentTime = expected;
          } catch {
            // ignore seek errors during buffering
          }
          setCurrentTime(expected);
          window.setTimeout(() => {
            syncSeekInFlightRef.current = false;
          }, 700);
        }
      }

      if (target.playing && video.paused) {
        void video.play().catch(() => {});
        setPlaying(true);
      } else if (!target.playing && !video.paused) {
        video.pause();
        setPlaying(false);
      }

      if (pendingGuestSeekRef.current != null) {
        const pending = pendingGuestSeekRef.current;
        syncSeekInFlightRef.current = true;
        try {
          video.currentTime = pending;
        } catch {
          return;
        }
        setCurrentTime(pending);
        pendingGuestSeekRef.current = null;
        window.setTimeout(() => {
          syncSeekInFlightRef.current = false;
        }, 700);
      }
    }, 400);

    return () => {
      window.clearInterval(id);
      const video = videoRef.current;
      if (video && video.playbackRate !== 1) video.playbackRate = 1;
    };
  }, [partySession?.role]);

  const {
    members: partyMembers,
    connected: partyConnected,
    error: partyError,
    notifySeek: notifyPartySeek,
  } = useWatchPartySync({
    session: partySession,
    profileId,
    profileName,
    cloudUserId: cloudProfile?.id,
    playing,
    currentTime,
    getHostPosition: () => hostLiveTimeRef.current,
    onRemoteSync: handleRemoteSync,
    onGuestContent: (url, guestHls) => {
      setPartyStreamUrl((prev) => {
        if (prev === url) return prev;
        bootDoneRef.current = false;
        setBootLoading(true);
        setBuffering(false);
        return url;
      });
      setPartyIsHls(guestHls);
    },
  });

  notifyPartySeekRef.current = notifyPartySeek;

  const updatePartySession = useCallback(
    (next: WatchPartySession | null) => {
      setPartySession(next);
      setHostSession(next);
      onWatchPartySessionChange?.(next);
    },
    [onWatchPartySessionChange, setHostSession],
  );

  const leaveParty = useCallback(async () => {
    const closingCode = partySession?.room.code;
    const closingRelay = partySession?.relay;
    if (partySession?.role === "host") {
      try {
        if (partySession.relay === "cloud" && cloudProfile) {
          await closeCloudWatchParty(partySession.room.code, cloudProfile.id);
        } else {
          await closeWatchParty(profileId, partySession.room.code);
        }
      } catch {
        // ignore
      }
    }
    updatePartySession(null);
    if (closingCode && closingRelay === "cloud") {
      closeChatPopup({ watchPartyCode: closingCode });
    }
  }, [partySession, profileId, cloudProfile, updatePartySession]);

  const cloudProfileRef = useRef(cloudProfile);
  cloudProfileRef.current = cloudProfile;

  // Se l'host esce dal player senza chiudere la party, elimina la stanza cloud
  // per non lasciarla attiva per sempre.
  useEffect(() => {
    return () => {
      const session = partySessionRef.current;
      const profile = cloudProfileRef.current;
      if (session?.role === "host" && session.relay === "cloud" && profile) {
        void closeCloudWatchParty(session.room.code, profile.id);
      }
    };
  }, []);

  const seek = useCallback(
    async (time: number) => {
      if (isPartyGuest) return;
      if (castDevice) {
        const clamped = Math.max(0, duration > 0 ? Math.min(duration, time) : time);
        setCurrentTime(clamped);
        try {
          await castTransport(castDevice, "seek", clamped);
        } catch {
          // mantieni la posizione visiva
        }
        resetHideTimer();
        return;
      }

      // Un solo setState a fine seek basta; evita cascade sul chrome.
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = time;
      hostLiveTimeRef.current = time;
      if (timeLabelRef.current) {
        const dur = durationRef.current || duration;
        timeLabelRef.current.textContent = `${formatPlayerClock(time)} / ${formatPlayerClock(dur)}`;
      }
      if (duration - time > upNextLeadSeconds(duration)) {
        setShowUpNext(false);
        setAutoplaySeconds(null);
      }
      if (isPartyHost) {
        notifyPartySeek(time);
      }
      // Niente setCurrentTime / resetHideTimer: il drag ha giÃ  i controlli su.
    },
    [castDevice, duration, isPartyHost, isPartyGuest, notifyPartySeek],
  );

  const skip = useCallback(
    (delta: number) => {
      if (isPartyGuest) return;
      flashAction("skip", delta);
      const now =
        videoRef.current?.currentTime ?? hostLiveTimeRef.current ?? 0;
      const limit = duration > 0 ? duration : now + Math.abs(delta);
      void seek(Math.max(0, Math.min(limit, now + delta)));
    },
    [duration, seek, isPartyGuest, flashAction],
  );

  const togglePlay = useCallback(async () => {
    if (isPartyGuest) return;
    if (castDevice) {
      try {
        await castTransport(castDevice, playing ? "pause" : "play");
        flashAction(playing ? "pause" : "play");
        setPlaying(!playing);
      } catch {
        // stato locale invariato se la TV non risponde
      }
      resetHideTimer();
      return;
    }

    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      flashAction("play");
      void video.play();
      setPlaying(true);
      if (isPartyHost) {
        notifyPartySeek(video.currentTime, true);
      }
    } else {
      flashAction("pause");
      video.pause();
      setPlaying(false);
      if (isPartyHost) {
        notifyPartySeek(video.currentTime, false);
      }
    }
    resetHideTimer();
  }, [
    castDevice,
    playing,
    resetHideTimer,
    isPartyHost,
    isPartyGuest,
    notifyPartySeek,
    flashAction,
  ]);

  const onVideoSurfaceClick = useCallback(
    (e: MouseEvent<HTMLVideoElement>) => {
      e.stopPropagation();
      if (isPartyGuest) {
        resetHideTimer();
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const xRatio =
        rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0.5;
      const now = performance.now();
      const last = lastSurfaceTapRef.current;
      const isDouble =
        last != null &&
        now - last.at < 300 &&
        Math.abs(xRatio - last.xRatio) < 0.4;
      const coarsePointer =
        typeof window !== "undefined" &&
        window.matchMedia("(pointer: coarse)").matches;

      if (isDouble) {
        if (pendingSurfaceTapRef.current != null) {
          window.clearTimeout(pendingSurfaceTapRef.current);
          pendingSurfaceTapRef.current = null;
        }
        lastSurfaceTapRef.current = null;
        const delta = xRatio < 0.45 ? -10 : xRatio > 0.55 ? 10 : 0;
        if (delta !== 0) {
          skip(delta);
          resetHideTimer();
          return;
        }
      }

      lastSurfaceTapRef.current = { at: now, xRatio };
      if (!coarsePointer) {
        if (pendingSurfaceTapRef.current != null) {
          window.clearTimeout(pendingSurfaceTapRef.current);
          pendingSurfaceTapRef.current = null;
        }
        void togglePlay();
        return;
      }
      if (pendingSurfaceTapRef.current != null) {
        window.clearTimeout(pendingSurfaceTapRef.current);
      }
      // Touch: ritarda il toggle così il double-tap ±10s non mette play/pausa.
      pendingSurfaceTapRef.current = window.setTimeout(() => {
        pendingSurfaceTapRef.current = null;
        void togglePlay();
      }, 280);
    },
    [isPartyGuest, resetHideTimer, skip, togglePlay],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video || castDevice) return;

    const onPause = () => {
      setCurrentTime(video.currentTime);
      hostLiveTimeRef.current = video.currentTime;
      uiTimeFlushAtRef.current = Date.now();
      if (applyingPartyRemoteRef.current || syncSeekInFlightRef.current) return;
      setPlaying(false);
      saveProgress(video.currentTime, video.duration);
      if (partySessionRef.current?.role === "host") {
        notifyPartySeekRef.current(video.currentTime, false);
      }
    };

    const onPlaying = () => {
      // Sempre spegni lo spinner: i seek di sync non devono lasciare il loading acceso.
      setPlaybackError(null);
      markBootDone();
      if (applyingPartyRemoteRef.current || syncSeekInFlightRef.current) return;
      if (partySessionRef.current?.role === "host") {
        notifyPartySeekRef.current(video.currentTime, true);
      }
    };

    const onLoaded = () => {
      setDuration(video.duration);
      durationRef.current = video.duration;
      const guestSession = partySessionRef.current;
      if (guestSession?.role === "guest") {
        const target = remoteSyncTargetRef.current;
        const startAt = (() => {
          if (target) {
            if (!target.playing) return target.position;
            const ageSec = (Date.now() - target.receivedAt) / 1000;
            return target.position + Math.min(Math.max(ageSec, 0), 3);
          }
          return (
            pendingGuestSeekRef.current ?? guestSession.room.positionSecs
          );
        })();
        if (startAt > 0 && startAt < video.duration - 0.5) {
          syncSeekInFlightRef.current = true;
          video.currentTime = startAt;
          setCurrentTime(startAt);
          window.setTimeout(() => {
            syncSeekInFlightRef.current = false;
          }, 700);
        }
        const shouldPlay = target?.playing ?? guestSession.room.playing;
        setPlaying(shouldPlay);
        if (shouldPlay) {
          void video.play().catch(() => setPlaying(false));
        } else {
          video.pause();
          markBootDone();
        }
        return;
      }
      if (resumeAt > 5 && resumeAt < video.duration - 10) {
        video.currentTime = resumeAt;
        setCurrentTime(resumeAt);
      }
      void video.play().catch(() => setPlaying(false));
    };

    const onTimeUpdate = () => {
      const t = video.currentTime;
      hostLiveTimeRef.current = t;
      const now = Date.now();
      // Niente setCurrentTime qui: re-renderiva tutto il chrome ~4Hz e faceva
      // scattare scrub/volume. Tempo UI â†’ DOM ref; scrub legge il <video>.
      if (
        !controlsBusyRef.current &&
        timeLabelRef.current &&
        now - uiTimeFlushAtRef.current >= TIME_UI_MS
      ) {
        uiTimeFlushAtRef.current = now;
        const dur = video.duration || durationRef.current || 0;
        timeLabelRef.current.textContent = `${formatPlayerClock(t)} / ${formatPlayerClock(dur)}`;
      }
      if (now - lastSave.current > 2000) {
        lastSave.current = now;
        saveProgress(t, video.duration);
      }
      const lead = upNextLeadSeconds(video.duration);
      if (controlsBusyRef.current) {
        // Durante scrub/volume non aggiornare up-next (setState sul chrome).
      } else if (
        nextEp &&
        onPlayEpisode &&
        !autoplayCancelledRef.current &&
        video.duration > 0 &&
        video.duration - t <= lead
      ) {
        const secs = Math.max(0, Math.ceil(video.duration - t));
        setShowUpNext((prev) => (prev ? prev : true));
        setAutoplaySeconds((prev) => (prev === secs ? prev : secs));
      } else if (video.duration - t > lead) {
        setShowUpNext((prev) => (prev ? false : prev));
        setAutoplaySeconds((prev) => (prev == null ? prev : null));
      }
    };

    const onEnded = () => {
      const sid = sessionIdRef.current;
      if (sid) {
        const elapsed = Math.floor((Date.now() - sessionStartRef.current) / 1000);
        void updateWatchSession(sid, elapsed);
        void endWatchSession(sid, true).then((unlocks) => {
          for (const item of achievementUnlockNotifications(unlocks)) {
            notify(item);
          }
        });
        sessionIdRef.current = null;
      }
      setPlaying(false);
      saveProgress(0, video.duration);
      if (!autoplayCancelledRef.current) {
        playNextEpisode();
      }
    };

    const onWaiting = () => {
      if (controlsBusyRef.current) return;
      // Non mostrare nulla per i seek di sync watch party.
      if (applyingPartyRemoteRef.current || syncSeekInFlightRef.current) return;
      // Rebuffer a metÃ : spinner piccolo. Mai di nuovo la schermata di avvio.
      if (bootDoneRef.current) setBuffering(true);
    };

    // Sorgenti dirette (mp4, HLS nativo Safari): senza questo un errore
    // dell'elemento <video> lascia soltanto uno schermo nero.
    const onMediaError = () => {
      const err = video.error;
      if (!err) return;
      const reason =
        err.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
          ? "Formato video non supportato da questo dispositivo"
          : err.code === MediaError.MEDIA_ERR_NETWORK
            ? "Connessione interrotta durante il caricamento del video"
            : err.code === MediaError.MEDIA_ERR_DECODE
              ? "Il video non puÃ² essere decodificato"
              : "Riproduzione interrotta";
      failPlayback(`${reason} (codice ${err.code}).`);
    };

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("pause", onPause);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("error", onMediaError);

    // Se dopo 45s non c'Ã¨ ancora il primo frame, non lasciare schermo nero:
    // mostra errore e invalida la cache stream.
    const bootSafety = window.setTimeout(() => {
      if (!bootDoneRef.current) {
        failPlayback(
          "Il film non parte. Torna indietro e riprova tra qualche secondo.",
        );
      }
    }, 45_000);

    return () => {
      window.clearTimeout(bootSafety);
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("error", onMediaError);
      void saveProgress(video.currentTime, video.duration);
    };
  }, [effectiveStreamUrl, resumeAt, saveProgress, nextEp, playNextEpisode, castDevice, onPlayEpisode, notify, markBootDone, failPlayback]);

  useEffect(() => {
    const flushOnHide = () => {
      void flushWatchProgress();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushOnHide();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushOnHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushOnHide);
    };
  }, [flushWatchProgress]);

  useEffect(() => {
    if (!castDevice) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const pos = await getCastPosition(castDevice);
        if (cancelled) return;
        setCurrentTime(pos.positionSecs);
        if (pos.durationSecs > 0) setDuration(pos.durationSecs);
        setPlaying(pos.playing);
        markBootDone();
        const now = Date.now();
        if (now - lastSave.current > 5000) {
          lastSave.current = now;
          void saveProgress(pos.positionSecs, pos.durationSecs);
        }
      } catch {
        // TV non risponde al polling
      }
    };

    void poll();
    const id = window.setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [castDevice, saveProgress, markBootDone]);

  useEffect(() => {
    if (
      autoplaySeconds === 0 &&
      nextEp &&
      !autoplayCancelledRef.current
    ) {
      playNextEpisode();
    }
  }, [autoplaySeconds, nextEp, playNextEpisode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Non intercettare le scorciatoie mentre si digita (es. chat stanza):
      // altrimenti spazio/lettere metterebbero in pausa o muterebbero il video.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (isPartyGuest) {
        const video = videoRef.current;
        if (!video) return;
        switch (e.key) {
          case "Escape":
            if (showEpisodes) setShowEpisodes(false);
            else if (isFullscreen) exitFullscreen();
            break;
          case "m":
            video.muted = !video.muted;
            setMuted(video.muted);
            resetHideTimer();
            break;
          case "f":
            toggleFullscreen();
            break;
        }
        return;
      }

      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          void togglePlay();
          resetHideTimer();
          break;
        case "ArrowLeft":
          e.preventDefault();
          skip(-10);
          resetHideTimer();
          break;
        case "ArrowRight":
          e.preventDefault();
          skip(10);
          resetHideTimer();
          break;
        case "f":
          toggleFullscreen();
          break;
        case "m": {
          const video = videoRef.current;
          if (!video) return;
          video.muted = !video.muted;
          setMuted(video.muted);
          resetHideTimer();
          break;
        }
        case "Escape":
          if (showEpisodes) setShowEpisodes(false);
          else if (isFullscreen) exitFullscreen();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    resetHideTimer,
    showEpisodes,
    isFullscreen,
    toggleFullscreen,
    exitFullscreen,
    togglePlay,
    skip,
    isPartyGuest,
  ]);

  useEffect(() => {
    const onFs = () => {
      const doc = document as Document & {
        webkitFullscreenElement?: Element | null;
      };
      setIsFullscreen(
        Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement),
      );
    };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
    };
  }, []);

  const setControlsBusy = useCallback((busy: boolean) => {
    controlsBusyRef.current = busy;
    const hls = hlsRef.current;
    // Durante scrub/volume: stop download segmenti cosÃ¬ il main thread
    // non compete con ABR/proxy. Riparte al rilascio.
    if (hls) {
      try {
        if (busy) hls.stopLoad();
        else hls.startLoad(-1);
      } catch {
        // ignore
      }
    }
    if (busy) {
      clearTimeout(hideTimer.current);
      if (!showControlsRef.current) {
        showControlsRef.current = true;
        setShowControls(true);
      }
    } else {
      resetHideTimer();
    }
  }, [resetHideTimer]);

  const selectQuality = useCallback((level: number) => {
    const hls = hlsRef.current;
    const video = videoRef.current;
    if (!hls || !video) return;
    const position = video.currentTime;
    hls.currentLevel = level;
    setSelectedQuality(level);
    setShowQualityMenu(false);
    setShowMoreMenu(false);
    video.currentTime = position;
    resetHideTimer();
  }, [resetHideTimer]);

  const selectSubtitle = useCallback((track: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.subtitleDisplay = track >= 0;
    hls.subtitleTrack = track;
    setSelectedSubtitle(track);
    if (track < 0) {
      setActiveCueText(null);
    }
    setShowSubtitleMenu(false);
    setShowMoreMenu(false);
    resetHideTimer();
  }, [resetHideTimer]);

  const selectAudio = useCallback((track: number) => {
    const hls = hlsRef.current;
    if (!hls || track < 0 || track >= hls.audioTracks.length) return;
    hls.audioTrack = track;
    setSelectedAudio(track);
    setShowAudioMenu(false);
    setShowMoreMenu(false);
    resetHideTimer();
  }, [resetHideTimer]);

  const selectStreamAudio = useCallback(
    async (lang: PlayerStreamAudioLanguage) => {
      if (!onStreamAudioLanguageChange) return;
      savePlayerAudioLanguage(lang);
      setStreamAudioLang(lang);
      setShowAudioMenu(false);
      setShowMoreMenu(false);
      resetHideTimer();
      setAudioSwitching(true);
      try {
        await onStreamAudioLanguageChange(lang);
      } finally {
        setAudioSwitching(false);
      }
    },
    [onStreamAudioLanguageChange, resetHideTimer],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !effectiveIsHls || selectedSubtitle < 0 || castDevice) {
      setActiveCueText(null);
      lastCueTextRef.current = null;
      return;
    }

    const applyCueText = (next: string | null) => {
      if (controlsBusyRef.current) return;
      if (next === lastCueTextRef.current) return;
      lastCueTextRef.current = next;
      setActiveCueText(next);
    };

    const readActiveCues = () => {
      const lines: string[] = [];
      for (let i = 0; i < video.textTracks.length; i++) {
        const track = video.textTracks[i];
        if (track.mode !== "showing" || !track.activeCues) continue;
        for (let j = 0; j < track.activeCues.length; j++) {
          const cue = track.activeCues[j];
          if (cue instanceof VTTCue && cue.text.trim()) {
            lines.push(cue.text.trim());
          }
        }
      }
      applyCueText(lines.length > 0 ? lines.join("\n") : null);
    };

    const onCueChange = () => readActiveCues();

    for (let i = 0; i < video.textTracks.length; i++) {
      video.textTracks[i].addEventListener("cuechange", onCueChange);
    }
    video.addEventListener("seeked", readActiveCues);
    // Fallback throttled: alcuni player HLS non emettono cuechange affidabile.
    let lastRead = 0;
    const onTimeFallback = () => {
      const now = performance.now();
      if (now - lastRead < 250) return;
      lastRead = now;
      readActiveCues();
    };
    video.addEventListener("timeupdate", onTimeFallback);
    readActiveCues();

    return () => {
      for (let i = 0; i < video.textTracks.length; i++) {
        video.textTracks[i].removeEventListener("cuechange", onCueChange);
      }
      video.removeEventListener("seeked", readActiveCues);
      video.removeEventListener("timeupdate", onTimeFallback);
    };
  }, [selectedSubtitle, effectiveIsHls, effectiveStreamUrl, castDevice]);

  const activeQualityLabel =
    qualityOptions.find((option) => option.level === selectedQuality)?.label ??
    "Auto";
  const activeSubtitleLabel =
    selectedSubtitle < 0
      ? "Off"
      : subtitleOptions.find((option) => option.track === selectedSubtitle)
          ?.label ?? "On";
  const activeAudioLabel =
    onStreamAudioLanguageChange
      ? (PLAYER_STREAM_AUDIO_OPTIONS.find((option) => option.id === streamAudioLang)
          ?.label ?? "Audio")
      : (audioOptions.find((option) => option.track === selectedAudio)?.label ??
        "Audio");

  const chromeInteractive =
    showControls ||
    showEpisodes ||
    showQualityMenu ||
    showSubtitleMenu ||
    showAudioMenu ||
    showMoreMenu;

  return (
    <div
      ref={containerRef}
      className="player-shell relative flex h-full flex-col bg-black"
      onMouseMove={onPlayerPointerMove}
      onClick={resetHideTimer}
      onTouchStart={resetHideTimer}
      onTouchMove={onPlayerPointerMove}
    >
      <video
        ref={videoRef}
        src={
          usesWidevine || (effectiveIsHls && Hls.isSupported())
            ? undefined
            : effectiveStreamUrl
        }
        className="player-video h-full w-full object-contain"
        playsInline
        onClick={onVideoSurfaceClick}
      />

      {activeCueText && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[88px] z-[25] flex justify-center px-6 sm:bottom-[96px] sm:px-10">
          <p className="max-w-3xl whitespace-pre-line rounded-md bg-black/80 px-4 py-2 text-center text-[clamp(14px,2.2vw,22px)] font-medium leading-snug text-white shadow-lg [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
            {activeCueText}
          </p>
        </div>
      )}

      <PlayerActionFeedback pulse={actionPulse} />

      <PlayerChromeShell
        visible={chromeInteractive}
        media={media}
        videoRef={videoRef}
        timeLabelRef={timeLabelRef}
        duration={duration}
        playing={playing}
        muted={muted}
        isFullscreen={isFullscreen}
        isHls={effectiveIsHls}
        scrubDisabled={!effectiveStreamUrl || castDevice != null || isPartyGuest}
        isPartyGuest={isPartyGuest}
        hasEpisodes={hasEpisodes}
        canCast={canCast}
        castingTo={castingTo}
        partySessionActive={Boolean(partySession)}
        prevEp={prevEp ?? null}
        nextEp={nextEp ?? null}
        qualityOptions={qualityOptions.map((o) => ({
          id: o.level,
          label: o.label,
        }))}
        subtitleOptions={subtitleOptions.map((o) => ({
          id: o.track,
          label: o.label,
        }))}
        audioOptions={audioOptions.map((o) => ({
          id: o.track,
          label: o.label,
        }))}
        selectedQuality={selectedQuality}
        selectedSubtitle={selectedSubtitle}
        selectedAudio={selectedAudio}
        streamAudioLang={streamAudioLang}
        canShowAudioMenu={canShowAudioMenu}
        audioSwitching={audioSwitching}
        showQualityMenu={showQualityMenu}
        showSubtitleMenu={showSubtitleMenu}
        showAudioMenu={showAudioMenu}
        showMoreMenu={showMoreMenu}
        activeQualityLabel={activeQualityLabel}
        activeSubtitleLabel={activeSubtitleLabel}
        activeAudioLabel={activeAudioLabel}
        onBusyChange={setControlsBusy}
        onSeek={(time) => {
          if (castDevice) {
            setCurrentTime(time);
          } else {
            void seek(time);
          }
        }}
        onSeekCommit={(time) => {
          if (castDevice) void seek(time);
        }}
        onBack={handleBack}
        onTogglePlay={() => void togglePlay()}
        onSkip={skip}
        onToggleMute={() => {
          const video = videoRef.current;
          if (!video) return;
          video.muted = !video.muted;
          setMuted(video.muted);
        }}
        onToggleFullscreen={() => void toggleFullscreen()}
        onOpenEpisodes={() => {
          setShowMoreMenu(false);
          setShowEpisodes(true);
          showControlsRef.current = true;
          setShowControls(true);
        }}
        onOpenCast={() => {
          setShowMoreMenu(false);
          setShowCast(true);
          showControlsRef.current = true;
          setShowControls(true);
        }}
        onOpenParty={() => {
          setShowMoreMenu(false);
          setShowPartyPanel(true);
          showControlsRef.current = true;
          setShowControls(true);
        }}
        onStopCast={() => void stopCast()}
        onPlayPrevEpisode={prevEp ? playPrevEpisode : undefined}
        onPlayNextEpisode={nextEp ? playNextEpisode : undefined}
        onToggleQualityMenu={() => {
          setShowQualityMenu((open) => !open);
          setShowSubtitleMenu(false);
          setShowAudioMenu(false);
          setShowMoreMenu(false);
          resetHideTimer();
        }}
        onToggleSubtitleMenu={() => {
          setShowSubtitleMenu((open) => !open);
          setShowQualityMenu(false);
          setShowAudioMenu(false);
          setShowMoreMenu(false);
          resetHideTimer();
        }}
        onToggleAudioMenu={() => {
          setShowAudioMenu((open) => !open);
          setShowQualityMenu(false);
          setShowSubtitleMenu(false);
          setShowMoreMenu(false);
          resetHideTimer();
        }}
        onToggleMoreMenu={() => {
          setShowMoreMenu((open) => !open);
          setShowQualityMenu(false);
          setShowSubtitleMenu(false);
          setShowAudioMenu(false);
          resetHideTimer();
        }}
        onSelectQuality={selectQuality}
        onSelectSubtitle={selectSubtitle}
        onSelectAudio={selectAudio}
        onSelectStreamAudio={(lang) => void selectStreamAudio(lang)}
        formatClock={formatPlayerClock}
      />

      {bootLoading && !castDevice && !playbackError && (
        <PlayerLoadingScreen
          variant="inline"
          title={media.seriesTitle ?? media.title}
          subtitle={media.seriesTitle ? media.title : undefined}
          backdropUrl={media.backgroundUrl ?? media.posterUrl}
          logoUrl={media.logoUrl}
        />
      )}

      {playbackError && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/85 px-6">
          <div className="max-w-md text-center">
            <p className="font-display text-xl font-semibold text-white">
              Riproduzione non riuscita
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-white/75">
              {playbackError}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {onRetryStream && (
                <button
                  type="button"
                  onClick={() => {
                    setPlaybackError(null);
                    onRetryStream();
                  }}
                  className="rounded-full bg-white px-5 py-2.5 text-[13px] font-semibold text-black"
                >
                  Riprova
                </button>
              )}
              <button
                type="button"
                onClick={handleBack}
                className="rounded-full border border-white/20 px-5 py-2.5 text-[13px] font-semibold text-white"
              >
                Torna indietro
              </button>
            </div>
          </div>
        </div>
      )}

      {buffering && !bootLoading && !castDevice && !playbackError && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
          <div className="rounded-full border border-white/15 bg-black/45 p-3 shadow-lg">
            <Loader2 className="h-7 w-7 animate-spin text-white/85" />
          </div>
        </div>
      )}

      {guestBlocked && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 px-6 backdrop-blur-sm">
          <div className="max-w-md text-center">
            <p className="font-display text-2xl font-semibold text-white">
              Limite giornaliero raggiunto
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-white/75">
              Come ospite puoi guardare fino a 1 ora. Crea un account per
              continuare senza limiti.
            </p>
            <button
              type="button"
              onClick={handleBack}
              className="mt-6 rounded-full bg-white px-5 py-2.5 text-[13px] font-semibold text-black"
            >
              Torna indietro
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showUpNext && nextEp && onPlayEpisode && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="pointer-events-auto absolute inset-x-0 bottom-24 z-30 px-6 sm:bottom-28 sm:px-10"
          >
            <div className="mx-auto flex max-w-3xl items-center gap-4 rounded-lg border border-white/10 bg-black/85 p-3 shadow-2xl backdrop-blur-md sm:gap-5 sm:p-4">
              <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-md sm:w-36">
                <PosterImage item={nextEp} variant="episode" />
                {autoplaySeconds !== null && autoplaySeconds > 0 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white text-lg font-semibold tabular-nums text-white sm:h-14 sm:w-14 sm:text-xl">
                      {autoplaySeconds}
                    </span>
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                  Continua a guardare
                </p>
                <p className="mt-1 truncate text-[15px] font-medium text-white sm:text-[16px]">
                  {episodeDisplayTitle(nextEp)}
                </p>
                {episodeCode(nextEp) && (
                  <p className="mt-0.5 text-[11px] uppercase tracking-wider text-white/50">
                    {episodeCode(nextEp)}
                  </p>
                )}
                {autoplaySeconds !== null && autoplaySeconds > 0 && (
                  <p className="mt-1 text-[12px] text-white/65">
                    Prossimo episodio tra {autoplaySeconds}s
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={playNextEpisode}
                  className="rounded bg-white px-4 py-2 text-[13px] font-medium text-black hover:bg-white/90"
                >
                  Guarda ora
                </button>
                <button
                  type="button"
                  onClick={cancelAutoplay}
                  className="rounded border border-white/20 px-3 py-2 text-[13px] text-white/80 hover:bg-white/10"
                >
                  Annulla
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEpisodes && hasEpisodes && (
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="absolute inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-white/10 bg-black/95 backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-white/50">
                  Episodi
                </p>
                <p className="text-[15px] font-medium text-white">
                  {media.seriesTitle}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowEpisodes(false);
                  resetHideTimer();
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"
              >
                <X className="h-4 w-4 text-white" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {orderedEpisodes.map((ep) => {
                const active = ep.id === media.id;
                return (
                  <button
                    key={ep.id}
                    onClick={() => {
                      onPlayEpisode?.(ep.id);
                      setShowEpisodes(false);
                    }}
                    className={`mb-2 flex w-full gap-3 rounded-lg p-2 text-left transition-colors ${
                      active ? "bg-white/15" : "hover:bg-white/8"
                    }`}
                  >
                    <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded">
                      <PosterImage item={ep} variant="episode" />
                    </div>
                    <div className="min-w-0 py-1">
                      <p className="truncate text-[13px] font-medium text-white">
                        {episodeDisplayTitle(ep)}
                      </p>
                      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-white/50">
                        {episodeCode(ep) || "Episodio"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <CastDialog
        open={showCast}
        onClose={() => setShowCast(false)}
        profileId={profileId}
        mediaId={remoteProxyId ? undefined : media.id}
        filePath={media.filePath}
        remoteCast={
          remoteProxyId
            ? {
                proxyId: remoteProxyId,
                title: media.title,
                isHls: effectiveIsHls,
                startSecs: resumeAt,
              }
            : undefined
        }
        onCasting={(device) => {
          setCastDevice(device);
          markBootDone();
          setPlaying(true);
          const video = videoRef.current;
          if (video) video.pause();
        }}
      />

      <WatchPartyPanel
        open={showPartyPanel}
        onClose={() => setShowPartyPanel(false)}
        profileId={profileId}
        profileName={profileName}
        defaultTab="create"
        mediaId={partyMediaId}
        title={media.title}
        streamUrl={streamUrl}
        isHls={isHls}
        posterUrl={media.posterUrl}
        remotePlayback={Boolean(remotePlayback)}
        session={partySession}
        partyMembers={partyMembers}
        partyConnected={partyConnected}
        partyError={partyError}
        onLeaveParty={() => void leaveParty()}
        onSessionReady={(session) => {
          updatePartySession(session);
        }}
      />

      {partySession && !showPartyPanel && (
        <WatchPartyChatDock
          session={partySession}
          cloudUserId={cloudProfile?.id}
        />
      )}
    </div>
  );
});
