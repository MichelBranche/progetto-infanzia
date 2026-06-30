import { useCallback, useEffect, useRef, useState } from "react";
import {
  closeCloudWatchParty,
  fetchCloudWatchParty,
  pollCloudWatchParty,
  subscribeCloudWatchParty,
  updateCloudWatchPartySync,
} from "../lib/cloudWatchParty";
import {
  lanWatchPartyErrorMessage,
} from "../lib/watchPartyNetwork";
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

const DRIFT_THRESHOLD_SEC = 2.5;
const HOST_HEARTBEAT_MS = 2500;

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
  const onRemoteSyncRef = useRef(onRemoteSync);
  const onGuestContentRef = useRef(onGuestContent);
  const [members, setMembers] = useState<WatchPartyMember[]>(
    session?.room.members ?? [],
  );
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCloud = session?.relay === "cloud";

  onRemoteSyncRef.current = onRemoteSync;
  onGuestContentRef.current = onGuestContent;

  const pushCloudSync = useCallback(
    async (force = false) => {
      if (!session || session.role !== "host" || !cloudUserId) return;
      const now = Date.now();
      if (!force && now - lastSentRef.current < 400) return;
      lastSentRef.current = now;
      try {
        await updateCloudWatchPartySync(
          session.room.code,
          cloudUserId,
          playing,
          currentTime,
        );
      } catch {
        setError("Sync cloud non riuscita");
      }
    },
    [session, cloudUserId, playing, currentTime],
  );

  const sendLanSync = useCallback(
    (force = false) => {
      if (!session || session.role !== "host") return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const now = Date.now();
      if (!force && now - lastSentRef.current < 400) return;
      lastSentRef.current = now;
      ws.send(
        JSON.stringify({
          type: "sync",
          playing,
          position: currentTime,
          sentAt: now,
        }),
      );
    },
    [session, playing, currentTime],
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

      const applyRoom = (room: WatchPartyRoom) => {
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
          applyingRemoteRef.current = true;
          onRemoteSyncRef.current(room.playing, room.positionSecs);
          window.setTimeout(() => {
            applyingRemoteRef.current = false;
          }, 300);
        }
      };

      if (session.role === "guest") {
        const content = session.room.content;
        if (content.streamUrl && content.contentKind !== "streaming") {
          onGuestContentRef.current?.(content.streamUrl, content.isHls);
        }
        onRemoteSyncRef.current(session.room.playing, session.room.positionSecs);
      }

      let realtimeOk = false;
      const unsubscribeRealtime = subscribeCloudWatchParty(
        session.room.code,
        applyRoom,
        (status) => {
          if (status === "SUBSCRIBED") {
            realtimeOk = true;
            setConnected(true);
            setError(null);
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT"
          ) {
            setError(
              "Sync live non disponibile — uso aggiornamento periodico",
            );
          }
        },
      );

      const stopPoll = pollCloudWatchParty(session.room.code, (room) => {
        setConnected(true);
        applyRoom(room);
      });

      void fetchCloudWatchParty(session.room.code)
        .then((room) => {
          if (room) {
            setConnected(true);
            if (!realtimeOk && session.role === "guest") {
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
        unsubscribeRealtime();
        stopPoll();
        setConnected(false);
      };
    }

    const isHost = session.role === "host";
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
          onGuestContentRef.current?.(msg.content.streamUrl, msg.content.isHls);
          return;
        }
        if (msg.type === "sync" && !isHost) {
          applyingRemoteRef.current = true;
          onRemoteSyncRef.current(msg.playing, msg.position);
          window.setTimeout(() => {
            applyingRemoteRef.current = false;
          }, 300);
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
      setConnected(false);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [session, profileId, profileName, isCloud, sendLanSync]);

  useEffect(() => {
    if (!session || session.role !== "host" || applyingRemoteRef.current) {
      return;
    }
    sendSync(true);
  }, [playing, session, sendSync]);

  useEffect(() => {
    if (!session || session.role !== "host") return;
    const timer = window.setInterval(() => {
      if (playing) sendSync();
    }, HOST_HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [session, playing, sendSync]);

  const notifySeek = useCallback(
    (position: number, nextPlaying?: boolean) => {
      if (!session || session.role !== "host") return;

      if (isCloud && cloudUserId) {
        void updateCloudWatchPartySync(
          session.room.code,
          cloudUserId,
          nextPlaying ?? playing,
          position,
        );
        lastSentRef.current = Date.now();
        return;
      }

      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(
        JSON.stringify({
          type: "sync",
          playing: nextPlaying ?? playing,
          position,
          sentAt: Date.now(),
        }),
      );
      lastSentRef.current = Date.now();
    },
    [session, playing, isCloud, cloudUserId],
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
