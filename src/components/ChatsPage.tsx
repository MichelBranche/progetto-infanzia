import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, MessageSquare, Plus, Users } from "lucide-react";
import { CloudAuthPanel } from "./CloudAuthPanel";
import { ChatPanel } from "./chat/ChatPanel";
import { ProfileCard, ProfileEmptyState, ProfileSectionLabel } from "./profile/ProfileUi";
import { ListSkeleton } from "./Skeleton";
import { useCloudAccount } from "../context/CloudAccountContext";
import { useChatPopup } from "../context/ChatPopupContext";
import { listCloudFriends } from "../lib/cloudFriends";
import {
  chatDisplayTitle,
  consumePendingChatId,
  createGroupChat,
  deleteChatConversation,
  listMyChats,
} from "../lib/cloudChat";
import { formatChatMessagePreview } from "../lib/watchPartyInviteChatMessage";
import { closeChatPopup } from "../lib/chatPopup";
import type { ChatConversation } from "../types/chat";
import type { CloudFriend } from "../types/cloud";

export function ChatsPage() {
  const { profile: cloudProfile, configured } = useCloudAccount();
  const [chats, setChats] = useState<ChatConversation[]>([]);
  const [friends, setFriends] = useState<CloudFriend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [deletingChat, setDeletingChat] = useState(false);
  const chatPopup = useChatPopup();

  const refresh = useCallback(async () => {
    if (!cloudProfile) {
      setChats([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [chatList, friendList] = await Promise.all([
        listMyChats(),
        listCloudFriends(),
      ]);
      setChats(chatList);
      setFriends(friendList);
      setSelectedId((prev) => {
        if (prev && chatList.some((c) => c.id === prev)) return prev;
        const preferDesktopList =
          typeof window !== "undefined" &&
          window.matchMedia("(min-width: 1024px)").matches;
        return preferDesktopList ? (chatList[0]?.id ?? null) : null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [cloudProfile]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void consumePendingChatId().then((id) => {
      if (id) setSelectedId(id);
    });
  }, []);

  useEffect(() => {
    const onOpenChat = () => {
      void consumePendingChatId().then((id) => {
        if (id) setSelectedId(id);
      });
      void refresh();
    };
    window.addEventListener("branchefy:open-chat", onOpenChat);
    return () => window.removeEventListener("branchefy:open-chat", onOpenChat);
  }, [refresh]);

  const selectedChat = useMemo(
    () => chats.find((c) => c.id === selectedId) ?? null,
    [chats, selectedId],
  );

  const toggleGroupMember = (userId: string) => {
    setGroupMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const handleCreateGroup = async () => {
    if (!groupTitle.trim() || groupMemberIds.length === 0) return;
    setCreatingGroup(true);
    try {
      const id = await createGroupChat(groupTitle, groupMemberIds);
      await refresh();
      setSelectedId(id);
      setShowGroupForm(false);
      setGroupTitle("");
      setGroupMemberIds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleDeleteChat = async () => {
    if (!selectedChat || !selectedId || selectedChat.kind === "watch_party") return;
    const label = chatDisplayTitle(selectedChat);
    const confirmed = window.confirm(
      selectedChat.kind === "group"
        ? `Vuoi uscire da "${label}" o eliminarla se ne sei il creatore?`
        : `Eliminare la chat con ${label}?`,
    );
    if (!confirmed) return;

    setDeletingChat(true);
    setError(null);
    try {
      await deleteChatConversation(selectedId);
      closeChatPopup({ conversationId: selectedId });
      chatPopup.close();
      setSelectedId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingChat(false);
    }
  };

  if (!configured) {
    return (
      <div className="page-px pb-16 pt-24 sm:pt-28">
        <ProfileEmptyState
          icon={MessageSquare}
          title="Cloud non configurato"
          description="Configura Supabase per usare i messaggi."
        />
      </div>
    );
  }

  if (!cloudProfile) {
    return (
      <div className="page-px pb-16 pt-24 sm:pt-28">
        <div className="mx-auto max-w-lg">
          <CloudAuthPanel />
        </div>
      </div>
    );
  }

  return (
    <div className="page-px pb-16 pt-20 sm:pt-24 lg:pt-28">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className={selectedId ? "hidden lg:block" : ""}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-accent">
              Social
            </p>
            <h1 className="font-display mt-1 text-3xl font-semibold tracking-[-0.03em] text-text-primary">
              Messaggi
            </h1>
            <p className="mt-1 text-[14px] text-text-secondary">
              Chat private, gruppi e stanze watch party
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowGroupForm((v) => !v)}
            className={`inline-flex items-center gap-2 self-start rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-[12px] font-medium text-text-secondary hover:bg-white/[0.07] ${
              selectedId ? "hidden lg:inline-flex" : ""
            }`}
          >
            <Plus className="h-3.5 w-3.5" />
            Nuovo gruppo
          </button>
        </div>

        {showGroupForm && (
          <ProfileCard className={`mb-5 ${selectedId ? "hidden lg:block" : ""}`}>
            <ProfileSectionLabel>Nuovo gruppo</ProfileSectionLabel>
            <input
              value={groupTitle}
              onChange={(e) => setGroupTitle(e.target.value)}
              placeholder="Nome del gruppo"
              className="mb-4 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-2.5 text-[13px] text-text-primary outline-none focus:border-accent/40"
            />
            <p className="mb-2 text-[12px] text-text-muted">Aggiungi amici</p>
            <div className="mb-4 flex flex-wrap gap-2">
              {friends.map((friend) => {
                const active = groupMemberIds.includes(friend.userId);
                return (
                  <button
                    key={friend.userId}
                    type="button"
                    onClick={() => toggleGroupMember(friend.userId)}
                    className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                      active
                        ? "border-accent/40 bg-accent/15 text-accent"
                        : "border-white/10 text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    {friend.displayName}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              disabled={creatingGroup || !groupTitle.trim() || groupMemberIds.length === 0}
              onClick={() => void handleCreateGroup()}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-[12px] font-medium text-white disabled:opacity-50"
            >
              {creatingGroup ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
              Crea gruppo
            </button>
          </ProfileCard>
        )}

        {error && (
          <div className="mb-4 rounded-2xl border border-warm/25 bg-warm/10 px-4 py-3 text-[13px] text-warm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(260px,300px)_1fr]">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-2">
              <ListSkeleton rows={7} variant="chat" />
            </div>
            <div className="hidden min-h-[320px] rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 lg:block">
              <ListSkeleton rows={4} variant="line" />
            </div>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(260px,300px)_1fr]">
            <ProfileCard
              className={`flex max-h-[min(72vh,700px)] flex-col overflow-hidden p-0 ${
                selectedId ? "hidden lg:flex" : ""
              }`}
            >
              <p className="border-b border-white/[0.06] px-4 py-3.5 text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted">
                Conversazioni ({chats.length})
              </p>
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {chats.length === 0 ? (
                  <p className="px-3 py-8 text-center text-[13px] text-text-muted">
                    Nessuna chat. Apri un profilo amico o una stanza watch party.
                  </p>
                ) : (
                  chats.map((chat) => {
                    const title = chatDisplayTitle(chat);
                    const avatarUrl =
                      chat.kind === "direct" ? chat.directPeer?.avatarUrl : undefined;
                    const initial = title.charAt(0).toUpperCase();
                    return (
                      <button
                        key={chat.id}
                        type="button"
                        onClick={() => setSelectedId(chat.id)}
                        className={`mb-1 flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors ${
                          selectedId === chat.id
                            ? "bg-white/[0.08] ring-1 ring-white/15"
                            : "hover:bg-white/[0.04]"
                        }`}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/[0.06] font-display text-[13px] font-semibold">
                          {avatarUrl ? (
                            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            initial
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-display text-[14px] font-medium text-text-primary">
                            {title}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-text-muted">
                            {chat.lastMessage?.body
                              ? formatChatMessagePreview(chat.lastMessage.body)
                              : chat.kind === "watch_party"
                                ? `Stanza ${chat.watchPartyCode}`
                                : `${chat.memberCount} membri`}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </ProfileCard>

            {selectedId ? (
              <ChatPanel
                conversationId={selectedId}
                currentUserId={cloudProfile.id}
                title={selectedChat ? chatDisplayTitle(selectedChat) : undefined}
                subtitle={
                  selectedChat?.kind === "watch_party"
                    ? `Watch party · ${selectedChat.watchPartyCode}`
                    : selectedChat?.kind === "group"
                      ? `${selectedChat.memberCount} membri`
                      : undefined
                }
                canDeleteChat={Boolean(selectedChat && selectedChat.kind !== "watch_party")}
                deletingChat={deletingChat}
                onDeleteChat={handleDeleteChat}
                onBack={() => setSelectedId(null)}
                className="h-[min(calc(100dvh-var(--app-nav-height)-var(--mobile-nav-height)-2rem),680px)] lg:h-[min(62vh,560px)]"
              />
            ) : (
              <div className="hidden items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center text-[13px] text-text-muted lg:flex">
                Seleziona una conversazione
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
