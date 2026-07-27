import type { Dispatch, SetStateAction } from "react";
import { FriendProfilePage } from "../components/FriendProfilePage";
import type { FriendProfileTarget } from "../components/chat/FriendProfileSheet";
import type { BrowseItem } from "../lib/browse";
import { parseStreamingMediaId } from "../lib/streamingBrowse";
import type { AddonWatchTarget } from "../lib/streamingBrowse";
import type { MediaItem } from "../types/media";
import type { WelibBook } from "../types/welib";
import type { WatchPartySession } from "../types/watchParty";
import { SuspenseRoute } from "./AppShell";
import {
  AddonWatchPage,
  BookReaderPage,
  MangaReaderPage,
  VideoPlayer,
  WatchPage,
} from "./lazyPages";

export type MangaReaderState = {
  mangaId: string;
  chapterId: string;
  mangaTitle: string;
  initialPage?: number;
};

export type BookReaderState = {
  book: WelibBook;
  kind: "read" | "listen";
};

interface WatchOverlayStackProps {
  profileId: string;
  isParent: boolean;
  partyGuestSession: WatchPartySession | null;
  setPartyGuestSession: Dispatch<SetStateAction<WatchPartySession | null>>;
  addonWatch: AddonWatchTarget | null;
  setAddonWatch: Dispatch<SetStateAction<AddonWatchTarget | null>>;
  watchingId: string | null;
  watchAutoplay: boolean;
  friendProfile: FriendProfileTarget | null;
  setFriendProfile: Dispatch<SetStateAction<FriendProfileTarget | null>>;
  detailSimilar: BrowseItem[];
  setDetailSimilar: Dispatch<SetStateAction<BrowseItem[]>>;
  mangaReader: MangaReaderState | null;
  setMangaReader: Dispatch<SetStateAction<MangaReaderState | null>>;
  bookReader: BookReaderState | null;
  setBookReader: Dispatch<SetStateAction<BookReaderState | null>>;
  refreshStreamingContinue: () => void | Promise<void>;
  refreshFriendAlerts: () => void;
  handleBackFromWatch: () => void;
  handlePlayNow: (id: string) => void;
  handleOpenBrowseDetail: (item: BrowseItem) => void;
  handlePlayStreaming: (preview: import("../types/stremio").StremioMetaPreview) => void;
  handlePlay: (id: string) => void;
  handleOpenSeries: (seriesKey: string) => void;
  handleToggleStreamingList: (
    preview: import("../types/stremio").StremioMetaPreview,
  ) => void;
  handleMangaReaderChapterChange: (
    chapterId: string,
    initialPage?: number,
  ) => void;
}

/**
 * Overlay watch/party/reader fuori dalla shell: restano montati sopra
 * senza smontare home keep-alive / nav.
 */
export function WatchOverlayStack({
  profileId,
  isParent,
  partyGuestSession,
  setPartyGuestSession,
  addonWatch,
  setAddonWatch,
  watchingId,
  watchAutoplay,
  friendProfile,
  setFriendProfile,
  detailSimilar,
  setDetailSimilar,
  mangaReader,
  setMangaReader,
  bookReader,
  setBookReader,
  refreshStreamingContinue,
  refreshFriendAlerts,
  handleBackFromWatch,
  handlePlayNow,
  handleOpenBrowseDetail,
  handlePlayStreaming,
  handlePlay,
  handleOpenSeries,
  handleToggleStreamingList,
  handleMangaReaderChapterChange,
}: WatchOverlayStackProps) {
  return (
    <>
      {partyGuestSession && (() => {
        const guestContent = partyGuestSession.room.content;
        const streamingTarget =
          guestContent.contentKind === "streaming"
            ? parseStreamingMediaId(guestContent.mediaId)
            : null;

        if (streamingTarget) {
          return (
            <div className="fixed inset-0 z-[70] bg-void">
              <SuspenseRoute>
                <AddonWatchPage
                  profileId={profileId}
                  contentType={streamingTarget.contentType}
                  metaId={streamingTarget.metaId}
                  videoId={streamingTarget.videoId}
                  slug={streamingTarget.slug}
                  catalogPrefix={streamingTarget.catalogPrefix}
                  watchPartySession={partyGuestSession}
                  onWatchPartySessionChange={setPartyGuestSession}
                  onBack={async () => {
                    setPartyGuestSession(null);
                    await refreshStreamingContinue();
                  }}
                  onRefreshContinue={refreshStreamingContinue}
                />
              </SuspenseRoute>
            </div>
          );
        }

        const guestMedia: MediaItem = {
          id: guestContent.mediaId || `party:${partyGuestSession.room.code}`,
          title: guestContent.title,
          mediaType: "film",
          filePath: "",
          fileName: "",
          posterUrl: guestContent.posterUrl,
          isFavorite: false,
          kidFriendly: true,
          streamingServices: [],
          genres: [],
          gradient: "from-indigo-950 via-slate-900 to-violet-950",
          createdAt: new Date(0).toISOString(),
        };

        return (
          <div className="fixed inset-0 z-[70] bg-void">
            <SuspenseRoute>
              <VideoPlayer
                streamUrl={guestContent.streamUrl}
                media={guestMedia}
                isHls={guestContent.isHls}
                watchPartySession={partyGuestSession}
                onWatchPartySessionChange={setPartyGuestSession}
                onBack={async () => {
                  setPartyGuestSession(null);
                  await refreshStreamingContinue();
                }}
              />
            </SuspenseRoute>
          </div>
        );
      })()}

      {!partyGuestSession && addonWatch && (
        <div className="fixed inset-0 z-[70] overflow-y-auto overflow-x-hidden bg-void">
          <SuspenseRoute>
            <AddonWatchPage
              key={`${addonWatch.catalogPrefix ?? "sc"}:${addonWatch.metaId}:${addonWatch.slug ?? ""}:${addonWatch.videoId ?? ""}:${addonWatch.preferredVideoId ?? ""}`}
              profileId={profileId}
              contentType={addonWatch.contentType}
              metaId={addonWatch.metaId}
              videoId={addonWatch.videoId}
              preferredVideoId={addonWatch.preferredVideoId}
              slug={addonWatch.slug}
              catalogPrefix={addonWatch.catalogPrefix}
              onBack={() => {
                setAddonWatch(null);
                setDetailSimilar([]);
                void refreshStreamingContinue();
                refreshFriendAlerts();
              }}
              onRefreshContinue={refreshStreamingContinue}
              relatedItems={detailSimilar}
              onOpenDetail={handleOpenBrowseDetail}
              onPlayRelated={handlePlay}
              onPlayStreamingRelated={handlePlayStreaming}
              onOpenSeries={handleOpenSeries}
              onToggleStreamingList={handleToggleStreamingList}
            />
          </SuspenseRoute>
        </div>
      )}

      {!partyGuestSession && !addonWatch && watchingId && (
        <div className="fixed inset-0 z-[70] bg-void">
          <SuspenseRoute>
            <WatchPage
              mediaId={watchingId}
              autoplay={watchAutoplay}
              relatedItems={detailSimilar}
              onBack={handleBackFromWatch}
              onPlayEpisode={handlePlayNow}
              onOpenDetail={handleOpenBrowseDetail}
              onPlayStreaming={handlePlayStreaming}
              onOpenSeries={handleOpenSeries}
              onToggleStreamingList={handleToggleStreamingList}
            />
          </SuspenseRoute>
        </div>
      )}

      {!partyGuestSession && !addonWatch && !watchingId && friendProfile && (
        <div className="fixed inset-0 z-[70] overflow-y-auto overflow-x-hidden bg-void">
          <FriendProfilePage
            friend={friendProfile}
            onBack={() => setFriendProfile(null)}
            onPlayStreaming={(preview) => {
              setFriendProfile(null);
              handlePlayStreaming(preview);
            }}
            onOpenChat={() => setFriendProfile(null)}
          />
        </div>
      )}

      {mangaReader && (
        <SuspenseRoute>
          <MangaReaderPage
            mangaId={mangaReader.mangaId}
            chapterId={mangaReader.chapterId}
            mangaTitle={mangaReader.mangaTitle}
            profileId={profileId}
            initialPage={mangaReader.initialPage}
            allowAdult={isParent}
            onBack={() => setMangaReader(null)}
            onChapterChange={handleMangaReaderChapterChange}
          />
        </SuspenseRoute>
      )}

      {bookReader && (
        <SuspenseRoute>
          <BookReaderPage
            book={bookReader.book}
            kind={bookReader.kind}
            onBack={() => setBookReader(null)}
          />
        </SuspenseRoute>
      )}
    </>
  );
}
