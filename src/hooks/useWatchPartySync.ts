import { useCallback, useEffect, useRef, useState } from "react";
import {
  closeCloudWatchParty,
  fetchCloudWatchParty,
  pollCloudWatchParty,
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
const LAN_RECONNECT_BASE_MS = 1200;

/** Stream URL locale (file/LAN). Lo streaming cloud risolve da solo via mediaId. */
function shouldApplyGuestStreamUrl(content: WatchPartyContent): boolean {
  return Boolean(content.streamUrl?.trim()) && content.contentKind !== "streaming";
}

function hasGuestContentMeta(content: WatchPartyContent): boolean {
  const id = content.mediaId?.trim() ?? "";
  return Boolean(id) && !id.startsWith("party:");
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
  /** Aggiorna mediaId/title/kind (es. ospite LAN che riceve contenuto streaming). */
  onGuestRoomContent?: (content: WatchPartyContent) => void;
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
  onGuestRoomContent,
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
  const onGuestRoomContentRef = useRef(onGuestRoomContent);
  const getHostPositionRef = useRef(getHostPosition);
  const sessionRef = useRef(session);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const [members, setMembers] = useState<WatchPartyMember[]>(
    session?.room.members ?? [],
  );
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCloud = session?.relay === "cloud";
  const presenceId = cloudUserId ?? profileId;
  const roomCode = session?.room.code ?? "";
  const sessionRole = session?.role ?? null;
  const sessionRelay = session?.relay ?? "lan";
  const sessionHostIp = session?.hostIp ?? session?.room.hostIp ?? "";

  playingRef.current = playing;
  currentTimeRef.current = currentTime;
  onRemoteSyncRef.current = onRemoteSync;
  onGuestContentRef.current = onGuestContent;
  onGuestRoomContentRef.current = onGuestRoomContent;
  getHostPositionRef.current = getHostPosition;
  sessionRef.current = session;

  const hostPosition = useCallback(() => {
    const live = getHostPositionRef.current?.();
    if (live != null && Number.isFinite(live) && live >= 0) return live;
    return currentTimeRef.current;
  }, []);

  const applyRemoteSync = useCallback(
    (nextPlaying: boolean, position: number, sentAt?: number) => {
      // Ordinamento: scarta messaggi host più vecchi di quello già applicato.
      // `sentAt` è sempre l'orologio dell'host, quindi confrontabile tra loro.
      if (sentAt && sentAt < lastAppliedSentAtRef.current) return;
      if (sentAt) lastAppliedSentAtRef.current = sentAt;

      // Passa la posizione GREZZA: l'estrapolazione (avanzamento durante il play)
      // avviene lato guest con clock locale (receivedAt), così un eventuale
      // sfasamento tra l'orologio dell'host e quello del guest non introduce drift.
      applyingRemoteRef.current = true;
      onRemoteSyncRef.current(nextPlaying, position);
      window.setTimeout(() => {
        applyingRemoteRef.current = false;
      }, 350);
    },
    [],
  );

  const applyGuestContent = useCallback((content: WatchPartyContent) => {
    if (hasGuestContentMeta(content)) {
      onGuestRoomContentRef.current?.(content);
    }
    if (shouldApplyGuestStreamUrl(content)) {
      onGuestContentRef.current?.(content.streamUrl, content.isHls);
    }
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
      const current = sessionRef.current;
      if (!current || current.role !== "host" || !isCloud || !cloudUserId) return;
      void updateCloudWatchPartySync(
        current.room.code,
        cloudUserId,
        sync.playing,
        sync.position,
      ).catch(() => {});
    },
    [isCloud, cloudUserId],
  );

  const sendCloudSync = useCallback(
    (force = false, forcePosition?: number) => {
      const conn = broadcastRef.current;
      const current = sessionRef.current;
      if (!current || current.role !== "host" || !conn) return;
      const now = Date.now();
      if (!force && now - lastSentRef.current < SYNC_THROTTLE_MS) return;
      lastSentRef.current = now;
      const payload = buildSyncPayload(forcePosition);
      conn.sendSync(payload);
      if (force) persistCloudSync(payload);
    },
    [buildSyncPayload, persistCloudSync],
  );

  const sendLanSync = useCallback(
    (force = false, forcePosition?: number) => {
      const current = sessionRef.current;
      if (!current || current.role !== "host") return;
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
    [hostPosition],
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
    if (!roomCode || !sessionRole) {
      setMembers([]);
      setConnected(false);
      lastAppliedSentAtRef.current = 0;
      broadcastRef.current?.close();
      broadcastRef.current = null;
      return;
    }

    const role = sessionRole;
    const cloud = sessionRelay === "cloud";

    if (cloud) {
      setError(null);
      let stopPoll: (() => void) | null = null;
      let pollActive = false;

      const applyRoomSnapshot = (room: WatchPartyRoom) => {
        if (role === "guest") {
          applyGuestContent(room.content);
          // Snapshot iniziale: nessun `sentAt` (l'`updatedAt` è clock del server e
          // non è confrontabile con i `sentAt` dell'host). Serve solo come punto di
          // partenza; i sync live successivi allineano con precisione.
          applyRemoteSync(room.playing, room.positionSecs);
        }
      };

      const current = sessionRef.current;
      if (role === "guest" && current) {
        applyRoomSnapshot(current.room);
      }

      const handleClosed = () => {
        if (role === "guest") {
          setError("La stanza è stata chiusa dall'host");
          setConnected(false);
        }
      };

      const startPollFallback = () => {
        if (pollActive || role !== "guest") return;
        pollActive = true;
        stopPoll = pollCloudWatchParty(
          roomCode,
          (room) => {
            applyRoomSnapshot(room);
            setConnected(true);
          },
          handleClosed,
        );
      };

      const conn = connectWatchPartyBroadcast(
        roomCode,
        role,
        presenceId,
        profileName,
        {
          onSync: (msg) => {
            if (role !== "guest") return;
            applyRemoteSync(msg.playing, msg.position, msg.sentAt);
          },
          onContent: (content) => {
            if (role !== "guest") return;
            applyGuestContent(content);
          },
          onStateRequest: () => {
            if (role !== "host") return;
            const live = sessionRef.current;
            conn.sendStateResponse({
              ...buildSyncPayload(),
              content: live?.room.content,
            });
          },
          onStateResponse: (msg) => {
            if (role !== "guest") return;
            if (msg.content) applyGuestContent(msg.content);
            applyRemoteSync(msg.playing, msg.position, msg.sentAt);
          },
          onRoomClosed: handleClosed,
          onMembers: setMembers,
          onStatus: (status) => {
            if (status === "SUBSCRIBED") {
              setConnected(true);
              setError(null);
              stopPoll?.();
              stopPoll = null;
              pollActive = false;
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              setError("Connessione live instabile — uso sincronizzazione di riserva");
              setConnected(false);
              startPollFallback();
            }
          },
        },
      );
      broadcastRef.current = conn;

      void fetchCloudWatchParty(roomCode)
        .then((room) => {
          if (room) {
            if (role === "guest") {
              applyRoomSnapshot(room);
            }
          } else if (role === "guest") {
            setError("Stanza non trovata o chiusa dall'host");
            setConnected(false);
          }
        })
        .catch(() => {
          setError("Impossibile raggiungere il server cloud");
          setConnected(false);
          startPollFallback();
        });

      if (role === "host") {
        setConnected(true);
        const live = sessionRef.current;
        if (live) conn.sendContent(live.room.content);
        sendCloudSync(true);
      }

      return () => {
        stopPoll?.();
        if (role === "host") {
          conn.sendRoomClosed();
        }
        conn.close();
        broadcastRef.current = null;
        setConnected(false);
      };
    }

    const isHost = role === "host";
    let cancelled = false;

    const connectLan = () => {
      if (cancelled) return;

      const wsUrl = isHost
        ? localhostWatchPartyWsUrl(roomCode, profileId, profileName)
        : lanWatchPartyWsUrl(
            sessionHostIp || "127.0.0.1",
            roomCode,
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
            applyGuestContent(msg.content);
            return;
          }
          if (msg.type === "error" && !isHost) {
            setError(msg.message || "Stanza non trovata");
            setConnected(false);
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
        setError(lanWatchPartyErrorMessage(sessionHostIp || undefined));
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
    roomCode,
    sessionRole,
    sessionRelay,
    sessionHostIp,
    profileId,
    profileName,
    presenceId,
    sendLanSync,
    sendCloudSync,
    applyRemoteSync,
    applyGuestContent,
    buildSyncPayload,
  ]);

  useEffect(() => {
    if (!sessionRole || sessionRole !== "host" || !roomCode) return;
    const interval = playingRef.current
      ? HOST_HEARTBEAT_PLAYING_MS
      : HOST_HEARTBEAT_PAUSED_MS;
    const timer = window.setInterval(() => {
      sendSync();
    }, interval);
    return () => window.clearInterval(timer);
  }, [roomCode, sessionRole, playing, sendSync]);

  useEffect(() => {
    if (
      !roomCode ||
      sessionRole !== "host" ||
      sessionRelay !== "cloud" ||
      !cloudUserId
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      void touchCloudWatchPartyRoom(
        roomCode,
        cloudUserId,
        playingRef.current,
        hostPosition(),
      );
    }, CLOUD_KEEPALIVE_MS);
    return () => window.clearInterval(timer);
  }, [roomCode, sessionRole, sessionRelay, cloudUserId, hostPosition]);

  const notifySeek = useCallback(
    (position: number, nextPlaying?: boolean) => {
      const current = sessionRef.current;
      if (!current || current.role !== "host") return;

      const nextPlay = nextPlaying ?? playingRef.current;
      if (current.relay === "cloud") {
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
    [persistCloudSync],
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
