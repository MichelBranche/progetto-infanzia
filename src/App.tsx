import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStreamingSearch } from "./lib/useStreamingSearch";
import { LoadingScreen } from "./components/LoadingScreen";
import { prefetchBootCatalog } from "./lib/bootCatalog";
import { ProfileSelectScreen } from "./components/ProfileSelectScreen";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { HeroBanner } from "./components/HeroBanner";
import { MediaRow } from "./components/MediaRow";
import { SectionBrowsePage } from "./components/SectionBrowsePage";
import { RowSkeleton } from "./components/RowSkeleton";
import { StreamHubRow } from "./components/StreamHubRow";
import { EmptyLibrary } from "./components/EmptyLibrary";
import { ProfilePage, type ProfileTab } from "./components/ProfilePage";
import { AppUpdaterProvider } from "./context/AppUpdaterContext";
import { ProfilePinModal } from "./components/ProfilePinModal";
import { EditMediaModal } from "./components/EditMediaModal";
import { LibraryProvider, useLibrary } from "./context/LibraryContext";
import { AddonsProvider, useAddons } from "./context/AddonsContext";
import { CloudAccountProvider, useCloudAccount } from "./context/CloudAccountContext";
import { usePresenceHeartbeat } from "./hooks/useFriendPresence";
import { NotificationProvider } from "./context/NotificationContext";
import { CloudFriendAlertsProvider, useCloudFriendAlertsContext } from "./context/CloudFriendAlertsContext";
import { ProfileProvider, useProfile } from "./context/ProfileContext";
import { PreviewAudioProvider } from "./context/PreviewAudioContext";
import { sectionMeta } from "./data/nav";
import {
  type SeriesRef,
  getSeriesEpisodes,
  parseSeriesKey,
  toBrowseItems,
} from "./lib/browse";
import type { MediaItem } from "./types/media";
import { deleteMedia, updateMedia, enrichMetadata } from "./lib/api";
import type { AddonWatchTarget } from "./lib/streamingBrowse";
import {
  parseStreamingMediaId,
  previewToMediaItem,
  previewToWatchTarget,
} from "./lib/streamingBrowse";
import { useStreamingCatalogs } from "./lib/useStreamingCatalogs";
import { useMyList } from "./lib/useMyList";
import { markStreamingInMyList } from "./lib/myList";
import { splitTop10Row } from "./lib/streamingRows";
import type { BrowseItem } from "./lib/browse";
import { STREMIO_ADDONS_ENABLED, isBuiltinStreamingCatalog } from "./lib/features";
import { isDevAdminEmail } from "./lib/devAdmin";
import {
  buildUnifiedHomeRows,
  buildRandomHeroItems,
  enrichStreamingPreview,
  mergedSectionBrowseItems,
} from "./lib/unifiedBrowse";
import {
  browseDetailAction,
  similarBrowseItems,
} from "./lib/browseDetail";
import type { StremioMetaPreview } from "./types/stremio";
import type { WatchPartySession } from "./types/watchParty";

const WatchPage = lazy(() =>
  import("./components/WatchPage").then((m) => ({ default: m.WatchPage })),
);
const AddMediaPage = lazy(() =>
  import("./components/AddMediaPage").then((m) => ({ default: m.AddMediaPage })),
);
const SeriesDetailPage = lazy(() =>
  import("./components/SeriesDetailPage").then((m) => ({
    default: m.SeriesDetailPage,
  })),
);
const ManageLibraryPage = lazy(() =>
  import("./components/ManageLibraryPage").then((m) => ({
    default: m.ManageLibraryPage,
  })),
);
const VideoPlayer = lazy(() =>
  import("./components/VideoPlayer").then((m) => ({ default: m.VideoPlayer })),
);
const SettingsPage = lazy(() =>
  import("./components/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const ParentalActivityPage = lazy(() =>
  import("./components/ParentalActivityPage").then((m) => ({
    default: m.ParentalActivityPage,
  })),
);
const DevConsolePage = lazy(() =>
  import("./components/DevConsolePage").then((m) => ({
    default: m.DevConsolePage,
  })),
);
const StreamingPage = lazy(() =>
  import("./components/StreamingPage").then((m) => ({ default: m.StreamingPage })),
);
const AnimePage = lazy(() =>
  import("./components/AnimePage").then((m) => ({ default: m.AnimePage })),
);
const SearchOverlay = lazy(() =>
  import("./components/SearchOverlay").then((m) => ({ default: m.SearchOverlay })),
);
const NetflixTop10Row = lazy(() =>
  import("./components/NetflixTop10Row").then((m) => ({
    default: m.NetflixTop10Row,
  })),
);
const AddonWatchPage = lazy(() =>
  import("./components/AddonWatchPage").then((m) => ({
    default: m.AddonWatchPage,
  })),
);

function RouteFallback() {
  return (
    <div className="flex h-full min-h-[40vh] items-center justify-center bg-void">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-accent" />
    </div>
  );
}

function SuspenseRoute({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

function AppContent() {
  const { activeProfile, clearProfile, isParent } = useProfile();
  const { profile: cloudProfile } = useCloudAccount();
  const devMode = isDevAdminEmail(cloudProfile?.email);
  usePresenceHeartbeat(Boolean(cloudProfile));
  const { pendingCount: pendingFriendRequests, refreshFriendAlerts } =
    useCloudFriendAlertsContext();
  const {
    library,
    loading,
    searchQuery,
    setSearchQuery,
    rescan,
    scanning,
    toggleFavorite,
    getItemsBySection,
    searchResults,
    refresh,
  } = useLibrary();

  const [activeNav, setActiveNav] = useState("home");
  const [profileTab, setProfileTab] = useState<ProfileTab>("watched");
  const [searchOpen, setSearchOpen] = useState(false);
  const [watchingId, setWatchingId] = useState<string | null>(null);
  const [watchAutoplay, setWatchAutoplay] = useState(false);
  const [seriesKey, setSeriesKey] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addPresetSeries, setAddPresetSeries] = useState<SeriesRef | null>(null);
  const [addonWatch, setAddonWatch] = useState<AddonWatchTarget | null>(null);
  const [detailSimilar, setDetailSimilar] = useState<BrowseItem[]>([]);
  const [partyGuestSession, setPartyGuestSession] = useState<WatchPartySession | null>(null);
  const [heroItems, setHeroItems] = useState<MediaItem[]>([]);
  const heroSeededRef = useRef(false);
  const mainScrollRef = useRef<HTMLElement>(null);
  const [mainScrolled, setMainScrolled] = useState(false);
  const { hasStreaming } = useAddons();
  const {
    rows: streamingRows,
    previews: streamingPreviews,
    catalogIndex,
    continueItems: streamingContinue,
    loading: streamingLoading,
    syncingIndex,
    error: streamingError,
    refreshContinue: refreshStreamingContinue,
  } = useStreamingCatalogs(activeProfile?.id ?? "");
  const {
    streamingList,
    streamingListKeys,
    toggleStreaming,
    withMyListFlags,
  } = useMyList(activeProfile?.id ?? "");

  const enrichListedPreview = useMemo(
    () => (preview: StremioMetaPreview) =>
      withMyListFlags(enrichStreamingPreview(preview)),
    [withMyListFlags],
  );

  const applyMyListToBrowseItems = useCallback(
    (items: BrowseItem[]) =>
      items.map((item) => {
        if (item.kind !== "streaming") return item;
        return {
          kind: "streaming" as const,
          preview: markStreamingInMyList(item.preview, streamingListKeys),
        };
      }),
    [streamingListKeys],
  );

  const handleToggleStreamingList = useCallback(
    async (preview: StremioMetaPreview) => {
      await toggleStreaming(preview);
    },
    [toggleStreaming],
  );

  const searchableCatalog = useMemo(() => {
    const byKey = new Map<string, StremioMetaPreview>();
    const push = (preview: StremioMetaPreview) => {
      const key = `${preview.type}:${preview.id}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, preview);
        return;
      }
      if (!existing.poster && preview.poster) {
        byKey.set(key, { ...existing, poster: preview.poster });
      }
    };
    for (const preview of catalogIndex) push(preview);
    for (const row of streamingRows) {
      for (const item of row.items) push(item);
    }
    return [...byKey.values()];
  }, [catalogIndex, streamingRows]);

  const {
    results: scSearchResults,
    loading: scSearchLoading,
    loadingMore: scSearchLoadingMore,
    hasMore: scSearchHasMore,
    total: scSearchTotal,
    loadMore: loadMoreScSearch,
  } = useStreamingSearch(searchQuery, searchableCatalog);

  useEffect(() => {
    if (!isParent && (activeNav === "add" || activeNav === "manage" || activeNav === "settings" || activeNav === "activity")) {
      setActiveNav("home");
    }
  }, [isParent, activeNav]);

  if (!activeProfile) return null;

  const handlePlay = (id: string) => {
    const target = parseStreamingMediaId(id);
    if (target) {
      if (!STREMIO_ADDONS_ENABLED && !isBuiltinStreamingCatalog(target.catalogPrefix)) {
        return;
      }
      setAddonWatch({
        ...target,
        videoId: target.videoId,
      });
      return;
    }
    setWatchAutoplay(false);
    setWatchingId(id);
  };

  const handlePlayNow = (id: string) => {
    const target = parseStreamingMediaId(id);
    if (target) {
      if (!STREMIO_ADDONS_ENABLED && !isBuiltinStreamingCatalog(target.catalogPrefix)) {
        return;
      }
      setAddonWatch({
        ...target,
        videoId: target.videoId,
      });
      return;
    }
    setWatchAutoplay(true);
    setWatchingId(id);
  };

  const handleBackFromWatch = async () => {
    setWatchingId(null);
    setWatchAutoplay(false);
    setDetailSimilar([]);
    await refresh();
    await refreshStreamingContinue();
  };

  const handleNav = (id: string) => {
    if ((id === "add" || id === "manage" || id === "settings" || id === "activity") && !isParent) return;
    if (id === "dev" && !devMode) return;
    setSeriesKey(null);
    if (id === "mylist") {
      setProfileTab("list");
      setSearchOpen(false);
      setSearchQuery("");
      setActiveNav("profile");
      return;
    }
    if (id === "friends") {
      setProfileTab("friends");
      setSearchOpen(false);
      setSearchQuery("");
      setActiveNav("profile");
      return;
    }
    if (id === "profile") {
      setProfileTab("watched");
    }
    if (id === "search") {
      setSearchOpen(true);
      setActiveNav("search");
      return;
    }
    setSearchOpen(false);
    setSearchQuery("");
    setActiveNav(id);
  };

  const handleOpenSearch = () => {
    setSeriesKey(null);
    setSearchOpen(true);
    setActiveNav("search");
  };

  const handleCloseSearch = () => {
    setSearchQuery("");
    setSearchOpen(false);
    setActiveNav("home");
  };

  const handleAddSuccess = async () => {
    await refresh();
    setAddPresetSeries(null);
    setActiveNav("home");
  };

  const editingMedia = useMemo(() => {
    if (!editingId || !library) return null;
    return library.items.find((item) => item.id === editingId) ?? null;
  }, [editingId, library]);

  useEffect(() => {
    if (!watchingId && !addonWatch) {
      void refreshStreamingContinue();
    }
  }, [watchingId, addonWatch, refreshStreamingContinue]);

  useEffect(() => {
    if (activeNav === "home") {
      void refreshStreamingContinue();
    }
  }, [activeNav, refreshStreamingContinue]);

  const heroStreamingPreviews = useMemo(() => {
    if (streamingPreviews.length > 0) return streamingPreviews;
    const seen = new Set<string>();
    const fallback: StremioMetaPreview[] = [];
    for (const row of streamingRows) {
      for (const item of row.items) {
        const key = `${item.type}:${item.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        fallback.push(item);
      }
    }
    return fallback;
  }, [streamingPreviews, streamingRows]);

  useEffect(() => {
    if (activeNav !== "home") return;
    if (loading) return;
    if (heroSeededRef.current) return;
    if (heroStreamingPreviews.length === 0 && (library?.items.length ?? 0) === 0) {
      return;
    }
    heroSeededRef.current = true;
    setHeroItems(
      buildRandomHeroItems(
        library?.items ?? [],
        heroStreamingPreviews,
        (preview) => previewToMediaItem(enrichListedPreview(preview)),
        8,
      ),
    );
  }, [
    activeNav,
    library?.items,
    heroStreamingPreviews,
    enrichListedPreview,
    loading,
  ]);

  const localFavorites = useMemo(
    () => library?.items.filter((item) => item.isFavorite) ?? [],
    [library?.items],
  );

  const myListCount = useMemo(
    () => localFavorites.length + streamingList.length,
    [localFavorites.length, streamingList.length],
  );

  const sidebarBadges = useMemo(() => {
    const badges: Record<string, number> = {};
    if (myListCount > 0) badges.profile = myListCount;
    return Object.keys(badges).length > 0 ? badges : undefined;
  }, [myListCount]);

  const sidebarAlertDots = useMemo(
    () => (pendingFriendRequests > 0 ? ["profile"] as const : undefined),
    [pendingFriendRequests],
  );

  const { top10Row, otherRows: streamingRowsWithoutTop10 } = useMemo(
    () => splitTop10Row(streamingRows),
    [streamingRows],
  );

  const searchSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: StremioMetaPreview[] = [];
    const push = (preview: StremioMetaPreview) => {
      const key = `${preview.type}:${preview.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(preview);
    };
    for (const preview of streamingPreviews) push(preview);
    for (const row of streamingRows) {
      for (const item of row.items) push(item);
    }
    return out.slice(0, 36);
  }, [streamingPreviews, streamingRows]);

  const unifiedHomeRows = useMemo(() => {
    const rows = buildUnifiedHomeRows(
      library?.collections ?? [],
      streamingRowsWithoutTop10,
      streamingContinue,
      library?.items ?? [],
      streamingList.map(withMyListFlags),
      streamingPreviews,
      { mergeStreaming: true },
    );
    return rows.map((row) => ({
      ...row,
      items: applyMyListToBrowseItems(row.items),
    }));
  }, [
    library?.collections,
    library?.items,
    streamingRowsWithoutTop10,
    streamingContinue,
    streamingPreviews,
    applyMyListToBrowseItems,
    streamingList,
    withMyListFlags,
  ]);

  const homeContentReady = !loading;
  const homeStreamingPending =
    streamingLoading && streamingRows.length === 0 && unifiedHomeRows.length === 0;

  const saturnSeedPreviews = useMemo(() => {
    const seen = new Set<string>();
    const out: StremioMetaPreview[] = [];
    for (const row of streamingRows) {
      if (!row.key.startsWith("saturn")) continue;
      for (const item of row.items) {
        const key = `${item.type}:${item.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
      }
    }
    return out;
  }, [streamingRows]);

  const sectionBrowseItems = useMemo(() => {
    const localItems = getItemsBySection(activeNav);
    return mergedSectionBrowseItems(
      activeNav,
      localItems,
      streamingPreviews.map(withMyListFlags),
      scSearchResults.map(withMyListFlags),
      streamingRows,
    );
  }, [
    activeNav,
    getItemsBySection,
    streamingPreviews,
    scSearchResults,
    withMyListFlags,
    streamingRows,
  ]);

  const sectionStreamingCount = useMemo(
    () => sectionBrowseItems.filter((item) => item.kind === "streaming").length,
    [sectionBrowseItems],
  );

  const sectionBrowseSubtitle = useMemo(() => {
    const base = sectionMeta[activeNav]?.subtitle ?? "";
    if (sectionStreamingCount > 0) {
      return `${base} · ${sectionStreamingCount.toLocaleString("it-IT")} titoli in streaming`;
    }
    return base;
  }, [activeNav, sectionStreamingCount]);

  const browsePool = useMemo(() => {
    const byId = new Map<string, BrowseItem>();
    const push = (item: BrowseItem) => {
      const key =
        item.kind === "streaming"
          ? `${item.preview.type}:${item.preview.id}`
          : item.kind === "series"
            ? `series:${item.series.mediaType}::${item.series.seriesTitle}`
            : item.item.id;
      if (!byId.has(key)) byId.set(key, item);
    };
    for (const item of sectionBrowseItems) push(item);
    for (const row of unifiedHomeRows) {
      for (const item of row.items) push(item);
    }
    return [...byId.values()];
  }, [sectionBrowseItems, unifiedHomeRows]);

  const handleOpenBrowseDetail = useCallback(
    (browse: BrowseItem, pool?: BrowseItem[]) => {
      setDetailSimilar(similarBrowseItems(browse, pool ?? browsePool));
      const action = browseDetailAction(browse);
      if (!action) return;
      if (action.type === "watch") {
        setWatchAutoplay(false);
        setWatchingId(action.mediaId);
        return;
      }
      if (action.type === "series") {
        setSeriesKey(action.seriesKey);
        return;
      }
      setAddonWatch(action.target);
    },
    [browsePool],
  );

  const handleOpenSeries = useCallback(
    (key: string) => {
      const series = parseSeriesKey(key);
      if (series && library?.items) {
        const episodes = getSeriesEpisodes(library.items, series);
        const [browse] = toBrowseItems(episodes);
        if (browse?.kind === "series") {
          setDetailSimilar(similarBrowseItems(browse, browsePool));
        }
      }
      setSeriesKey(key);
    },
    [library?.items, browsePool],
  );

  useEffect(() => {
    const el = mainScrollRef.current;
    if (!el) return;
    const onScroll = () => setMainScrolled(el.scrollTop > 32);
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [activeNav, seriesKey]);

  const handlePlayStreaming = (preview: StremioMetaPreview) => {
    if (!STREMIO_ADDONS_ENABLED && !isBuiltinStreamingCatalog(preview.catalogPrefix)) {
      return;
    }
    const target = previewToWatchTarget(preview);
    if (
      (target.catalogPrefix === "sc" ||
        target.catalogPrefix === "saturn" ||
        target.catalogPrefix === "loonex") &&
      !target.slug
    ) {
      return;
    }
    if (!target.catalogPrefix && !STREMIO_ADDONS_ENABLED) {
      return;
    }
    setAddonWatch(target);
  };

  if (partyGuestSession) {
    const guestContent = partyGuestSession.room.content;
    const streamingTarget =
      guestContent.contentKind === "streaming"
        ? parseStreamingMediaId(guestContent.mediaId)
        : null;

    if (streamingTarget) {
      return (
        <SuspenseRoute>
          <AddonWatchPage
          profileId={activeProfile.id}
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
    );
  }

  if (addonWatch) {
    const handleBackFromAddon = async () => {
      setAddonWatch(null);
      setDetailSimilar([]);
      await refreshStreamingContinue();
      refreshFriendAlerts();
    };

    return (
      <div className="h-full overflow-y-auto overflow-x-hidden bg-void">
        <SuspenseRoute>
          <AddonWatchPage
          key={`${addonWatch.catalogPrefix ?? "sc"}:${addonWatch.metaId}:${addonWatch.slug ?? ""}:${addonWatch.videoId ?? ""}:${addonWatch.preferredVideoId ?? ""}`}
          profileId={activeProfile.id}
          contentType={addonWatch.contentType}
          metaId={addonWatch.metaId}
          videoId={addonWatch.videoId}
          preferredVideoId={addonWatch.preferredVideoId}
          slug={addonWatch.slug}
          catalogPrefix={addonWatch.catalogPrefix}
          onBack={handleBackFromAddon}
          onRefreshContinue={refreshStreamingContinue}
          relatedItems={detailSimilar}
          onOpenDetail={handleOpenBrowseDetail}
          onPlayRelated={handlePlay}
          onPlayStreamingRelated={handlePlayStreaming}
          onOpenSeries={handleOpenSeries}
          onToggleFavorite={toggleFavorite}
          onToggleStreamingList={handleToggleStreamingList}
          onEdit={isParent ? (id) => setEditingId(id) : undefined}
          />
        </SuspenseRoute>
      </div>
    );
  }

  if (watchingId) {
    return (
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
    );
  }

  const isEmpty = library && library.totalCount === 0;
  const streamingBrowseNav = new Set([
    "home",
    "film",
    "serie",
    "cartoni",
    "capsula",
    "search",
  ]);
  const showEmptyLibraryOnly =
    isEmpty &&
    !["add", "settings", "manage", "activity", "profile", "anime", "streaming", "dev"].includes(
      activeNav,
    ) &&
    !(hasStreaming && streamingBrowseNav.has(activeNav));
  const sectionInfo = sectionMeta[activeNav];

  return (
    <motion.div
      className="flex h-full min-h-0 bg-void"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="noise-overlay pointer-events-none fixed inset-0 z-0 opacity-[0.25]" />

      <Sidebar
        activeId={searchOpen ? "search" : activeNav}
        profile={activeProfile}
        devMode={devMode}
        onNavigate={handleNav}
        onSwitchProfile={clearProfile}
        badgeCounts={sidebarBadges}
        alertDots={sidebarAlertDots}
      />

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          profile={activeProfile}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenSearch={handleOpenSearch}
          onCloseSearch={handleCloseSearch}
          searchActive={searchOpen}
          onRescan={rescan}
          onSwitchProfile={clearProfile}
          scanning={scanning}
          scrolled={mainScrolled}
        />

        <SuspenseRoute>
          <SearchOverlay
          open={searchOpen}
          query={searchQuery}
          onClose={handleCloseSearch}
          localResults={searchResults}
          streamingResults={scSearchResults}
          streamingTotal={scSearchTotal}
          suggestions={searchSuggestions}
          streamingLoading={scSearchLoading}
          streamingLoadingMore={scSearchLoadingMore}
          streamingHasMore={scSearchHasMore}
          onLoadMoreStreaming={loadMoreScSearch}
          onPlay={handlePlay}
          onPlayStreaming={handlePlayStreaming}
          onOpenSeries={handleOpenSeries}
          onToggleFavorite={toggleFavorite}
          onToggleStreamingList={handleToggleStreamingList}
          enrichStreamingPreview={enrichListedPreview}
          onEdit={isParent ? (id) => setEditingId(id) : undefined}
          />
        </SuspenseRoute>

        <main
          ref={mainScrollRef}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scroll-smooth"
        >
          {loading && !library ? (
            <div className="flex h-full items-center justify-center pt-20">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-accent" />
            </div>
          ) : showEmptyLibraryOnly ? (
            <EmptyLibrary
              mediaRoot={library?.mediaRoot ?? ""}
              onRescan={rescan}
              scanning={scanning}
              onAdd={isParent ? () => setActiveNav("add") : undefined}
            />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={seriesKey ?? activeNav}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              >
                {seriesKey && library && (
                  <SuspenseRoute>
                    <SeriesDetailPage
                    seriesKey={seriesKey}
                    items={library.items}
                    isParent={isParent}
                    relatedItems={detailSimilar}
                    onBack={() => {
                      setSeriesKey(null);
                      setDetailSimilar([]);
                    }}
                    onPlay={handlePlayNow}
                    onOpenDetail={handleOpenBrowseDetail}
                    onPlayStreaming={handlePlayStreaming}
                    onOpenSeries={handleOpenSeries}
                    onToggleFavorite={toggleFavorite}
                    onToggleStreamingList={handleToggleStreamingList}
                    onEdit={setEditingId}
                    onDelete={async (id) => {
                      await deleteMedia(activeProfile.id, id);
                      await refresh();
                    }}
                    onAddEpisode={(series) => {
                      setAddPresetSeries(series);
                      setSeriesKey(null);
                      setActiveNav("add");
                    }}
                    />
                  </SuspenseRoute>
                )}

                {!seriesKey && activeNav === "add" && isParent && (
                  <SuspenseRoute>
                    <AddMediaPage
                    presetSeries={addPresetSeries}
                    onSuccess={handleAddSuccess}
                    onCancel={() => {
                      setAddPresetSeries(null);
                      setActiveNav("home");
                    }}
                    />
                  </SuspenseRoute>
                )}

                {!seriesKey && activeNav === "anime" && (
                  <SuspenseRoute>
                    <AnimePage
                    seedPreviews={saturnSeedPreviews}
                    onPlayStreaming={handlePlayStreaming}
                    enrichStreamingPreview={enrichListedPreview}
                    />
                  </SuspenseRoute>
                )}

                {!seriesKey && activeNav === "streaming" && STREMIO_ADDONS_ENABLED && (
                  <SuspenseRoute>
                    <StreamingPage
                    profileId={activeProfile.id}
                    onStartWatch={setAddonWatch}
                    />
                  </SuspenseRoute>
                )}

                {!seriesKey && activeNav === "settings" && isParent && (
                  <SuspenseRoute>
                    <SettingsPage
                    profileId={activeProfile.id}
                    onRescanComplete={() => void refresh()}
                    onOpenManage={() => setActiveNav("manage")}
                    />
                  </SuspenseRoute>
                )}

                {!seriesKey && activeNav === "profile" && library && (
                  <ProfilePage
                    profile={activeProfile}
                    profileId={activeProfile.id}
                    activeTab={profileTab}
                    onTabChange={setProfileTab}
                    libraryItems={library.items}
                    localFavorites={localFavorites}
                    streamingList={streamingList}
                    streamingListKeys={streamingListKeys}
                    onPlay={handlePlay}
                    onPlayStreaming={handlePlayStreaming}
                    onToggleFavorite={toggleFavorite}
                    onToggleStreamingList={handleToggleStreamingList}
                    onEdit={isParent ? (id) => setEditingId(id) : undefined}
                    onJoinSession={(session) => {
                      setPartyGuestSession(session);
                    }}
                    pendingFriendRequests={pendingFriendRequests}
                  />
                )}

                {!seriesKey && activeNav === "activity" && isParent && (
                  <SuspenseRoute>
                    <ParentalActivityPage />
                  </SuspenseRoute>
                )}

                {!seriesKey && activeNav === "dev" && devMode && (
                  <SuspenseRoute>
                    <DevConsolePage />
                  </SuspenseRoute>
                )}

                {!seriesKey && activeNav === "manage" && isParent && library && (
                  <SuspenseRoute>
                    <ManageLibraryPage
                    items={library.items}
                    onPlay={handlePlay}
                    onEdit={setEditingId}
                    onDelete={async (id) => {
                      await deleteMedia(activeProfile.id, id);
                      await refresh();
                    }}
                    />
                  </SuspenseRoute>
                )}

                {!seriesKey && activeNav === "home" && (
                  <>
                    {!homeContentReady ? (
                      <div className="pb-16">
                        <div className="h-[52vh] min-h-[320px] shimmer-bg sm:min-h-[360px]" />
                        <RowSkeleton />
                        <RowSkeleton />
                        <RowSkeleton />
                      </div>
                    ) : (
                      <>
                    {homeStreamingPending && (
                      <div className="page-px pb-2 pt-4">
                        <RowSkeleton />
                        <RowSkeleton />
                      </div>
                    )}
                    {syncingIndex && streamingRows.length > 0 && (
                      <p className="page-px pt-24 text-center text-[12px] text-text-muted sm:pt-28">
                        Sincronizzazione catalogo in corso…
                      </p>
                    )}
                    {heroItems.length > 0 && (
                      <HeroBanner
                        items={heroItems}
                        scrollContainerRef={mainScrollRef}
                        onPlay={handlePlayNow}
                        onOpenSeries={(media) => {
                          if (media.seriesTitle) {
                            handleOpenSeries(
                              `${media.mediaType}::${media.seriesTitle}`,
                            );
                          }
                        }}
                        onToggleFavorite={toggleFavorite}
                        onToggleStreamingList={handleToggleStreamingList}
                        onEdit={
                          isParent
                            ? (media) => setEditingId(media.id)
                            : undefined
                        }
                      />
                    )}
                    <StreamHubRow onNavigate={handleNav} />
                    {top10Row && (
                      <SuspenseRoute>
                        <NetflixTop10Row
                        title={top10Row.title}
                        items={top10Row.items}
                        onPlayStreaming={handlePlayStreaming}
                        onOpenDetail={handleOpenBrowseDetail}
                        />
                      </SuspenseRoute>
                    )}
                    {(unifiedHomeRows.length > 0 || streamingError) && (
                      <div className="relative -mt-4 space-y-0.5 overflow-visible sm:-mt-5">
                        {unifiedHomeRows.map((row, i) => (
                            <MediaRow
                              key={row.key}
                              index={String(i + 1).padStart(2, "0")}
                              title={row.title}
                              subtitle={row.subtitle}
                              items={row.items}
                              animateEntrance
                              onPlay={handlePlayNow}
                              onPlayStreaming={handlePlayStreaming}
                              onOpenDetail={handleOpenBrowseDetail}
                              onOpenSeries={handleOpenSeries}
                              onToggleFavorite={toggleFavorite}
                              onToggleStreamingList={handleToggleStreamingList}
                              actionLabel={
                                row.key === "favorites" ? "Vedi tutto" : undefined
                              }
                              onActionClick={
                                row.key === "favorites"
                                  ? () => {
                                      setProfileTab("list");
                                      setActiveNav("profile");
                                    }
                                  : undefined
                              }
                              onEdit={
                                isParent ? (id) => setEditingId(id) : undefined
                              }
                            />
                          ))}
                      </div>
                    )}

                    {hasStreaming &&
                      streamingError &&
                      unifiedHomeRows.length === 0 && (
                        <p className="page-px py-8 text-center text-[13px] text-text-muted">
                          {streamingError}
                        </p>
                      )}
                      </>
                    )}
                  </>
                )}

                {!seriesKey &&
                  activeNav !== "home" &&
                  activeNav !== "anime" &&
                  activeNav !== "profile" &&
                  activeNav !== "add" &&
                  activeNav !== "manage" &&
                  activeNav !== "settings" &&
                  activeNav !== "streaming" &&
                  activeNav !== "activity" &&
                  activeNav !== "dev" && (
                  <SectionBrowsePage
                    sectionId={activeNav}
                    title={sectionInfo?.title ?? activeNav}
                    subtitle={sectionBrowseSubtitle}
                    syncing={syncingIndex}
                    loading={streamingLoading && sectionBrowseItems.length === 0}
                    cardVariant={activeNav === "cartoni" ? "portrait" : undefined}
                    items={sectionBrowseItems}
                    onPlay={handlePlayNow}
                    onPlayStreaming={handlePlayStreaming}
                    onOpenDetail={handleOpenBrowseDetail}
                    onOpenSeries={handleOpenSeries}
                    onToggleFavorite={toggleFavorite}
                    onToggleStreamingList={handleToggleStreamingList}
                    onEdit={
                      isParent ? (id) => setEditingId(id) : undefined
                    }
                  />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>

      {editingMedia && isParent && (
        <EditMediaModal
          media={editingMedia}
          onClose={() => setEditingId(null)}
          onSave={async (input) => {
            await updateMedia(activeProfile.id, editingMedia.id, input);
            await refresh();
          }}
          onDelete={async () => {
            await deleteMedia(activeProfile.id, editingMedia.id);
            await refresh();
            setEditingId(null);
          }}
          onEnrichTmdb={async () => {
            const updated = await enrichMetadata(
              activeProfile.id,
              editingMedia.id,
            );
            await refresh();
            return updated;
          }}
        />
      )}
    </motion.div>
  );
}

function AppGate() {
  const [bootPhase, setBootPhase] = useState<"intro" | "preparing" | "done">("intro");
  const [catalogReady, setCatalogReady] = useState(false);
  const {
    activeProfile,
    pendingProfile,
    completePinUnlock,
    cancelPinUnlock,
    verifyPin,
  } = useProfile();

  useEffect(() => {
    void prefetchBootCatalog();
    setCatalogReady(true);
  }, []);

  const bootDone = bootPhase === "done";

  return (
    <>
      <AnimatePresence>
        {!bootDone && (
          <LoadingScreen
            key="loader"
            preparing={bootPhase === "preparing"}
            ready={catalogReady}
            onIntroComplete={() => setBootPhase("preparing")}
            onComplete={() => setBootPhase("done")}
          />
        )}
      </AnimatePresence>

      {bootDone && !activeProfile && !pendingProfile && <ProfileSelectScreen />}

      {bootDone && pendingProfile && !activeProfile && (
        <ProfilePinModal
          profile={pendingProfile}
          onCancel={cancelPinUnlock}
          onSubmit={async (pin) => {
            const ok = await verifyPin(pendingProfile.id, pin);
            if (!ok) throw new Error("PIN non corretto");
            completePinUnlock(pendingProfile);
          }}
        />
      )}

      {bootDone && activeProfile && (
        <LibraryProvider profileId={activeProfile.id}>
          <AddonsProvider profileId={activeProfile.id}>
            <AppUpdaterProvider>
              <CloudFriendAlertsProvider>
                <AppContent />
              </CloudFriendAlertsProvider>
            </AppUpdaterProvider>
          </AddonsProvider>
        </LibraryProvider>
      )}
    </>
  );
}

function App() {
  return (
    <CloudAccountProvider>
      <NotificationProvider>
        <ProfileProvider>
          <PreviewAudioProvider>
            <AppGate />
          </PreviewAudioProvider>
        </ProfileProvider>
      </NotificationProvider>
    </CloudAccountProvider>
  );
}

export default App;
