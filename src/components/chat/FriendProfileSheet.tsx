import { AnimatePresence, motion } from "framer-motion";
import { MessageSquare, X } from "lucide-react";
import { useCloudAccount } from "../../context/CloudAccountContext";
import { formatPresenceLabel } from "../../lib/presenceLabels";
import { openChatNavigation, openDirectChat } from "../../lib/cloudChat";
import { OnlineDot } from "../profile/ProfileUi";
import type { CloudFriend, FriendPresence } from "../../types/cloud";

interface FriendProfileSheetProps {
  friend: {
    userId: string;
    displayName: string;
    friendCode?: string;
    avatarUrl?: string;
    presence?: FriendPresence;
    isOnline?: boolean;
  } | null;
  onClose: () => void;
}

export function FriendProfileSheet({
  friend,
  onClose,
}: FriendProfileSheetProps) {
  const { profile: cloudProfile } = useCloudAccount();

  if (!friend) return null;

  const initial = friend.displayName.trim().charAt(0).toUpperCase() || "?";
  const away = friend.presence?.status === "away";

  const handleMessage = async () => {
    if (!cloudProfile) return;
    try {
      const conversationId = await openDirectChat(friend.userId);
      openChatNavigation(conversationId);
      onClose();
    } catch (err) {
      console.warn("[friendProfile] open chat failed:", err);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-4 sm:items-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md rounded-3xl border border-white/[0.08] bg-[#0a0a0e] p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-5 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-text-muted hover:bg-white/5 hover:text-text-primary"
              aria-label="Chiudi"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="relative mb-4">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-white/[0.06] font-display text-3xl font-semibold text-text-primary ring-2 ring-white/10">
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
              <span className="absolute bottom-1 right-1">
                <OnlineDot online={friend.isOnline ?? false} away={away} />
              </span>
            </div>

            <h2 className="font-display text-2xl font-semibold tracking-[-0.03em] text-text-primary">
              {friend.displayName}
            </h2>

            {friend.friendCode && (
              <p className="mt-1 font-mono text-[12px] text-text-muted">
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
                className="mt-6 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-5 py-2.5 text-[13px] font-medium text-accent transition-colors hover:bg-accent/15"
              >
                <MessageSquare className="h-4 w-4" />
                Messaggio
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export type FriendProfileTarget = CloudFriend & {
  presence?: FriendPresence;
  isOnline?: boolean;
};
