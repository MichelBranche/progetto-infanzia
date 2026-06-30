import { useEffect, useMemo, useState } from "react";
import { Clock, Library, Loader2, Users } from "lucide-react";
import type { Profile } from "../types/profile";
import { roleLabel } from "../types/profile";
import type { MediaItem } from "../types/media";
import type { StremioMetaPreview } from "../types/stremio";
import { ProfileAvatar } from "./ProfileAvatar";
import { MediaGrid } from "./MediaGrid";
import { FriendsPage } from "./FriendsPage";
import { getStreamingWatchHistory } from "../lib/addonsApi";
import { isWatchInProgress, toBrowseItems } from "../lib/browse";
import {
  enrichStreamingPreview,
  mergeContinueBrowseItems,
} from "../lib/unifiedBrowse";
import { streamingBrowseItem } from "../lib/streamingBrowse";
import { markStreamingInMyList } from "../lib/myList";
import type { WatchPartySession } from "../types/watchParty";

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
}

const tabs: { id: ProfileTab; label: string; icon: typeof Clock }[] = [
  { id: "watched", label: "Guardati", icon: Clock },
  { id: "list", label: "La mia Lista", icon: Library },
  { id: "friends", label: "Amici", icon: Users },
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
}: ProfilePageProps) {
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
    () => libraryItems.filter((item) => isWatchInProgress(item) || (item.watchPosition ?? 0) > 5),
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

  return (
    <div className="pb-16">
      <div className="page-px pt-24 sm:pt-28">
        <div className="flex items-center gap-4">
          <ProfileAvatar profile={profile} size="md" />
          <div className="min-w-0">
            <h1 className="font-display truncate text-3xl font-semibold tracking-[-0.03em] text-text-primary sm:text-4xl">
              {profile.name}
            </h1>
            <p className="mt-1 text-[14px] text-text-secondary">
              {roleLabel(profile.role)} · Il tuo spazio personale
            </p>
          </div>
        </div>

        <div className="mt-8 flex gap-1 overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onTabChange(id)}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-white/[0.08] text-text-primary ring-1 ring-white/[0.08]"
                    : "text-text-muted hover:bg-white/[0.04] hover:text-text-secondary"
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={1.5} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "watched" && (
        <div className="mt-6">
          {historyLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
            </div>
          ) : watchedItems.length === 0 ? (
            <div className="page-px flex flex-col items-center justify-center py-20 text-center">
              <p className="max-w-sm text-[15px] text-text-secondary">
                Non hai ancora guardato nulla con questo profilo. I titoli appariranno qui
                automaticamente.
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
        <div className="mt-6">
          {listItems.length === 0 ? (
            <div className="page-px flex flex-col items-center justify-center py-20 text-center">
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
        />
      )}
    </div>
  );
}
