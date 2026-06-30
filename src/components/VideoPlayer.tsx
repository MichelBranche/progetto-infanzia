import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  SkipForward,
  SkipBack,
  X,
  Subtitles,
  Settings2,
  Users,
} from "lucide-react";
import { castTransport, getCastPosition, saveWatchProgress } from "../lib/api";
import { saveStreamingWatchProgress } from "../lib/addonsApi";
import {
  endWatchSession,
  startAddonWatchSession,
  startWatchSession,
  updateWatchSession,
} from "../lib/parentalApi";
import { compareEpisodes, episodeCodeLabel, episodeDisplayTitle, nextEpisode, prevEpisode } from "../lib/browse";
import { useProfile } from "../context/ProfileContext";
import { useCloudAccount } from "../context/CloudAccountContext";
import type { CastDevice, MediaItem } from "../types/media";
import { formatDuration, mediaTypeLabel } from "../types/media";
import { PosterImage } from "./PosterImage";
import { CastDialog } from "./CastDialog";
import { PlayerScrubBar } from "./PlayerScrubBar";
import { WatchPartyPanel } from "./WatchPartyPanel";
import { useWatchPartySync } from "../hooks/useWatchPartySync";
import { closeCloudWatchParty } from "../lib/cloudWatchParty";
import { closeWatchParty } from "../lib/watchPartyApi";
import type { WatchPartySession } from "../types/watchParty";
import { parseRemoteProxyId } from "../lib/cast";

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
  onBack: () => void;
  onPlayEpisode?: (id: string) => void;
  watchPartySession?: WatchPartySession | null;
  onWatchPartySessionChange?: (session: WatchPartySession | null) => void;
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

export function VideoPlayer({
  streamUrl,
  media,
  episodes = [],
  isHls = false,
  remotePlayback,
  onBack,
  onPlayEpisode,
  watchPartySession: watchPartySessionProp,
  onWatchPartySessionChange,
}: VideoPlayerProps) {
  const { activeProfile } = useProfile();
  const { profile: cloudProfile } = useCloudAccount();
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

  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
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
  const [qualityOptions, setQualityOptions] = useState<QualityOption[]>([]);
  const [selectedQuality, setSelectedQuality] = useState(-1);
  const [subtitleOptions, setSubtitleOptions] = useState<SubtitleOption[]>([]);
  const [selectedSubtitle, setSelectedSubtitle] = useState(-1);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [activeCueText, setActiveCueText] = useState<string | null>(null);
  const castingTo = castDevice?.name ?? null;
  const effectiveStreamUrl =
    partySession?.role === "guest" && partyStreamUrl ? partyStreamUrl : streamUrl;
  const effectiveIsHls =
    partySession?.role === "guest" && partyStreamUrl ? partyIsHls : isHls;
  const remoteProxyId = useMemo(
    () => parseRemoteProxyId(effectiveStreamUrl),
    [effectiveStreamUrl],
  );
  const canCast = Boolean(remoteProxyId || media.filePath);

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
      if (
        (remotePlayback?.catalogPrefix === "sc" ||
          remotePlayback?.catalogPrefix === "saturn") &&
        remotePlayback.slug &&
        remotePlayback.titleId
      ) {
        try {
          await saveStreamingWatchProgress(profileId, {
            catalogPrefix: remotePlayback.catalogPrefix,
            contentType: remotePlayback.contentType,
            titleId: remotePlayback.titleId,
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
        } catch {
          // silent
        }
        return;
      }
      if (remotePlayback) return;
      try {
        await saveWatchProgress(profileId, media.id, position, dur || undefined);
      } catch {
        // silent
      }
    },
    [media.id, media.title, media.posterUrl, profileId, remotePlayback],
  );

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    if (!showEpisodes && !showQualityMenu && !showSubtitleMenu) {
      hideTimer.current = setTimeout(() => setShowControls(false), 3500);
    }
  }, [showEpisodes, showQualityMenu, showSubtitleMenu]);

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
    setPlaying(true);
    setCastDevice(null);
    setQualityOptions([]);
    setSelectedQuality(-1);
    setSubtitleOptions([]);
    setSelectedSubtitle(-1);
    setShowQualityMenu(false);
    setShowSubtitleMenu(false);
    setActiveCueText(null);
  }, [media.id, effectiveStreamUrl, effectiveIsHls]);

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
    const video = videoRef.current;
    if (!video || castDevice || !effectiveStreamUrl) return;

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

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false);
        syncQualityOptions();
        syncSubtitleOptions();
        hls.subtitleDisplay = false;
        hls.subtitleTrack = -1;
        setSelectedSubtitle(-1);
        video.play().catch(() => setPlaying(false));
      });
      hls.on(Hls.Events.LEVELS_UPDATED, syncQualityOptions);
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, syncSubtitleOptions);
      hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, (_event, data) => {
        setSelectedSubtitle(data.id);
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

  useEffect(() => {
    if (!partySession || partySession.role !== "guest") {
      setPartyStreamUrl(streamUrl);
      setPartyIsHls(isHls);
    }
  }, [streamUrl, isHls, partySession]);

  const handleRemoteSync = useCallback((nextPlaying: boolean, position: number) => {
    const video = videoRef.current;
    if (!video) return;
    if (Math.abs(video.currentTime - position) > 2.5) {
      video.currentTime = position;
      setCurrentTime(position);
    }
    if (nextPlaying && video.paused) {
      void video.play();
      setPlaying(true);
    } else if (!nextPlaying && !video.paused) {
      video.pause();
      setPlaying(false);
    }
  }, []);

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
    onRemoteSync: handleRemoteSync,
    onGuestContent: (url, guestHls) => {
      setPartyStreamUrl(url);
      setPartyIsHls(guestHls);
      setLoading(true);
    },
  });

  const updatePartySession = useCallback(
    (next: WatchPartySession | null) => {
      setPartySession(next);
      onWatchPartySessionChange?.(next);
    },
    [onWatchPartySessionChange],
  );

  const leaveParty = useCallback(async () => {
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
  }, [partySession, profileId, cloudProfile, updatePartySession]);

  const seek = useCallback(
    async (time: number) => {
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
      if (duration - time > 15) {
        setShowUpNext(false);
        setAutoplaySeconds(null);
      }
      if (partySession?.role === "host") {
        notifyPartySeek(time);
      }
      resetHideTimer();
    },
    [castDevice, duration, resetHideTimer, partySession, notifyPartySeek],
  );

  const skip = useCallback(
    (delta: number) => {
      const limit = duration > 0 ? duration : currentTime + Math.abs(delta);
      void seek(Math.max(0, Math.min(limit, currentTime + delta)));
    },
    [currentTime, duration, seek],
  );

  const togglePlay = useCallback(async () => {
    if (castDevice) {
      try {
        await castTransport(castDevice, playing ? "pause" : "play");
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
      void video.play();
      setPlaying(true);
      if (partySession?.role === "host") {
        notifyPartySeek(video.currentTime, true);
      }
    } else {
      video.pause();
      setPlaying(false);
      if (partySession?.role === "host") {
        notifyPartySeek(video.currentTime, false);
      }
    }
    resetHideTimer();
  }, [castDevice, playing, resetHideTimer, partySession, notifyPartySeek]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || castDevice) return;

    const onPause = () => {
      setPlaying(false);
      saveProgress(video.currentTime, video.duration);
    };

    const onLoaded = () => {
      setDuration(video.duration);
      setLoading(false);
      if (resumeAt > 5 && resumeAt < video.duration - 10) {
        video.currentTime = resumeAt;
        setCurrentTime(resumeAt);
      }
      video.play().catch(() => setPlaying(false));
    };

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
      const now = Date.now();
      if (now - lastSave.current > 2000) {
        lastSave.current = now;
        saveProgress(video.currentTime, video.duration);
      }
      if (
        nextEp &&
        !autoplayCancelledRef.current &&
        video.duration > 0 &&
        video.duration - video.currentTime <= 15
      ) {
        const secs = Math.max(0, Math.ceil(video.duration - video.currentTime));
        setShowUpNext(true);
        setAutoplaySeconds(secs);
      } else if (video.duration - video.currentTime > 15) {
        setShowUpNext(false);
        setAutoplaySeconds(null);
      }
    };

    const onEnded = () => {
      const sid = sessionIdRef.current;
      if (sid) {
        const elapsed = Math.floor((Date.now() - sessionStartRef.current) / 1000);
        void updateWatchSession(sid, elapsed);
        void endWatchSession(sid, true);
        sessionIdRef.current = null;
      }
      setPlaying(false);
      saveProgress(0, video.duration);
      if (!autoplayCancelledRef.current) {
        playNextEpisode();
      }
    };

    const onWaiting = () => setLoading(true);
    const onPlaying = () => setLoading(false);

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);

    return () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      saveProgress(video.currentTime, video.duration);
    };
  }, [effectiveStreamUrl, resumeAt, saveProgress, nextEp, playNextEpisode, castDevice]);

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
      if (castDevice) {
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
          case "Escape":
            if (showEpisodes) setShowEpisodes(false);
            else if (isFullscreen) exitFullscreen();
            break;
        }
        return;
      }

      const video = videoRef.current;
      if (!video) return;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          if (video.paused) {
            video.play();
            setPlaying(true);
          } else {
            video.pause();
            setPlaying(false);
          }
          resetHideTimer();
          break;
        case "ArrowLeft":
          video.currentTime = Math.max(0, video.currentTime - 10);
          resetHideTimer();
          break;
        case "ArrowRight":
          video.currentTime = Math.min(video.duration, video.currentTime + 10);
          resetHideTimer();
          break;
        case "f":
          toggleFullscreen();
          break;
        case "m":
          video.muted = !video.muted;
          setMuted(video.muted);
          resetHideTimer();
          break;
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
    castDevice,
    togglePlay,
    skip,
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

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferPct = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="relative flex h-full flex-col bg-black"
      onMouseMove={resetHideTimer}
      onClick={resetHideTimer}
    >
      <video
        ref={videoRef}
        src={effectiveIsHls && Hls.isSupported() ? undefined : effectiveStreamUrl}
        className="player-video h-full w-full object-contain"
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

      {loading && !castDevice && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      )}

      <AnimatePresence>
        {showUpNext && nextEp && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-28 right-8 z-20 w-72 overflow-hidden rounded-lg border border-white/10 bg-black/90 shadow-2xl backdrop-blur-md"
          >
            <button
              type="button"
              onClick={cancelAutoplay}
              className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white/80 hover:bg-black/80 hover:text-white"
              title="Annulla autoplay"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <div className="relative aspect-video">
              <PosterImage item={nextEp} variant="episode" />
              {autoplaySeconds !== null && autoplaySeconds > 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white text-xl font-semibold tabular-nums text-white">
                    {autoplaySeconds}
                  </span>
                </div>
              )}
            </div>
            <div className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-white/50">
                {autoplaySeconds !== null && autoplaySeconds > 0
                  ? `Prossimo episodio tra ${autoplaySeconds}s`
                  : "Prossimo episodio"}
              </p>
              <p className="mt-1 text-[14px] font-medium text-white">
                {episodeDisplayTitle(nextEp)}
              </p>
              {episodeCode(nextEp) && (
                <p className="mt-0.5 text-[11px] uppercase tracking-wider text-white/50">
                  {episodeCode(nextEp)}
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={playNextEpisode}
                  className="flex-1 rounded bg-white py-2 text-[13px] font-medium text-black"
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
        className="pointer-events-none absolute inset-0 flex flex-col justify-between"
        animate={{ opacity: showControls || showEpisodes || showQualityMenu || showSubtitleMenu ? 1 : 0 }}
        transition={{ duration: 0.2 }}
      >
        <div className="pointer-events-auto bg-gradient-to-b from-black/80 to-transparent px-6 py-5">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 backdrop-blur-sm transition-colors hover:bg-black/60"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-lg font-semibold text-white">
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
              <button
                onClick={() => {
                  setShowEpisodes(true);
                  setShowControls(true);
                }}
                className="flex items-center gap-2 rounded border border-white/15 bg-black/40 px-3 py-2 text-[12px] text-white/90 backdrop-blur-sm hover:bg-black/60"
              >
                <ListVideo className="h-4 w-4" />
                Episodi
              </button>
            )}
            {canCast && (
            <button
              type="button"
              onClick={() => {
                setShowCast(true);
                setShowControls(true);
              }}
              className={`flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur-sm transition-colors ${
                castingTo
                  ? "border-mint/40 bg-mint/15 text-mint"
                  : "border-white/15 bg-black/40 text-white/90 hover:bg-black/60"
              }`}
              title="Trasmetti alla TV"
            >
              <Cast className="h-4 w-4" />
            </button>
            )}
            <button
              type="button"
              onClick={() => {
                setShowPartyPanel(true);
                setShowControls(true);
              }}
              className={`flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur-sm transition-colors ${
                partySession
                  ? "border-accent/40 bg-accent/15 text-accent"
                  : "border-white/15 bg-black/40 text-white/90 hover:bg-black/60"
              }`}
              title="Guarda insieme"
            >
              <Users className="h-4 w-4" />
            </button>
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

        <div className="pointer-events-auto bg-gradient-to-t from-black/90 via-black/50 to-transparent px-6 pb-6 pt-16">
          <PlayerScrubBar
            duration={duration}
            currentTime={currentTime}
            bufferPct={bufferPct}
            progressPct={progress}
            streamUrl={effectiveStreamUrl}
            isHls={effectiveIsHls}
            disabled={!effectiveStreamUrl || castDevice != null}
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

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 sm:gap-4">
              <button
                type="button"
                onClick={() => void togglePlay()}
                className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-transform hover:scale-105"
              >
                {playing ? (
                  <Pause className="h-6 w-6" fill="currentColor" />
                ) : (
                  <Play className="h-6 w-6 fill-current" />
                )}
              </button>

              <button
                onClick={() => skip(-10)}
                className="hidden h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white sm:flex"
                title="Indietro 10s"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                onClick={() => skip(10)}
                className="hidden h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white sm:flex"
                title="Avanti 10s"
              >
                <RotateCw className="h-4 w-4" />
              </button>

              {prevEp && (
                <button
                  type="button"
                  onClick={playPrevEpisode}
                  className="flex h-9 items-center gap-1.5 rounded-full border border-white/15 px-3 text-white/90 transition-colors hover:bg-white/10 hover:text-white"
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
                  className="flex h-9 items-center gap-1.5 rounded-full border border-white/15 px-3 text-white/90 transition-colors hover:bg-white/10 hover:text-white"
                  title="Prossimo episodio"
                >
                  <SkipForward className="h-4 w-4" />
                  <span className="hidden text-[12px] font-medium md:inline">
                    Prossimo
                  </span>
                </button>
              )}

              <div
                className="relative flex items-center"
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

              <span className="text-[12px] tabular-nums text-white/70">
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
    </div>
  );
}
