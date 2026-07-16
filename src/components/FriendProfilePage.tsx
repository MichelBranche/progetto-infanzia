import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Clock, Loader2, MessageSquare } from "lucide-react";
import { MediaGrid } from "./MediaGrid";
import { OnlineDot, ProfileEmptyState, ProfileStat } from "./profile/ProfileUi";
import { fetchFriendRecentWatches } from "../lib/cloudFriendActivity";
import { mergeContinueBrowseItems } from "../lib/unifiedBrowse";
import { formatPresenceLabel } from "../lib/presenceLabels";
import { openChatNavigation, openDirectChat } from "../lib/cloudChat";
import { useCloudAccount } from "../context/CloudAccountContext";
import type { StreamingContinueItem, StremioMetaPreview } from "../types/stremio";
import type { FriendProfileTarget } from "./chat/FriendProfileSheet";

interface FriendProfilePageProps {
  friend: FriendProfileTarget;
  onBack: () => void;
  onPlayStreaming: (preview: StremioMetaPreview) => void;
  onOpenChat?: () => void;
}

export function FriendProfilePage({
  friend,
  onBack,
  onPlayStreaming,
  onOpenChat,
}: FriendProfilePageProps) {
  const { profile: cloudProfile } = useCloudAccount();
  const [history, setHistory] = useState<StreamingContinueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchFriendRecentWatches(friend.userId, 40)
      .then((items) => {
        if (!cancelled) setHistory(items);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [friend.userId]);

  const watchedItems = useMemo(
    () => mergeContinueBrowseItems([], history),
    [history],
  );

  const initial = friend.displayName.trim().charAt(0).toUpperCase() || "?";
  const away = friend.presence?.status === "away";
  const dnd = friend.presence?.status === "dnd";
  const online = friend.isOnline ?? false;

  const handleMessage = async () => {
    if (!cloudProfile) return;
    try {
      const conversationId = await openDirectChat(friend.userId);
      openChatNavigation(conversationId);
      onOpenChat?.();
    } catch (err) {
      console.warn("[friendProfile] open chat failed:", err);
    }
  };

  return (
    <div className="min-h-full pb-16">
      <div className="page-px pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onBack}
          className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:border-white/25 hover:bg-white/[0.07] hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          Indietro
        </button>
      </div>

      <div className="page-px pt-6 sm:pt-8">
        <div className="mx-auto max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center text-center"
          >
            <div className="relative mb-6">
              <div className="pointer-events-none absolute -inset-8 rounded-full bg-accent/20 opacity-40 blur-3xl" />
              <div className="relative flex h-[5.5rem] w-[5.5rem] items-center justify-center overflow-hidden rounded-full bg-white/[0.06] font-display text-3xl font-semibold text-text-primary ring-2 ring-white/15 sm:h-[6.5rem] sm:w-[6.5rem]">
                {friend.avatarUrl ? (
                  <img
                    src={friend.avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                ) : (
                  initial
                )}
              </div>
              <span className="absolute bottom-1 right-1 rounded-full bg-void p-1 ring-2 ring-void">
                <OnlineDot online={online} away={away} dnd={dnd} />
              </span>
            </div>

            <h1 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] font-semibold tracking-[-0.04em] text-text-primary">
              {friend.displayName}
            </h1>

            {friend.friendCode && (
              <p className="mt-1.5 font-mono text-[12px] text-text-muted">
                Codice {friend.friendCode}
              </p>
            )}

            <p className="mt-2 text-[13px] text-text-secondary">
              {formatPresenceLabel(friend.presence)}
            </p>

            {cloudProfile && (
              <button
                type="button"
                onClick={() => void handleMessage()}
                className="mt-5 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-5 py-2.5 text-[13px] font-medium text-accent transition-colors hover:bg-accent/15"
              >
                <MessageSquare className="h-4 w-4" />
                Messaggio
              </button>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.45 }}
            className="mt-10 grid grid-cols-1"
          >
            <ProfileStat
              label="Visti di recente"
              value={watchedItems.length}
              icon={Clock}
            />
          </motion.div>
        </div>
      </div>

      <div className="page-px mt-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display mb-4 text-lg font-semibold tracking-[-0.02em] text-text-primary">
            Visti di recente
          </h2>
          {loading ? (
            <div className="flex justify-center py-24">
              <Loader2 className="h-7 w-7 animate-spin text-text-muted" />
            </div>
          ) : watchedItems.length === 0 ? (
            <ProfileEmptyState
              icon={Clock}
              title="Ancora niente da mostrare"
              description={`Quando ${friend.displayName} guarda film o serie in streaming, i titoli compariranno qui.`}
            />
          ) : (
            <MediaGrid
              items={watchedItems}
              onPlay={() => {}}
              onPlayStreaming={onPlayStreaming}
            />
          )}
        </div>
      </div>
    </div>
  );
}
