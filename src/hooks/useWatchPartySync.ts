import { useCallback, useEffect, useRef, useState } from "react";
import {
  closeCloudWatchParty,
  fetchCloudWatchParty,
  pollCloudWatchParty,
  subscribeCloudWatchParty,
  updateCloudWatchPartySync,
} from "../lib/cloudWatchParty";
import { lanWatchPartyErrorMessage } from "../lib/watchPartyNetwork";
import {
  lanWatchPartyWsUrl,
  localhostWatchPartyWsUrl,
} from "../lib/watchPartyApi";
import type {
  WatchPartyMember,
  WatchPartyRole,
  WatchPartyRoom,
  WatchPartyWsMessage,
} from "../types/watchParty";

export const DRIFT_THRESHOLD_SEC = 0.75;
const HOST_HEARTBEAT_MS = 1500;
const SYNC_THROTTLE_MS = 350;
const MAX_EXTRAPOLATE_SEC = 4;
const LAN_RECONNECT_BASE_MS = 1200;

function extrapolatePosition(
  position: number,
  playing: boolean,
  sentAt?: number,
): number {
  if (!playing || !sentAt) return position;
  const ageSec = (Date.now() - sentAt) / 1000;
  return position + Math.min(Math.max(ageSec, 0), MAX_EXTRAPOLATE_SEC);
}

interface UseWatchPartySyncOptions {
  session: {
    role: WatchPartyRole;
    room: WatchPartyRoom;
    hostIp?: string;
    relay?: "lan" | "cloud";
  } | null;
  profileId: string;
  profileName: string;
  cloudUserId?: string;
  playing: boolean;
  currentTime: number;
  onRemoteSync: (playing: boolean, position: number) => void;
  onGuestContent?: (streamUrl: string, isHls: boolean) => void;
}

export function useWatchPartySync({
  session,
  profileId,
  profileName,
  cloudUserId,
  playing,
  currentTime,
  onRemoteSync,
  onGuestContent,
}: UseWatchPartySyncOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const applyingRemoteRef = useRef(false);
  const lastSentRef = useRef(0);
  const playingRef = useRef(playing);
  const currentTimeRef = useRef(currentTime);
  const onRemoteSyncRef = useRef(onRemoteSync);
  const onGuestContentRef = useRef(onGuestContent);
  const lastCloudUpdatedAtRef = useRef<string | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const [members, setMembers] = useState<WatchPartyMember[]>(
    session?.room.members ?? [],
  );
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCloud = session?.relay === "cloud";

  playingRef.current = playing;
  currentTimeRef.current = currentTime;
  onRemoteSyncRef.current = onRemoteSync;
  onGuestContentRef.current = onGuestContent;

  const applyRemoteSync = useCallback(
    (nextPlaying: boolean, position: number, sentAt?: number) => {
      const adjusted = extrapolatePosition(position, nextPlaying, sentAt);
      applyingRemoteRef.current = true;
      onRemoteSyncRef.current(nextPlaying, adjusted);
      window.setTimeout(() => {
        applyingRemoteRef.current = false;
      }, 400);
    },
    [],
  );

  const pushCloudSync = useCallback(
    async (force = false) => {
      if (!session || session.role !== "host" || !cloudUserId) return;
      const now = Date.now();
      if (!force && now - lastSentRef.current < SYNC_THROTTLE_MS) return;
      lastSentRef.current = now;
      try {
        await updateCloudWatchPartySync(
          session.room.code,
          cloudUserId,
          playingRef.current,
          currentTimeRef.current,
        );
      } catch {
        setError("Sync cloud non riuscita");
      }
    },
    [session, cloudUserId],
  );

  const sendLanSync = useCallback(
    (force = false) => {
      if (!session || session.role !== "host") return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const now = Date.now();
      if (!force && now - lastSentRef.current < SYNC_THROTTLE_MS) return;
      lastSentRef.current = now;
      ws.send(
        JSON.stringify({
          type: "sync",
          playing: playingRef.current,
          position: currentTimeRef.current,
          sentAt: now,
        }),
      );
    },
    [session],
  );

  const sendSync = useCallback(
    (force = false) => {
      if (isCloud) {
        void pushCloudSync(force);
      } else {
        sendLanSync(force);
      }
    },
    [isCloud, pushCloudSync, sendLanSync],
  );

  useEffect(() => {
    if (!session) {
      setMembers([]);
      setConnected(false);
      return;
    }

    if (isCloud) {
      setError(null);
      lastCloudUpdatedAtRef.current = null;

      const applyRoom = (room: WatchPartyRoom) => {
        if (
          room.updatedAt &&
          lastCloudUpdatedAtRef.current &&
          room.updatedAt <= lastCloudUpdatedAtRef.current
        ) {
          return;
        }
        if (room.updatedAt) {
          lastCloudUpdatedAtRef.current = room.updatedAt;
        }

        if (session.role === "guest") {
          if (
            room.content.streamUrl &&
            room.content.contentKind !== "streaming"
          ) {
            onGuestContentRef.current?.(
              room.content.streamUrl,
              room.content.isHls,
            );
          }
          applyRemoteSync(
            room.playing,
            room.positionSecs,
            room.updatedAt ? Date.parse(room.updatedAt) : undefined,
          );
        }
      };

      if (session.role === "guest") {
        const content = session.room.content;
        if (content.streamUrl && content.contentKind !== "streaming") {
          onGuestContentRef.current?.(content.streamUrl, content.isHls);
        }
        applyRemoteSync(
          session.room.playing,
          session.room.positionSecs,
          session.room.updatedAt
            ? Date.parse(session.room.updatedAt)
            : undefined,
        );
      }

      let realtimeOk = false;
      let stopPoll: (() => void) | null = null;

      const unsubscribeRealtime = subscribeCloudWatchParty(
        session.room.code,
        applyRoom,
        (status) => {
          if (status === "SUBSCRIBED") {
            realtimeOk = true;
            setConnected(true);
            setError(null);
            stopPoll?.();
            stopPoll = null;
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT"
          ) {
            setError(
              "Sync live non disponibile — uso aggiornamento periodico",
            );
            if (!stopPoll) {
              stopPoll = pollCloudWatchParty(session.room.code, (room) => {
                setConnected(true);
                applyRoom(room);
              });
            }
          }
        },
      );

      const pollFallbackTimer = window.setTimeout(() => {
        if (!realtimeOk && !stopPoll) {
          stopPoll = pollCloudWatchParty(session.room.code, (room) => {
            setConnected(true);
            applyRoom(room);
          });
        }
      }, 4000);

      void fetchCloudWatchParty(session.room.code)
        .then((room) => {
          if (room) {
            setConnected(true);
            if (session.role === "guest") {
              applyRoom(room);
            }
          } else if (session.role === "guest") {
            setError("Stanza non trovata o chiusa dall'host");
            setConnected(false);
          }
        })
        .catch(() => {
          setError("Impossibile raggiungere il server cloud");
          setConnected(false);
        });

      if (session.role === "host") {
        setConnected(true);
      }

      return () => {
        window.clearTimeout(pollFallbackTimer);
        unsubscribeRealtime();
        stopPoll?.();
        setConnected(false);
      };
    }

    const isHost = session.role === "host";
    let cancelled = false;

    const connectLan = () => {
      if (cancelled) return;

      const wsUrl = isHost
        ? localhostWatchPartyWsUrl(session.room.code, profileId, profileName)
        : lanWatchPartyWsUrl(
            session.hostIp ?? session.room.hostIp ?? "127.0.0.1",
            session.room.code,
            profileId,
            profileName,
          );

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        setConnected(true);
        setError(null);
        if (isHost) sendLanSync(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as WatchPartyWsMessage;
          if (msg.type === "members") {
            setMembers(msg.members);
            return;
          }
          if (msg.type === "content" && !isHost) {
            onGuestContentRef.current?.(
              msg.content.streamUrl,
              msg.content.isHls,
            );
            return;
          }
          if (msg.type === "sync" && !isHost) {
            applyRemoteSync(msg.playing, msg.position, msg.sentAt);
          }
        } catch {
          // messaggio non valido
        }
      };

      ws.onerror = () => {
        setError(
          lanWatchPartyErrorMessage(
            session.hostIp ?? session.room.hostIp,
          ),
        );
        setConnected(false);
      };

      ws.onclose = () => {
        wsRef.current = null;
        setConnected(false);
        if (cancelled || isHost) return;

        const attempt = reconnectAttemptRef.current + 1;
        reconnectAttemptRef.current = attempt;
        const delay = Math.min(
          LAN_RECONNECT_BASE_MS * attempt,
          8000,
        );
        reconnectTimerRef.current = window.setTimeout(connectLan, delay);
      };
    };

    connectLan();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [
    session,
    profileId,
    profileName,
    isCloud,
    sendLanSync,
    applyRemoteSync,
  ]);

  useEffect(() => {
    if (!session || session.role !== "host" || applyingRemoteRef.current) {
      return;
    }
    sendSync(true);
  }, [playing, session, sendSync]);

  useEffect(() => {
    if (!session || session.role !== "host") return;
    const timer = window.setInterval(() => {
      if (playingRef.current) sendSync();
    }, HOST_HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [session, sendSync]);

  const notifySeek = useCallback(
    (position: number, nextPlaying?: boolean) => {
      if (!session || session.role !== "host") return;

      const nextPlay = nextPlaying ?? playingRef.current;
      if (isCloud && cloudUserId) {
        void updateCloudWatchPartySync(
          session.room.code,
          cloudUserId,
          nextPlay,
          position,
        );
        lastSentRef.current = Date.now();
        return;
      }

      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const now = Date.now();
      ws.send(
        JSON.stringify({
          type: "sync",
          playing: nextPlay,
          position,
          sentAt: now,
        }),
      );
      lastSentRef.current = now;
    },
    [session, isCloud, cloudUserId],
  );

  return {
    members,
    connected,
    error,
    notifySeek,
    isApplyingRemote: applyingRemoteRef,
    driftThreshold: DRIFT_THRESHOLD_SEC,
  };
}

export { closeCloudWatchParty };
