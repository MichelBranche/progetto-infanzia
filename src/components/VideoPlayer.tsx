import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import Hls, { type Level, type MediaPlaylist } from "hls.js";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Cast,
  Pause,
  Play,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
  ListVideo,
  Loader2,
  SkipForward,
  SkipBack,
  X,
  Subtitles,
  Settings2,
  Users,
  Languages,
} from "lucide-react";
import { castTransport, getCastPosition, saveWatchProgress } from "../lib/api";
import { saveStreamingWatchProgress } from "../lib/addonsApi";
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
import { formatDuration, mediaTypeLabel } from "../types/media";
import { PosterImage } from "./PosterImage";
import { CastDialog } from "./CastDialog";
import { PlayerScrubBar } from "./PlayerScrubBar";
import { PlayerChromeButton } from "./PlayerChromeButton";
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

interface VideoPlayerProps {
  streamUrl: string;
  media: MediaItem;
  episodes?: MediaItem[];
  isHls?: boolean;
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
}

export interface VideoPlayerHandle {
  flushWatchProgress: () => Promise<void>;
}

/** Secondi prima della fine in cui mostrare "Continua a guardare" (5–10 min, ~12% runtime). */
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
  return `Qualità ${index + 1}`;
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
      remotePlayback,
      onBack,
      onPlayEpisode,
      watchPartySession: watchPartySessionProp,
      onWatchPartySessionChange,
      onStreamAudioLanguageChange,
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
  const notifyPartySeekRef = useRef<(position: number, nextPlaying?: boolean) => void>(
    () => {},
  );
  const actionPulseIdRef = useRef(0);
  const actionPulseTimerRef = useRef<number | null>(null);
  const { isGuest, guestAccessBlocked } = useAppAccess();

  const [playing, setPlaying] = useState(() => {
    if (watchPartySessionProp?.role === "guest") {
      return watchPartySessionProp.room.playing;
    }
    return true;
  });
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [guestBlocked, setGuestBlocked] = useState(false);
  const [showEpisodes, setShowEpisodes] = useState(false);
  const [showUpNext, setShowUpNext] = useState(false);
  const [autoplaySeconds, setAutoplaySeconds] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
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
            remotePlayback?.catalogPrefix === "loonex") &&
          remotePlayback.slug &&
          (remotePlayback.titleId ||
            remotePlayback.catalogPrefix === "saturn" ||
            remotePlayback.catalogPrefix === "loonex")
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
    setShowControls(true);
    clearTimeout(hideTimer.current);
    if (!showEpisodes && !showQualityMenu && !showSubtitleMenu && !showAudioMenu) {
      hideTimer.current = setTimeout(() => setShowControls(false), 3500);
    }
  }, [showEpisodes, showQualityMenu, showSubtitleMenu, showAudioMenu]);

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
      clearTimeout(hideTimer.current);
    },
    [],
  );

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await containerRef.current?.requestFullscreen();
    }
  }, []);

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
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

  useEffect(() => {
    autoplayCancelledRef.current = false;
    episodeNavTriggeredRef.current = false;
    setShowUpNext(false);
    setAutoplaySeconds(null);
    setLoading(true);
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

    if (effectiveIsHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        enableWebVTT: true,
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

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false);
        syncQualityOptions();
        syncSubtitleOptions();
        syncAudioOptions();
        hls.subtitleDisplay = false;
        hls.subtitleTrack = -1;
        setSelectedSubtitle(-1);
        video.play().catch(() => setPlaying(false));
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
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setLoading(false);
          setPlaying(false);
        }
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
  }, [effectiveStreamUrl, effectiveIsHls, castDevice]);

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
    // gradualmente variando la velocità di riproduzione (nessuno scatto visibile).
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
          // Scarto piccolo: converge in modo impercettibile modulando la velocità
          // (guest indietro => accelera, guest avanti => rallenta). Niente seek,
          // quindi nessuno scatto né buffering tra un heartbeat e l'altro.
          const rate = Math.min(1.1, Math.max(0.9, 1 - drift * 0.6));
          if (Math.abs(video.playbackRate - rate) > 0.005) {
            video.playbackRate = rate;
          }
        } else if (video.playbackRate !== 1) {
          // Allineati: torna a velocità normale.
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
        setLoading(true);
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

      const video = videoRef.current;
      if (!video) return;
      video.currentTime = time;
      setCurrentTime(time);
      if (duration - time > upNextLeadSeconds(duration)) {
        setShowUpNext(false);
        setAutoplaySeconds(null);
      }
      if (isPartyHost) {
        notifyPartySeek(time);
      }
      resetHideTimer();
    },
    [castDevice, duration, resetHideTimer, isPartyHost, isPartyGuest, notifyPartySeek],
  );

  const skip = useCallback(
    (delta: number) => {
      if (isPartyGuest) return;
      flashAction("skip", delta);
      const limit = duration > 0 ? duration : currentTime + Math.abs(delta);
      void seek(Math.max(0, Math.min(limit, currentTime + delta)));
    },
    [currentTime, duration, seek, isPartyGuest, flashAction],
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

  useEffect(() => {
    const video = videoRef.current;
    if (!video || castDevice) return;

    const onPause = () => {
      if (applyingPartyRemoteRef.current || syncSeekInFlightRef.current) return;
      setPlaying(false);
      saveProgress(video.currentTime, video.duration);
      if (partySessionRef.current?.role === "host") {
        notifyPartySeekRef.current(video.currentTime, false);
      }
    };

    const onPlaying = () => {
      // Sempre spegni lo spinner: i seek di sync non devono lasciare il loading acceso.
      setLoading(false);
      if (applyingPartyRemoteRef.current || syncSeekInFlightRef.current) return;
      if (partySessionRef.current?.role === "host") {
        notifyPartySeekRef.current(video.currentTime, true);
      }
    };

    const onLoaded = () => {
      setDuration(video.duration);
      setLoading(false);
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
        }
        return;
      }
      if (resumeAt > 5 && resumeAt < video.duration - 10) {
        video.currentTime = resumeAt;
        setCurrentTime(resumeAt);
      }
      video.play().catch(() => setPlaying(false));
    };

    const onTimeUpdate = () => {
      hostLiveTimeRef.current = video.currentTime;
      setCurrentTime(video.currentTime);
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
      const now = Date.now();
      if (now - lastSave.current > 2000) {
        lastSave.current = now;
        saveProgress(video.currentTime, video.duration);
      }
      const lead = upNextLeadSeconds(video.duration);
      if (
        nextEp &&
        onPlayEpisode &&
        !autoplayCancelledRef.current &&
        video.duration > 0 &&
        video.duration - video.currentTime <= lead
      ) {
        const secs = Math.max(0, Math.ceil(video.duration - video.currentTime));
        setShowUpNext(true);
        setAutoplaySeconds(secs);
      } else if (video.duration - video.currentTime > lead) {
        setShowUpNext(false);
        setAutoplaySeconds(null);
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
      // Non mostrare lo spinner per i seek di sincronizzazione watch party.
      if (applyingPartyRemoteRef.current || syncSeekInFlightRef.current) return;
      setLoading(true);
    };

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("pause", onPause);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);
    video.addEventListener("waiting", onWaiting);

    return () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("waiting", onWaiting);
      void saveProgress(video.currentTime, video.duration);
    };
  }, [effectiveStreamUrl, resumeAt, saveProgress, nextEp, playNextEpisode, castDevice, onPlayEpisode, notify]);

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
        setLoading(false);
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
  }, [castDevice, saveProgress]);

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
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const changeVolume = (value: number) => {
    const video = videoRef.current;
    if (!video) return;
    const v = Math.max(0, Math.min(1, value));
    video.volume = v;
    video.muted = v === 0;
    setVolume(v);
    setMuted(v === 0);
  };

  const selectQuality = useCallback((level: number) => {
    const hls = hlsRef.current;
    const video = videoRef.current;
    if (!hls || !video) return;
    const position = video.currentTime;
    hls.currentLevel = level;
    setSelectedQuality(level);
    setShowQualityMenu(false);
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
    resetHideTimer();
  }, [resetHideTimer]);

  const selectAudio = useCallback((track: number) => {
    const hls = hlsRef.current;
    if (!hls || track < 0 || track >= hls.audioTracks.length) return;
    hls.audioTrack = track;
    setSelectedAudio(track);
    setShowAudioMenu(false);
    resetHideTimer();
  }, [resetHideTimer]);

  const selectStreamAudio = useCallback(
    async (lang: PlayerStreamAudioLanguage) => {
      if (!onStreamAudioLanguageChange) return;
      savePlayerAudioLanguage(lang);
      setStreamAudioLang(lang);
      setShowAudioMenu(false);
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
    if (!video || !isHls || selectedSubtitle < 0 || castDevice) {
      setActiveCueText(null);
      return;
    }

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
      setActiveCueText(lines.length > 0 ? lines.join("\n") : null);
    };

    video.addEventListener("timeupdate", readActiveCues);
    video.addEventListener("seeked", readActiveCues);
    readActiveCues();

    return () => {
      video.removeEventListener("timeupdate", readActiveCues);
      video.removeEventListener("seeked", readActiveCues);
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

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferPct = duration > 0 ? (buffered / duration) * 100 : 0;
  const chromeInteractive =
    showControls ||
    showEpisodes ||
    showQualityMenu ||
    showSubtitleMenu ||
    showAudioMenu;

  return (
    <div
      ref={containerRef}
      className="player-shell relative flex h-full flex-col bg-black"
      onMouseMove={resetHideTimer}
      onClick={resetHideTimer}
      onTouchStart={resetHideTimer}
      onTouchMove={resetHideTimer}
    >
      <video
        ref={videoRef}
        src={effectiveIsHls && Hls.isSupported() ? undefined : effectiveStreamUrl}
        className="player-video h-full w-full object-contain"
        playsInline
        onClick={(e) => {
          e.stopPropagation();
          void togglePlay();
        }}
      />

      {activeCueText && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[88px] z-[25] flex justify-center px-6 sm:bottom-[96px] sm:px-10">
          <p className="max-w-3xl whitespace-pre-line rounded-md bg-black/80 px-4 py-2 text-center text-[clamp(14px,2.2vw,22px)] font-medium leading-snug text-white shadow-lg [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
            {activeCueText}
          </p>
        </div>
      )}

      <PlayerActionFeedback pulse={actionPulse} />

      <div className="pointer-events-none absolute inset-0 z-[34]">
        <div className="absolute left-0 top-0 px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pt-5">
          <PlayerChromeButton
            size="lg"
            onClick={handleBack}
            aria-label="Esci dal player"
            title="Indietro"
            className="pointer-events-auto border-white/20 bg-black/55"
          >
            <ArrowLeft className="h-5 w-5 sm:h-[1.35rem] sm:w-[1.35rem]" strokeWidth={2} />
          </PlayerChromeButton>
        </div>
      </div>

      {loading && !castDevice && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/20 border-t-white" />
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

      <motion.div
        className="pointer-events-none absolute inset-0 z-[30] flex flex-col justify-between"
        animate={{ opacity: chromeInteractive ? 1 : 0 }}
        transition={{ duration: 0.2 }}
      >
        <div
          className={`bg-gradient-to-b from-black/80 to-transparent px-4 py-4 pl-16 sm:px-6 sm:py-5 sm:pl-[4.75rem] ${
            chromeInteractive ? "pointer-events-auto" : "pointer-events-none"
          }`}
        >
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-base font-semibold text-white sm:text-lg">
                {episodeDisplayTitle(media)}
              </h1>
              <p className="mt-0.5 truncate text-[11px] font-medium uppercase tracking-wider text-white/50">
                {episodeCode(media) && <span>{episodeCode(media)}</span>}
                {episodeCode(media) && media.seriesTitle && (
                  <span className="text-white/30"> · </span>
                )}
                {media.seriesTitle && <span>{media.seriesTitle}</span>}
                {!episodeCode(media) && !media.seriesTitle && (
                  <span>{mediaTypeLabel(media.mediaType)}</span>
                )}
              </p>
            </div>
            {hasEpisodes && (
              <PlayerChromeButton
                variant="pill"
                onClick={() => {
                  setShowEpisodes(true);
                  setShowControls(true);
                }}
                aria-label="Episodi"
                className="hidden sm:inline-flex"
              >
                <ListVideo className="h-4 w-4" />
                <span className="text-[12px]">Episodi</span>
              </PlayerChromeButton>
            )}
            {hasEpisodes && (
              <PlayerChromeButton
                onClick={() => {
                  setShowEpisodes(true);
                  setShowControls(true);
                }}
                aria-label="Episodi"
                className="sm:hidden"
              >
                <ListVideo className="h-4 w-4" />
              </PlayerChromeButton>
            )}
            {canCast && (
            <PlayerChromeButton
              onClick={() => {
                setShowCast(true);
                setShowControls(true);
              }}
              title="Trasmetti alla TV"
              aria-label="Trasmetti alla TV"
              className={
                castingTo
                  ? "border-mint/40 bg-mint/15 text-mint hover:bg-mint/20"
                  : ""
              }
            >
              <Cast className="h-4 w-4" />
            </PlayerChromeButton>
            )}
            <PlayerChromeButton
              onClick={() => {
                setShowPartyPanel(true);
                setShowControls(true);
              }}
              title="Guarda insieme"
              aria-label="Guarda insieme"
              className={
                partySession
                  ? "border-accent/40 bg-accent/15 text-accent hover:bg-accent/20"
                  : ""
              }
            >
              <Users className="h-4 w-4" />
            </PlayerChromeButton>
          </div>
        </div>

        {castingTo && (
          <div className="absolute left-1/2 top-24 z-20 max-w-sm -translate-x-1/2 rounded-xl border border-mint/30 bg-black/75 px-4 py-2.5 text-center text-[12px] leading-relaxed text-mint backdrop-blur-sm">
            Trasmissione su {castingTo}
            <span className="mt-0.5 block text-[11px] text-mint/80">
              Usa il telecomando TV o i controlli qui sotto
            </span>
            <button
              type="button"
              onClick={() => void stopCast()}
              className="mt-2 rounded-full border border-mint/40 px-3 py-1 text-[11px] font-medium text-mint transition-colors hover:bg-mint/10"
            >
              Interrompi trasmissione
            </button>
          </div>
        )}

        <div
          className={`bg-gradient-to-t from-black/90 via-black/50 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-12 sm:px-6 sm:pb-6 sm:pt-16 ${
            chromeInteractive ? "pointer-events-auto" : "pointer-events-none"
          }`}
        >
          <PlayerScrubBar
            duration={duration}
            currentTime={currentTime}
            bufferPct={bufferPct}
            progressPct={progress}
            streamUrl={effectiveStreamUrl}
            isHls={effectiveIsHls}
            disabled={!effectiveStreamUrl || castDevice != null || isPartyGuest}
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
          />

          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-3">
              <PlayerChromeButton
                onClick={() => void togglePlay()}
                disabled={isPartyGuest}
                size="lg"
                aria-label={playing ? "Pausa" : "Play"}
                title={isPartyGuest ? "Controlli gestiti dall'host" : undefined}
                className="border-transparent bg-transparent shadow-none hover:bg-white/10 disabled:bg-transparent"
              >
                {playing ? (
                  <Pause className="h-7 w-7" fill="currentColor" />
                ) : (
                  <Play className="h-7 w-7 fill-current" />
                )}
              </PlayerChromeButton>

              <PlayerChromeButton
                onClick={() => skip(-10)}
                disabled={isPartyGuest}
                aria-label="Indietro 10 secondi"
                title="Indietro 10s"
                className="border-transparent bg-transparent shadow-none hover:bg-white/10 disabled:bg-transparent"
              >
                <RotateCcw className="h-5 w-5" />
              </PlayerChromeButton>
              <PlayerChromeButton
                onClick={() => skip(10)}
                disabled={isPartyGuest}
                aria-label="Avanti 10 secondi"
                title="Avanti 10s"
                className="border-transparent bg-transparent shadow-none hover:bg-white/10 disabled:bg-transparent"
              >
                <RotateCw className="h-5 w-5" />
              </PlayerChromeButton>

              {prevEp && (
                <button
                  type="button"
                  onClick={playPrevEpisode}
                  className="hidden h-9 items-center gap-1.5 rounded-full border border-white/15 px-3 text-white/90 transition-colors hover:bg-white/10 hover:text-white sm:flex"
                  title="Episodio precedente"
                >
                  <SkipBack className="h-4 w-4" />
                  <span className="hidden text-[12px] font-medium md:inline">
                    Precedente
                  </span>
                </button>
              )}

              {nextEp && (
                <button
                  type="button"
                  onClick={playNextEpisode}
                  className="hidden h-9 items-center gap-1.5 rounded-full border border-white/15 px-3 text-white/90 transition-colors hover:bg-white/10 hover:text-white sm:flex"
                  title="Prossimo episodio"
                >
                  <SkipForward className="h-4 w-4" />
                  <span className="hidden text-[12px] font-medium md:inline">
                    Prossimo
                  </span>
                </button>
              )}

              <div
                className="relative hidden items-center sm:flex"
                onMouseEnter={() => setShowVolume(true)}
                onMouseLeave={() => setShowVolume(false)}
              >
                <button
                  onClick={() => {
                    const video = videoRef.current;
                    if (!video) return;
                    video.muted = !video.muted;
                    setMuted(video.muted);
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
                >
                  {muted || volume === 0 ? (
                    <VolumeX className="h-5 w-5" />
                  ) : (
                    <Volume2 className="h-5 w-5" />
                  )}
                </button>
                <motion.div
                  initial={false}
                  animate={{
                    width: showVolume ? 88 : 0,
                    opacity: showVolume ? 1 : 0,
                  }}
                  className="overflow-hidden"
                >
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={muted ? 0 : volume}
                    onChange={(e) => changeVolume(Number(e.target.value))}
                    className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-white/30 accent-white [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                  />
                </motion.div>
              </div>

              <button
                onClick={() => {
                  const video = videoRef.current;
                  if (!video) return;
                  video.muted = !video.muted;
                  setMuted(video.muted);
                }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white sm:hidden"
                aria-label={muted || volume === 0 ? "Attiva audio" : "Disattiva audio"}
              >
                {muted || volume === 0 ? (
                  <VolumeX className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </button>

              <span className="hidden text-[12px] tabular-nums text-white/70 sm:inline">
                {formatDuration(currentTime)} / {formatDuration(duration)}
              </span>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              {isHls && qualityOptions.length > 1 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowQualityMenu((open) => !open);
                      setShowSubtitleMenu(false);
                      setShowAudioMenu(false);
                      resetHideTimer();
                    }}
                    className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-white/80 transition-colors hover:bg-white/10 hover:text-white ${
                      showQualityMenu ? "bg-white/10 text-white" : ""
                    }`}
                    title="Qualità video"
                    aria-label="Qualità video"
                  >
                    <Settings2 className="h-4 w-4" />
                    <span className="hidden text-[12px] font-medium md:inline">
                      {activeQualityLabel}
                    </span>
                  </button>
                  {showQualityMenu && (
                    <div
                      className="absolute bottom-full right-0 z-40 mb-2 min-w-[168px] overflow-hidden rounded-lg border border-white/10 bg-black/95 py-1 shadow-2xl backdrop-blur-md"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                        Qualità
                      </p>
                      {qualityOptions.map((option) => (
                        <button
                          key={option.level}
                          type="button"
                          onClick={() => selectQuality(option.level)}
                          className={`flex w-full px-3 py-2 text-left text-[13px] transition-colors hover:bg-white/10 ${
                            selectedQuality === option.level
                              ? "text-mint"
                              : "text-white/85"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {isHls && subtitleOptions.length > 1 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowSubtitleMenu((open) => !open);
                      setShowQualityMenu(false);
                      setShowAudioMenu(false);
                      resetHideTimer();
                    }}
                    className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-white/80 transition-colors hover:bg-white/10 hover:text-white ${
                      showSubtitleMenu || selectedSubtitle >= 0
                        ? "bg-white/10 text-white"
                        : ""
                    }`}
                    title="Sottotitoli"
                    aria-label="Sottotitoli"
                  >
                    <Subtitles className="h-4 w-4" />
                    <span className="hidden max-w-[96px] truncate text-[12px] font-medium md:inline">
                      {activeSubtitleLabel}
                    </span>
                  </button>
                  {showSubtitleMenu && (
                    <div
                      className="absolute bottom-full right-0 z-40 mb-2 max-h-[min(320px,50vh)] min-w-[220px] overflow-y-auto rounded-lg border border-white/10 bg-black/95 py-1 shadow-2xl backdrop-blur-md"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                        Sottotitoli
                      </p>
                      {subtitleOptions.map((option) => (
                        <button
                          key={option.track}
                          type="button"
                          onClick={() => selectSubtitle(option.track)}
                          className={`flex w-full px-3 py-2 text-left text-[13px] transition-colors hover:bg-white/10 ${
                            selectedSubtitle === option.track
                              ? "text-mint"
                              : "text-white/85"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {canShowAudioMenu && (
                <div className="relative">
                  <button
                    type="button"
                    disabled={audioSwitching}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAudioMenu((open) => !open);
                      setShowQualityMenu(false);
                      setShowSubtitleMenu(false);
                      resetHideTimer();
                    }}
                    className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50 ${
                      showAudioMenu ? "bg-white/10 text-white" : ""
                    }`}
                    title="Lingua audio"
                    aria-label="Lingua audio"
                  >
                    {audioSwitching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Languages className="h-4 w-4" />
                    )}
                    <span className="hidden max-w-[108px] truncate text-[12px] font-medium md:inline">
                      {activeAudioLabel}
                    </span>
                  </button>
                  {showAudioMenu && (
                    <div
                      className="absolute bottom-full right-0 z-40 mb-2 max-h-[min(320px,50vh)] min-w-[220px] overflow-y-auto rounded-lg border border-white/10 bg-black/95 py-1 shadow-2xl backdrop-blur-md"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                        Lingua audio
                      </p>
                      {onStreamAudioLanguageChange &&
                        PLAYER_STREAM_AUDIO_OPTIONS.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => void selectStreamAudio(option.id)}
                            className={`flex w-full px-3 py-2 text-left text-[13px] transition-colors hover:bg-white/10 ${
                              streamAudioLang === option.id
                                ? "text-mint"
                                : "text-white/85"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      {onStreamAudioLanguageChange && audioOptions.length > 1 && (
                        <div className="my-1 border-t border-white/10" />
                      )}
                      {audioOptions.length > 1 &&
                        audioOptions.map((option) => (
                          <button
                            key={option.track}
                            type="button"
                            onClick={() => selectAudio(option.track)}
                            className={`flex w-full px-3 py-2 text-left text-[13px] transition-colors hover:bg-white/10 ${
                              selectedAudio === option.track
                                ? "text-mint"
                                : "text-white/85"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}

            <button
              onClick={toggleFullscreen}
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
            >
              {isFullscreen ? (
                <Minimize className="h-4 w-4" />
              ) : (
                <Maximize className="h-4 w-4" />
              )}
            </button>
            </div>
          </div>
        </div>
      </motion.div>

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
          setLoading(false);
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
