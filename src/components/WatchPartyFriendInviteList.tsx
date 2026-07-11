import { useCallback, useState } from "react";
import { Loader2, UserPlus, Users } from "lucide-react";
import { useCloudAccount } from "../context/CloudAccountContext";
import { useAppTopNavFriendsList } from "../hooks/useAppTopNavFriendsList";
import { useWatchPartyInviteActions } from "../hooks/useWatchPartyInviteActions";
import {
  canInviteFriendToHostSession,
  canShowHostPartyInvites,
} from "../lib/watchPartyInviteEligibility";
import { OnlineDot } from "./profile/ProfileUi";

interface WatchPartyFriendInviteListProps {
  profileId: string;
  profileName: string;
  active: boolean;
  onNavigateInvite?: () => void;
}

export function WatchPartyFriendInviteList({
  profileId,
  profileName,
  active,
  onNavigateInvite,
}: WatchPartyFriendInviteListProps) {
  const { profile: cloudProfile } = useCloudAccount();
  const { friends } = useAppTopNavFriendsList(
    profileId,
    profileName,
    active,
    cloudProfile,
  );
  const { hostSession, sendInviteToFriend } = useWatchPartyInviteActions();
  const [invitingKey, setInvitingKey] = useState<string | null>(null);

  const showInvites = canShowHostPartyInvites(hostSession, cloudProfile);
  const invitableFriends = friends.filter((friend) =>
    canInviteFriendToHostSession(friend, hostSession, cloudProfile),
  );

  const inviteFriend = useCallback(
    async (friendKey: string, friend: (typeof friends)[number]) => {
      setInvitingKey(friendKey);
      try {
        await sendInviteToFriend(friend);
      } finally {
        setInvitingKey(null);
      }
    },
    [sendInviteToFriend],
  );

  if (!showInvites) return null;

  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-text-muted">
        <Users className="h-3.5 w-3.5" />
        Invita amici
      </div>

      {hostSession?.relay === "lan" && (
        <p className="mb-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] leading-relaxed text-text-muted">
          Invito LAN: l&apos;amico riceve codice e IP host. Deve essere sulla
          stessa rete Wi‑Fi o usare l&apos;IP indicato.
        </p>
      )}

      {invitableFriends.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-4 text-center">
          <p className="text-[12px] text-text-muted">
            Nessun amico cloud da invitare.
          </p>
          {onNavigateInvite && (
            <button
              type="button"
              onClick={onNavigateInvite}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-medium text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-text-primary"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Aggiungi amici
            </button>
          )}
        </div>
      ) : (
        <ul className="max-h-[220px] space-y-1 overflow-y-auto rounded-xl border border-white/[0.06] bg-white/[0.02] p-1.5">
          {invitableFriends.map((friend) => (
            <li key={friend.key}>
              <div className="flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.04]">
                <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/[0.06]">
                  {friend.avatarUrl ? (
                    <img
                      src={friend.avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="font-display text-[11px] font-semibold text-white/80">
                      {friend.name.trim().charAt(0).toUpperCase() || "?"}
                    </span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <OnlineDot
                      online={friend.online}
                      away={friend.away}
                      dnd={friend.dnd}
                    />
                    <p className="truncate text-[13px] font-medium text-text-primary">
                      {friend.name}
                    </p>
                  </div>
                  {friend.subtitle && (
                    <p className="truncate text-[10px] text-text-muted">
                      {friend.subtitle}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={invitingKey === friend.key}
                  onClick={() => void inviteFriend(friend.key, friend)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-3 py-1.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
                >
                  {invitingKey === friend.key ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Users className="h-3 w-3" />
                  )}
                  Invita
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
