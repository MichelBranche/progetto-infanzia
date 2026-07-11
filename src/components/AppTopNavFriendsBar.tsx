import { MessageSquare, UserPlus, Users } from "lucide-react";
import { useFriendsMenu } from "../context/FriendsMenuContext";
import type { AppTopNavFriendEntry } from "../hooks/useAppTopNavFriendsList";
import { useChatPopup } from "../context/ChatPopupContext";
import { useCloudAccount } from "../context/CloudAccountContext";
import { useNotifications } from "../context/NotificationContext";
import { useCallback, useState } from "react";
import { openDirectChat } from "../lib/cloudChat";
import { useWatchPartyInviteActions } from "../hooks/useWatchPartyInviteActions";
import { canInviteFriendToHostSession, canShowHostPartyInvites } from "../lib/watchPartyInviteEligibility";

const MAX_VISIBLE = 5;

function StackAvatar({
  friend,
  index,
  onChat,
  onInvite,
  showInvite,
  inviting,
}: {
  friend: AppTopNavFriendEntry;
  index: number;
  onChat: (friend: AppTopNavFriendEntry) => void;
  onInvite: (friend: AppTopNavFriendEntry) => void;
  showInvite: boolean;
  inviting: boolean;
}) {
  const initial = friend.name.trim().charAt(0).toUpperCase() || "?";
  const presenceClass = friend.dnd
    ? "bg-red-400"
    : friend.away
      ? "bg-amber-400"
      : friend.online
        ? "bg-mint"
        : "bg-white/30";

  return (
    <div
      className="group/stack relative shrink-0"
      style={{ zIndex: MAX_VISIBLE - index }}
    >
      <button
        type="button"
        onClick={() => onChat(friend)}
        className="app-top-nav__friend-stack-item group relative shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        title={friend.name}
        aria-label={friend.name}
      >
        <span className="app-top-nav__friend-stack-ring block overflow-hidden rounded-full bg-[#141418] ring-2 ring-[#141418] transition-transform duration-200 group-hover:scale-105">
          {friend.avatarUrl ? (
            <img
              src={friend.avatarUrl}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center font-display text-[11px] font-semibold text-white/90">
              {initial}
            </span>
          )}
        </span>
        <span
          className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#141418] ${presenceClass}`}
          aria-hidden
        />
      </button>

      <div className="pointer-events-none absolute -top-7 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/stack:pointer-events-auto group-hover/stack:opacity-100 group-focus-within/stack:pointer-events-auto group-focus-within/stack:opacity-100">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onChat(friend);
          }}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-white/12 bg-[#1a1a1f] text-white/80 shadow-md transition-colors hover:bg-white/10 hover:text-white"
          title={`Chat con ${friend.name}`}
          aria-label={`Chat con ${friend.name}`}
        >
          <MessageSquare className="h-3 w-3" strokeWidth={1.85} />
        </button>
        {showInvite && (
          <button
            type="button"
            disabled={inviting}
            onClick={(event) => {
              event.stopPropagation();
              onInvite(friend);
            }}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-accent/30 bg-accent/20 text-accent shadow-md transition-colors hover:bg-accent/30 disabled:opacity-50"
            title={`Invita ${friend.name} al watch party`}
            aria-label={`Invita ${friend.name} al watch party`}
          >
            <Users className="h-3 w-3" strokeWidth={1.85} />
          </button>
        )}
      </div>
    </div>
  );
}

export function AppTopNavFriendsBar() {
  const { profile: cloudProfile } = useCloudAccount();
  const { notify } = useNotifications();
  const chatPopup = useChatPopup();
  const { friends, onlineCount, openMenu } = useFriendsMenu();
  const { hostSession, canInviteFriends, sendInviteToFriend } =
    useWatchPartyInviteActions();
  const [invitingKey, setInvitingKey] = useState<string | null>(null);

  const visibleFriends = friends.slice(0, MAX_VISIBLE);
  const overflowCount = Math.max(0, friends.length - MAX_VISIBLE);

  const openChat = useCallback(
    async (friend: AppTopNavFriendEntry) => {
      if (friend.kind !== "cloud" || !friend.userId) {
        openMenu();
        return;
      }
      if (!cloudProfile) {
        notify({
          kind: "info",
          title: "Account richiesto",
          message: "Accedi al tuo account Branchefy per aprire la chat.",
        });
        openMenu();
        return;
      }
      try {
        const conversationId = await openDirectChat(friend.userId);
        chatPopup.open(conversationId, friend.name);
      } catch (err) {
        notify({
          kind: "info",
          title: "Chat non disponibile",
          message: err instanceof Error ? err.message : String(err),
        });
        openMenu();
      }
    },
    [chatPopup, cloudProfile, notify, openMenu],
  );

  const inviteFriend = useCallback(
    async (friend: AppTopNavFriendEntry) => {
      setInvitingKey(friend.key);
      try {
        await sendInviteToFriend(friend);
      } finally {
        setInvitingKey(null);
      }
    },
    [sendInviteToFriend],
  );

  const showInvite = canShowHostPartyInvites(hostSession, cloudProfile);

  return (
    <div className="app-top-nav__friends-stack flex items-center rounded-full py-1 pl-1 pr-2.5">
      {visibleFriends.length > 0 ? (
        <span className="flex items-center">
          {visibleFriends.map((friend, index) => (
            <StackAvatar
              key={friend.key}
              friend={friend}
              index={index}
              onChat={openChat}
              onInvite={inviteFriend}
              showInvite={showInvite && canInviteFriendToHostSession(friend, hostSession, cloudProfile)}
              inviting={invitingKey === friend.key}
            />
          ))}
          {overflowCount > 0 && (
            <button
              type="button"
              onClick={() => openMenu()}
              className="app-top-nav__friend-stack-more relative -ml-2 flex shrink-0 items-center justify-center rounded-full bg-white/[0.1] font-display text-[10px] font-semibold text-white/85 ring-2 ring-[#141418] transition-colors hover:bg-white/[0.16]"
              style={{ zIndex: 0 }}
              aria-label={`Altri ${overflowCount} amici`}
            >
              +{overflowCount}
            </button>
          )}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => openMenu()}
          className="app-top-nav__friend-stack-empty flex items-center justify-center rounded-full bg-white/[0.06] text-white/70 transition-colors hover:bg-white/[0.1]"
          aria-label="Aggiungi amici"
        >
          <Users className="h-4 w-4" strokeWidth={1.85} />
        </button>
      )}

      <button
        type="button"
        onClick={() => openMenu()}
        className="ml-2 hidden min-w-0 text-left sm:block"
        aria-label="Apri menu amici"
      >
        <span className="block truncate font-display text-[12px] font-medium leading-tight text-white/90">
          {friends.length > 0 ? "Amici" : "Aggiungi amici"}
        </span>
        <span className="block text-[10px] leading-tight text-white/45">
          {canInviteFriends && hostSession
            ? `Stanza ${hostSession.room.code} · invita`
            : friends.length > 0
              ? `${onlineCount} online`
              : "Invita o cerca"}
        </span>
      </button>

      {friends.length === 0 && (
        <button
          type="button"
          onClick={() => openMenu()}
          className="ml-1.5 shrink-0 text-white/50 sm:hidden"
          aria-label="Aggiungi amici"
        >
          <UserPlus className="h-3.5 w-3.5" strokeWidth={1.85} />
        </button>
      )}
    </div>
  );
}
