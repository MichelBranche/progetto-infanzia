import { useCallback, useEffect, useRef, useState } from "react";
import {
  closeCloudWatchParty,
  fetchCloudWatchParty,
  touchCloudWatchPartyRoom,
  updateCloudWatchPartySync,
} from "../lib/cloudWatchParty";
import {
  connectWatchPartyBroadcast,
  type WatchPartyBroadcastConnection,
  type WatchPartyBroadcastSync,
} from "../lib/cloudWatchPartyBroadcast";
import { lanWatchPartyErrorMessage } from "../lib/watchPartyNetwork";
import {
  lanWatchPartyWsUrl,
  localhostWatchPartyWsUrl,
} from "../lib/watchPartyApi";
import type {
  WatchPartyContent,
  WatchPartyMember,
  WatchPartyRole,
  WatchPartyRoom,
  WatchPartyWsMessage,
} from "../types/watchParty";

export const DRIFT_THRESHOLD_SEC = 0.35;
const HOST_HEARTBEAT_PLAYING_MS = 800;
const HOST_HEARTBEAT_PAUSED_MS = 2500;
const CLOUD_KEEPALIVE_MS = 45_000;
const SYNC_THROTTLE_MS = 80;
const MAX_EXTRAPOLATE_SEC = 3;
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

function shouldApplyGuestContent(content: WatchPartyContent): boolean {
  return Boolean(content.streamUrl) && content.contentKind !== "streaming";
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
  /** Posizione live del video host (più precisa dello state React). */
  getHostPosition?: () => number;
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
  getHostPosition,
  onRemoteSync,
  onGuestContent,
}: UseWatchPartySyncOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const broadcastRef = useRef<WatchPartyBroadcastConnection | null>(null);
  const applyingRemoteRef = useRef(false);
  const lastSentRef = useRef(0);
  const lastAppliedSentAtRef = useRef(0);
  const playingRef = useRef(playing);
  const currentTimeRef = useRef(currentTime);
  const onRemoteSyncRef = useRef(onRemoteSync);
  const onGuestContentRef = useRef(onGuestContent);
  const getHostPositionRef = useRef(getHostPosition);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const [members, setMembers] = useState<WatchPartyMember[]>(
    session?.room.members ?? [],
  );
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCloud = session?.relay === "cloud";
  const presenceId = cloudUserId ?? profileId;

  playingRef.current = playing;
  currentTimeRef.current = currentTime;
  onRemoteSyncRef.current = onRemoteSync;
  onGuestContentRef.current = onGuestContent;
  getHostPositionRef.current = getHostPosition;

  const hostPosition = useCallback(() => {
    const live = getHostPositionRef.current?.();
    if (live != null && Number.isFinite(live) && live >= 0) return live;
    return currentTimeRef.current;
  }, []);

  const applyRemoteSync = useCallback(
    (nextPlaying: boolean, position: number, sentAt?: number) => {
      if (sentAt && sentAt < lastAppliedSentAtRef.current) return;
      if (sentAt) lastAppliedSentAtRef.current = sentAt;

      const adjusted = extrapolatePosition(position, nextPlaying, sentAt);
      applyingRemoteRef.current = true;
      onRemoteSyncRef.current(nextPlaying, adjusted);
      window.setTimeout(() => {
        applyingRemoteRef.current = false;
      }, 350);
    },
    [],
  );

  const applyGuestContent = useCallback((content: WatchPartyContent) => {
    if (!shouldApplyGuestContent(content)) return;
    onGuestContentRef.current?.(content.streamUrl, content.isHls);
  }, []);

  const buildSyncPayload = useCallback(
    (forcePosition?: number): WatchPartyBroadcastSync => ({
      playing: playingRef.current,
      position: forcePosition ?? hostPosition(),
      sentAt: Date.now(),
    }),
    [hostPosition],
  );

  const persistCloudSync = useCallback(
    (sync: WatchPartyBroadcastSync) => {
      if (!session || session.role !== "host" || !isCloud || !cloudUserId) return;
      void updateCloudWatchPartySync(
        session.room.code,
        cloudUserId,
        sync.playing,
        sync.position,
      ).catch(() => {});
    },
    [session, isCloud, cloudUserId],
  );

  const sendCloudSync = useCallback(
    (force = false, forcePosition?: number) => {
      const conn = broadcastRef.current;
      if (!session || session.role !== "host" || !conn) return;
      const now = Date.now();
      if (!force && now - lastSentRef.current < SYNC_THROTTLE_MS) return;
      lastSentRef.current = now;
      const payload = buildSyncPayload(forcePosition);
      conn.sendSync(payload);
      if (force) persistCloudSync(payload);
    },
    [session, buildSyncPayload, persistCloudSync],
  );

  const sendLanSync = useCallback(
    (force = false, forcePosition?: number) => {
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
          position: forcePosition ?? hostPosition(),
          sentAt: now,
        }),
      );
    },
    [session, hostPosition],
  );

  const sendSync = useCallback(
    (force = false, forcePosition?: number) => {
      if (isCloud) {
        sendCloudSync(force, forcePosition);
      } else {
        sendLanSync(force, forcePosition);
      }
    },
    [isCloud, sendCloudSync, sendLanSync],
  );

  useEffect(() => {
    if (!session) {
      setMembers([]);
      setConnected(false);
      lastAppliedSentAtRef.current = 0;
      broadcastRef.current?.close();
      broadcastRef.current = null;
      return;
    }

    if (isCloud) {
      setError(null);

      const applyRoomSnapshot = (room: WatchPartyRoom) => {
        if (session.role === "guest") {
          applyGuestContent(room.content);
          applyRemoteSync(
            room.playing,
            room.positionSecs,
            room.updatedAt ? Date.parse(room.updatedAt) : undefined,
          );
        }
      };

      if (session.role === "guest") {
        applyRoomSnapshot(session.room);
      }

      const handleClosed = () => {
        if (session.role === "guest") {
          setError("La stanza è stata chiusa dall'host");
          setConnected(false);
        }
      };

      const conn = connectWatchPartyBroadcast(
        session.room.code,
        session.role,
        presenceId,
        profileName,
        {
          onSync: (msg) => {
            if (session.role !== "guest") return;
            applyRemoteSync(msg.playing, msg.position, msg.sentAt);
          },
          onContent: (content) => {
            if (session.role !== "guest") return;
            applyGuestContent(content);
          },
          onStateRequest: () => {
            if (session.role !== "host") return;
            conn.sendStateResponse({
              ...buildSyncPayload(),
              content: session.room.content,
            });
          },
          onStateResponse: (msg) => {
            if (session.role !== "guest") return;
            if (msg.content) applyGuestContent(msg.content);
            applyRemoteSync(msg.playing, msg.position, msg.sentAt);
          },
          onRoomClosed: handleClosed,
          onMembers: setMembers,
          onStatus: (status) => {
            if (status === "SUBSCRIBED") {
              setConnected(true);
              setError(null);
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              setError("Connessione live instabile — riprova ad aprire la stanza");
              setConnected(false);
            }
          },
        },
      );
      broadcastRef.current = conn;

      void fetchCloudWatchParty(session.room.code)
        .then((room) => {
          if (room) {
            if (session.role === "guest") {
              applyRoomSnapshot(room);
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
        conn.sendContent(session.room.content);
        sendCloudSync(true);
      }

      return () => {
        if (session.role === "host") {
          conn.sendRoomClosed();
        }
        conn.close();
        broadcastRef.current = null;
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
    presenceId,
    isCloud,
    sendLanSync,
    sendCloudSync,
    applyRemoteSync,
    applyGuestContent,
    buildSyncPayload,
  ]);

  useEffect(() => {
    if (!session || session.role !== "host") return;
    const interval = playingRef.current
      ? HOST_HEARTBEAT_PLAYING_MS
      : HOST_HEARTBEAT_PAUSED_MS;
    const timer = window.setInterval(() => {
      sendSync();
    }, interval);
    return () => window.clearInterval(timer);
  }, [session, playing, sendSync]);

  useEffect(() => {
    if (!session || session.role !== "host" || !isCloud || !cloudUserId) return;
    const timer = window.setInterval(() => {
      void touchCloudWatchPartyRoom(
        session.room.code,
        cloudUserId,
        playingRef.current,
        hostPosition(),
      );
    }, CLOUD_KEEPALIVE_MS);
    return () => window.clearInterval(timer);
  }, [session, isCloud, cloudUserId]);

  const notifySeek = useCallback(
    (position: number, nextPlaying?: boolean) => {
      if (!session || session.role !== "host") return;

      const nextPlay = nextPlaying ?? playingRef.current;
      if (isCloud) {
        const conn = broadcastRef.current;
        if (!conn) return;
        const payload = {
          playing: nextPlay,
          position,
          sentAt: Date.now(),
        };
        conn.sendSync(payload);
        persistCloudSync(payload);
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
    [session, isCloud, persistCloudSync],
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
