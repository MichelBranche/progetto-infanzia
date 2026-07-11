import { Loader2, Radio, Users, Wifi } from "lucide-react";
import type { WatchPartyInvitePayload } from "../../lib/cloudWatchPartyInvite";
import { requestJoinWatchPartyFromInvite } from "../../lib/watchPartyInviteNavigation";
import { useWatchPartyInviteRoomStatus } from "../../hooks/useWatchPartyInviteRoomStatus";
import type { WatchPartyRoomStatus } from "../../lib/watchPartyRoomStatus";

interface ChatWatchPartyInviteBubbleProps {
  payload: WatchPartyInvitePayload;
  mine: boolean;
}

function statusDotClass(status: WatchPartyRoomStatus): string {
  switch (status) {
    case "active":
      return "bg-mint";
    case "closed":
      return "bg-white/25";
    case "unavailable":
      return "bg-amber-400";
    default:
      return "bg-warm animate-pulse";
  }
}

function statusTextClass(status: WatchPartyRoomStatus): string {
  switch (status) {
    case "active":
      return "text-mint";
    case "closed":
      return "text-text-muted";
    case "unavailable":
      return "text-amber-300";
    default:
      return "text-text-muted";
  }
}

export function ChatWatchPartyInviteBubble({
  payload,
  mine,
}: ChatWatchPartyInviteBubbleProps) {
  const isLan = payload.relay === "lan";
  const { status, statusLabel, canJoin } = useWatchPartyInviteRoomStatus(payload);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300">
          <Users className="h-3 w-3" />
          Watch party
        </div>
        <span
          className={`inline-flex items-center gap-1.5 text-[10px] font-medium ${statusTextClass(status)}`}
        >
          {status === "checking" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(status)}`} />
          )}
          {statusLabel}
        </span>
      </div>
      <p className="font-display text-[14px] font-semibold leading-snug text-text-primary">
        {payload.title}
      </p>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
        <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 font-display tracking-[0.18em] text-text-secondary">
          {payload.roomCode}
        </span>
        <span className="inline-flex items-center gap-1">
          {isLan ? (
            <Wifi className="h-3 w-3" />
          ) : (
            <Radio className="h-3 w-3" />
          )}
          {isLan ? "LAN" : "Online"}
        </span>
        {isLan && payload.hostIp && (
          <span className="tabular-nums">{payload.hostIp}</span>
        )}
      </div>
      {mine ? (
        <p className="text-[11px] text-text-muted">
          {status === "active"
            ? "Invito inviato · la stanza è ancora aperta"
            : status === "closed"
              ? "Invito inviato · la stanza è stata chiusa"
              : status === "unavailable"
                ? "Invito inviato · impossibile verificare lo stato"
                : "Invito inviato"}
        </p>
      ) : canJoin ? (
        <button
          type="button"
          onClick={() => requestJoinWatchPartyFromInvite(payload)}
          className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-400/15 px-3 py-1.5 text-[11px] font-medium text-violet-200 transition-colors hover:bg-violet-400/25"
        >
          <Users className="h-3 w-3" />
          Unisciti
        </button>
      ) : (
        <p className="text-[11px] text-text-muted">
          {status === "closed"
            ? "La stanza non è più disponibile. Chiedi un nuovo invito all'host."
            : status === "unavailable"
              ? "Impossibile verificare se la stanza è ancora aperta."
              : "Verifica dello stato in corso…"}
        </p>
      )}
    </div>
  );
}
