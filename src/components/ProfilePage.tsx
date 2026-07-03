import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Clock, Library, Loader2, X } from "lucide-react";
import type { Profile } from "../types/profile";
import type { MediaItem } from "../types/media";
import type { StremioMetaPreview } from "../types/stremio";
import { MediaGrid } from "./MediaGrid";
import { FriendsPage } from "./FriendsPage";
import { ProfileHero } from "./profile/ProfileHero";
import { getStreamingWatchHistory } from "../lib/addonsApi";
import { isWatchInProgress, toBrowseItems } from "../lib/browse";
import {
  enrichStreamingPreview,
  mergeContinueBrowseItems,
} from "../lib/unifiedBrowse";
import { streamingBrowseItem } from "../lib/streamingBrowse";
import { markStreamingInMyList } from "../lib/myList";
import type { WatchPartySession } from "../types/watchParty";
import { useProfile } from "../context/ProfileContext";
import { useCloudAccount } from "../context/CloudAccountContext";
import { useCloudFriendPresence } from "../hooks/useFriendPresence";
import { useLanFriendPresence } from "../hooks/useLanFriendPresence";
import {
  ProfileCustomizeForm,
  profileCustomizeToUpdate,
  valueFromProfile,
} from "./profile/ProfileCustomizeForm";

export type ProfileTab = "watched" | "list" | "friends";

interface ProfilePageProps {
  profile: Profile;
  profileId: string;
  activeTab: ProfileTab;
  onTabChange: (tab: ProfileTab) => void;
  libraryItems: MediaItem[];
  localFavorites: MediaItem[];
  streamingList: StremioMetaPreview[];
  streamingListKeys: Set<string>;
  onPlay: (id: string) => void;
  onPlayStreaming: (preview: StremioMetaPreview) => void;
  onToggleFavorite?: (id: string) => void;
  onToggleStreamingList?: (preview: StremioMetaPreview) => void;
  onEdit?: (id: string) => void;
  onJoinSession?: (session: WatchPartySession) => void;
  pendingFriendRequests?: number;
}

const tabs: { id: ProfileTab; label: string; index: string }[] = [
  { id: "watched", label: "Guardati", index: "01" },
  { id: "list", label: "La mia lista", index: "02" },
  { id: "friends", label: "Amici", index: "03" },
];

export function ProfilePage({
  profile,
  profileId,
  activeTab,
  onTabChange,
  libraryItems,
  localFavorites,
  streamingList,
  streamingListKeys,
  onPlay,
  onPlayStreaming,
  onToggleFavorite,
  onToggleStreamingList,
  onEdit,
  onJoinSession,
  pendingFriendRequests = 0,
}: ProfilePageProps) {
  const { updateExistingProfile } = useProfile();
  const { profile: cloudProfile } = useCloudAccount();
  const friendsTabActive = activeTab === "friends";
  const cloudPresence = useCloudFriendPresence(true);
  const lanPresence = useLanFriendPresence(
    profileId,
    profile.name,
    friendsTabActive,
  );

  const [customizing, setCustomizing] = useState(false);
  const [customizeError, setCustomizeError] = useState<string | null>(null);
  const [customizeSubmitting, setCustomizeSubmitting] = useState(false);
  const [streamingHistory, setStreamingHistory] = useState<
    Awaited<ReturnType<typeof getStreamingWatchHistory>>
  >([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    void getStreamingWatchHistory(profileId, 50)
      .then((items) => {
        if (!cancelled) setStreamingHistory(items);
      })
      .catch(() => {
        if (!cancelled) setStreamingHistory([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, activeTab]);

  const localWatched = useMemo(
    () =>
      libraryItems.filter(
        (item) => isWatchInProgress(item) || (item.watchPosition ?? 0) > 5,
      ),
    [libraryItems],
  );

  const watchedItems = useMemo(
    () => mergeContinueBrowseItems(localWatched, streamingHistory),
    [localWatched, streamingHistory],
  );

  const listItems = useMemo(() => {
    const streaming = streamingList.map((preview) =>
      streamingBrowseItem(
        markStreamingInMyList(enrichStreamingPreview(preview), streamingListKeys),
      ),
    );
    return [...streaming, ...toBrowseItems(localFavorites)];
  }, [localFavorites, streamingList, streamingListKeys]);

  const onlineFriendsCount =
    (cloudProfile ? cloudPresence.onlineCount : 0) +
    (friendsTabActive ? lanPresence.onlineCount : 0);

  return (
    <div className="pb-16">
      <ProfileHero
        profile={profile}
        watchedCount={watchedItems.length}
        listCount={listItems.length}
        onlineFriendsCount={onlineFriendsCount}
        onCustomize={() => {
          setCustomizeError(null);
          setCustomizing(true);
        }}
      />

      <div className="page-px mt-8 border-b border-white/[0.06]">
        <nav className="-mb-px flex gap-6 overflow-x-auto">
          {tabs.map(({ id, label, index }) => {
            const active = activeTab === id;
            const tabBadge =
              id === "friends" && pendingFriendRequests > 0
                ? pendingFriendRequests
                : undefined;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onTabChange(id)}
                className={`group relative flex shrink-0 items-center gap-2.5 pb-3 text-[12px] font-medium uppercase tracking-[0.12em] transition-colors ${
                  active
                    ? "text-text-primary"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                <span
                  className={`text-[10px] tabular-nums ${
                    active ? "text-text-secondary" : "text-text-muted/50"
                  }`}
                >
                  {index}
                </span>
                {label}
                {tabBadge != null && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-semibold text-white">
                    {tabBadge > 9 ? "9+" : tabBadge}
                  </span>
                )}
                <span
                  className={`absolute bottom-0 left-0 h-px bg-white transition-all duration-300 ${
                    active ? "w-full" : "w-0 group-hover:w-full group-hover:opacity-30"
                  }`}
                />
              </button>
            );
          })}
        </nav>
      </div>

      {activeTab === "watched" && (
        <div className="mt-8">
          {historyLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
            </div>
          ) : watchedItems.length === 0 ? (
            <div className="page-px flex flex-col items-center justify-center py-20 text-center">
              <Clock className="mb-4 h-8 w-8 text-text-muted/40" strokeWidth={1.5} />
              <p className="max-w-sm text-[15px] text-text-secondary">
                Non hai ancora guardato nulla con questo profilo.
              </p>
            </div>
          ) : (
            <MediaGrid
              items={watchedItems}
              onPlay={onPlay}
              onPlayStreaming={onPlayStreaming}
              onToggleFavorite={onToggleFavorite}
              onToggleStreamingList={onToggleStreamingList}
              onEdit={onEdit}
            />
          )}
        </div>
      )}

      {activeTab === "list" && (
        <div className="mt-8">
          {listItems.length === 0 ? (
            <div className="page-px flex flex-col items-center justify-center py-20 text-center">
              <Library className="mb-4 h-8 w-8 text-text-muted/40" strokeWidth={1.5} />
              <p className="max-w-sm text-[15px] text-text-secondary">
                La lista è vuota. Premi + su un titolo per salvarlo qui.
              </p>
            </div>
          ) : (
            <MediaGrid
              items={listItems}
              onPlay={onPlay}
              onPlayStreaming={onPlayStreaming}
              onToggleFavorite={onToggleFavorite}
              onToggleStreamingList={onToggleStreamingList}
              onEdit={onEdit}
            />
          )}
        </div>
      )}

      {activeTab === "friends" && (
        <FriendsPage
          embedded
          profileId={profileId}
          profileName={profile.name}
          onJoinSession={onJoinSession}
          cloudOnline={cloudPresence.onlineFriends}
          cloudOffline={cloudPresence.offlineFriends}
          cloudPresenceLoading={cloudPresence.loading}
          onRefreshCloudPresence={cloudPresence.refresh}
          lanOnline={lanPresence.onlineFriends}
          lanOffline={lanPresence.offlineFriends}
          lanPresenceLoading={lanPresence.loading}
          onRefreshLanPresence={() => void lanPresence.refresh(true)}
        />
      )}

      <AnimatePresence>
        {customizing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-void/90 p-6 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#0a0a0d] p-6 shadow-2xl sm:p-8"
            >
              <button
                type="button"
                onClick={() => setCustomizing(false)}
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-white/[0.06] hover:text-text-primary"
                aria-label="Chiudi"
              >
                <X className="h-4 w-4" />
              </button>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.28em] text-text-muted">
                Profilo
              </p>
              <h2 className="font-display mb-6 text-2xl font-semibold tracking-[-0.03em] text-text-primary">
                Personalizza
              </h2>
              <ProfileCustomizeForm
                initial={valueFromProfile(profile)}
                showRole={false}
                submitLabel="Salva"
                submitting={customizeSubmitting}
                error={customizeError}
                onCancel={() => setCustomizing(false)}
                onSubmit={async (value) => {
                  setCustomizeSubmitting(true);
                  setCustomizeError(null);
                  try {
                    await updateExistingProfile(
                      profileId,
                      profileCustomizeToUpdate(value),
                    );
                    setCustomizing(false);
                  } catch (err) {
                    setCustomizeError(
                      err instanceof Error ? err.message : String(err),
                    );
                  } finally {
                    setCustomizeSubmitting(false);
                  }
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
