import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Clock, Library, Loader2, Trophy, Users, X } from "lucide-react";
import type { Profile } from "../types/profile";
import type { MediaItem } from "../types/media";
import type { StremioMetaPreview } from "../types/stremio";
import { MediaGrid } from "./MediaGrid";
import { FriendsPage } from "./FriendsPage";
import { ProfileHero } from "./profile/ProfileHero";
import { ProfileEmptyState, ProfileTabBar } from "./profile/ProfileUi";
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
import { PROFILE_CARD } from "./profile/ProfileUi";
import { AchievementsPanel } from "./profile/AchievementsPanel";
import { useAchievements } from "../hooks/useAchievements";
import { isTauri } from "@tauri-apps/api/core";
import { listCloudFriends } from "../lib/cloudFriends";
import { listFriends } from "../lib/watchPartyApi";

export type ProfileTab = "watched" | "list" | "friends" | "achievements";

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

const tabs: { id: ProfileTab; label: string; icon: typeof Clock }[] = [
  { id: "watched", label: "Guardati", icon: Clock },
  { id: "list", label: "La mia lista", icon: Library },
  { id: "friends", label: "Amici", icon: Users },
  { id: "achievements", label: "Traguardi", icon: Trophy },
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
    cloudPresence.friends,
    cloudProfile?.friendCode,
    cloudProfile?.avatarUrl,
  );

  const [customizing, setCustomizing] = useState(false);
  const [customizeError, setCustomizeError] = useState<string | null>(null);
  const [customizeSubmitting, setCustomizeSubmitting] = useState(false);
  const [streamingHistory, setStreamingHistory] = useState<
    Awaited<ReturnType<typeof getStreamingWatchHistory>>
  >([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [achievementFriendsBoost, setAchievementFriendsBoost] = useState(0);

  const achievements = useAchievements(profileId, achievementFriendsBoost);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [lanFriends, cloudFriends] = await Promise.all([
          listFriends(profileId),
          cloudProfile ? listCloudFriends() : Promise.resolve([]),
        ]);
        if (!cancelled) {
          setAchievementFriendsBoost(
            isTauri()
              ? cloudFriends.length
              : lanFriends.length + cloudFriends.length,
          );
        }
      } catch {
        if (!cancelled) setAchievementFriendsBoost(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId, cloudProfile, friendsTabActive, activeTab]);

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

      <div className="page-px mt-8">
        <div className="mx-auto max-w-3xl">
          <ProfileTabBar
            tabs={tabs}
            active={activeTab}
            onChange={onTabChange}
            badge={{ friends: pendingFriendRequests }}
          />
        </div>
      </div>

      <div className="page-px mt-8">
        <div className="mx-auto max-w-6xl">
          {activeTab === "watched" && (
            <div>
              {historyLoading ? (
                <div className="flex justify-center py-24">
                  <Loader2 className="h-7 w-7 animate-spin text-text-muted" />
                </div>
              ) : watchedItems.length === 0 ? (
                <ProfileEmptyState
                  icon={Clock}
                  title="Nessun titolo guardato"
                  description="I film e le serie che inizi a guardare con questo profilo compariranno qui, così puoi riprendere da dove avevi lasciato."
                />
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
            <div>
              {listItems.length === 0 ? (
                <ProfileEmptyState
                  icon={Library}
                  title="La lista è vuota"
                  description="Salva i titoli che ti interessano premendo + su un film o una serie. Li troverai tutti qui, pronti da guardare."
                />
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
              onFriendsChanged={() => {
                void (async () => {
                  try {
                    const [lanFriends, cloudFriends] = await Promise.all([
                      listFriends(profileId),
                      cloudProfile ? listCloudFriends() : Promise.resolve([]),
                    ]);
                    setAchievementFriendsBoost(
                      isTauri()
                        ? cloudFriends.length
                        : lanFriends.length + cloudFriends.length,
                    );
                  } catch {
                    setAchievementFriendsBoost(0);
                  }
                  await achievements.sync();
                })();
              }}
            />
          )}

          {activeTab === "achievements" && (
            <AchievementsPanel
              state={achievements.state}
              loading={achievements.loading}
            />
          )}
        </div>
      </div>

      <AnimatePresence>
        {customizing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-void/92 p-4 backdrop-blur-md sm:p-6"
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              className={`relative max-h-[min(90vh,52rem)] w-full max-w-lg overflow-y-auto p-6 shadow-2xl sm:p-8 ${PROFILE_CARD}`}
            >
              <button
                type="button"
                onClick={() => setCustomizing(false)}
                className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-white/[0.06] hover:text-text-primary"
                aria-label="Chiudi"
              >
                <X className="h-4 w-4" />
              </button>
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-text-muted">
                Profilo
              </p>
              <h2 className="font-display mb-6 mt-1 text-2xl font-semibold tracking-[-0.03em] text-text-primary">
                Personalizza
              </h2>
              <ProfileCustomizeForm
                initial={valueFromProfile(profile)}
                previewProfileId={profileId}
                showRole={false}
                submitLabel="Salva modifiche"
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
