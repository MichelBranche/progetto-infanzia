import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStreamingSearch } from "./lib/useStreamingSearch";
import { LoadingScreen } from "./components/LoadingScreen";
import { prefetchBootCatalog } from "./lib/bootCatalog";
import { ProfileSelectScreen } from "./components/ProfileSelectScreen";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { HeroBanner } from "./components/HeroBanner";
import { MediaRow } from "./components/MediaRow";
import { MediaGrid } from "./components/MediaGrid";
import { EmptyLibrary } from "./components/EmptyLibrary";
import { WatchPage } from "./components/WatchPage";
import { AddMediaPage } from "./components/AddMediaPage";
import { SeriesDetailPage } from "./components/SeriesDetailPage";
import { ManageLibraryPage } from "./components/ManageLibraryPage";
import { ProfilePage, type ProfileTab } from "./components/ProfilePage";
import { VideoPlayer } from "./components/VideoPlayer";
import { SettingsPage } from "./components/SettingsPage";
import { AppUpdaterProvider } from "./context/AppUpdaterContext";
import { ParentalActivityPage } from "./components/ParentalActivityPage";
import { StreamingPage } from "./components/StreamingPage";
import { AnimePage } from "./components/AnimePage";
import { splitTop10Row } from "./lib/streamingRows";
import { SearchOverlay } from "./components/SearchOverlay";
import { NetflixTop10Row } from "./components/NetflixTop10Row";
import { AddonWatchPage } from "./components/AddonWatchPage";
import { ProfilePinModal } from "./components/ProfilePinModal";
import { EditMediaModal } from "./components/EditMediaModal";
import { LibraryProvider, useLibrary } from "./context/LibraryContext";
import { AddonsProvider, useAddons } from "./context/AddonsContext";
import { CloudAccountProvider } from "./context/CloudAccountContext";
import { ProfileProvider, useProfile } from "./context/ProfileContext";
import { PreviewAudioProvider } from "./context/PreviewAudioContext";
import { sectionMeta } from "./data/nav";
import {
  type SeriesRef,
} from "./lib/browse";
import type { MediaItem } from "./types/media";
import { deleteMedia, updateMedia, enrichMetadata } from "./lib/api";
import type { AddonWatchTarget } from "./lib/streamingBrowse";
import {
  parseStreamingMediaId,
  previewToMediaItem,
} from "./lib/streamingBrowse";
import { useStreamingCatalogs } from "./lib/useStreamingCatalogs";
import { useMyList } from "./lib/useMyList";
import { markStreamingInMyList } from "./lib/myList";
import type { BrowseItem } from "./lib/browse";
import { STREMIO_ADDONS_ENABLED, isBuiltinStreamingCatalog } from "./lib/features";
import {
  buildUnifiedHomeRows,
  buildRandomHeroItems,
  enrichStreamingPreview,
  mergedSectionBrowseItems,
} from "./lib/unifiedBrowse";
import type { StremioMetaPreview } from "./types/stremio";
import type { WatchPartySession } from "./types/watchParty";

function AppContent() {
  const { activeProfile, clearProfile, isParent } = useProfile();
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
  const [partyGuestSession, setPartyGuestSession] = useState<WatchPartySession | null>(null);
  const [heroItems, setHeroItems] = useState<MediaItem[]>([]);
  const heroSeededRef = useRef(false);
  const { hasStreaming } = useAddons();
  const {
    rows: streamingRows,
    previews: streamingPreviews,
    catalogIndex,
    continueItems: streamingContinue,
    catalogTotal,
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
    await refresh();
    await refreshStreamingContinue();
  };

  const handleNav = (id: string) => {
    if ((id === "add" || id === "manage" || id === "settings" || id === "activity") && !isParent) return;
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

  const handleOpenSeries = (key: string) => setSeriesKey(key);

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

  const sidebarBadges = useMemo(
    () => (myListCount > 0 ? { profile: myListCount } : undefined),
    [myListCount],
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
    );
  }, [
    activeNav,
    getItemsBySection,
    streamingPreviews,
    scSearchResults,
    withMyListFlags,
  ]);

  const handlePlayStreaming = (preview: StremioMetaPreview) => {
    if (!STREMIO_ADDONS_ENABLED && !isBuiltinStreamingCatalog(preview.catalogPrefix)) {
      return;
    }

    const resumeVideoId =
      preview.resumeVideoId?.trim() ||
      (preview.type === "movie" &&
      preview.watchPosition != null &&
      preview.watchPosition > 5
        ? preview.id
        : undefined);

    if (preview.catalogPrefix === "sc") {
      if (!preview.slug) return;
      setAddonWatch({
        contentType: preview.type,
        metaId: preview.id,
        slug: preview.slug,
        catalogPrefix: "sc",
        videoId: resumeVideoId,
      });
      return;
    }

    if (preview.catalogPrefix === "saturn") {
      if (!preview.slug) return;
      setAddonWatch({
        contentType: preview.type,
        metaId: preview.slug,
        slug: preview.slug,
        catalogPrefix: "saturn",
        videoId: resumeVideoId,
      });
      return;
    }

    if (!STREMIO_ADDONS_ENABLED) {
      return;
    }

    setAddonWatch({
      contentType: preview.type,
      metaId: preview.id,
      videoId: resumeVideoId,
    });
  };

  if (partyGuestSession) {
    const guestContent = partyGuestSession.room.content;
    const streamingTarget =
      guestContent.contentKind === "streaming"
        ? parseStreamingMediaId(guestContent.mediaId)
        : null;

    if (streamingTarget) {
      return (
        <AddonWatchPage
          profileId={activeProfile.id}
          contentType={streamingTarget.contentType}
          metaId={streamingTarget.metaId}
          videoId={streamingTarget.videoId}
          slug={streamingTarget.slug}
          catalogPrefix={streamingTarget.catalogPrefix}
          watchPartySession={partyGuestSession}
          onWatchPartySessionChange={setPartyGuestSession}
          onBack={() => setPartyGuestSession(null)}
        />
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
      <VideoPlayer
        streamUrl={guestContent.streamUrl}
        media={guestMedia}
        isHls={guestContent.isHls}
        watchPartySession={partyGuestSession}
        onWatchPartySessionChange={setPartyGuestSession}
        onBack={() => setPartyGuestSession(null)}
      />
    );
  }

  if (addonWatch) {
    return (
      <div className="h-full overflow-y-auto overflow-x-hidden bg-void">
        <AddonWatchPage
          profileId={activeProfile.id}
          contentType={addonWatch.contentType}
          metaId={addonWatch.metaId}
          videoId={addonWatch.videoId}
          slug={addonWatch.slug}
          catalogPrefix={addonWatch.catalogPrefix}
          onBack={async () => {
            setAddonWatch(null);
            await refreshStreamingContinue();
          }}
        />
      </div>
    );
  }

  if (watchingId) {
    return (
      <WatchPage
        mediaId={watchingId}
        autoplay={watchAutoplay}
        onBack={handleBackFromWatch}
        onPlayEpisode={handlePlayNow}
      />
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
    !["add", "settings", "manage", "activity", "profile", "anime", "streaming"].includes(
      activeNav,
    ) &&
    !(hasStreaming && streamingBrowseNav.has(activeNav));
  const sectionInfo = sectionMeta[activeNav];
  const sectionSubtitle =
    catalogTotal > 0 &&
    (activeNav === "film" || activeNav === "serie" || activeNav === "cartoni")
      ? `${sectionInfo?.subtitle ?? ""} · ${catalogTotal.toLocaleString("it-IT")} titoli streaming sincronizzati dal sito`
      : sectionInfo?.subtitle;

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
        onNavigate={handleNav}
        badgeCounts={sidebarBadges}
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
          totalCount={library?.totalCount}
        />

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

        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
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
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                {seriesKey && library && (
                  <SeriesDetailPage
                    seriesKey={seriesKey}
                    items={library.items}
                    isParent={isParent}
                    onBack={() => setSeriesKey(null)}
                    onPlay={handlePlayNow}
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
                )}

                {!seriesKey && activeNav === "add" && isParent && (
                  <AddMediaPage
                    presetSeries={addPresetSeries}
                    onSuccess={handleAddSuccess}
                    onCancel={() => {
                      setAddPresetSeries(null);
                      setActiveNav("home");
                    }}
                  />
                )}

                {!seriesKey && activeNav === "anime" && (
                  <AnimePage
                    seedPreviews={saturnSeedPreviews}
                    onPlayStreaming={handlePlayStreaming}
                    enrichStreamingPreview={enrichListedPreview}
                  />
                )}

                {!seriesKey && activeNav === "streaming" && STREMIO_ADDONS_ENABLED && (
                  <StreamingPage
                    profileId={activeProfile.id}
                    onStartWatch={setAddonWatch}
                  />
                )}

                {!seriesKey && activeNav === "settings" && isParent && (
                  <SettingsPage
                    profileId={activeProfile.id}
                    onRescanComplete={() => void refresh()}
                    onOpenManage={() => setActiveNav("manage")}
                  />
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
                  />
                )}

                {!seriesKey && activeNav === "activity" && isParent && (
                  <ParentalActivityPage />
                )}

                {!seriesKey && activeNav === "manage" && isParent && library && (
                  <ManageLibraryPage
                    items={library.items}
                    onPlay={handlePlay}
                    onEdit={setEditingId}
                    onDelete={async (id) => {
                      await deleteMedia(activeProfile.id, id);
                      await refresh();
                    }}
                  />
                )}

                {!seriesKey && activeNav === "home" && (
                  <>
                    {!homeContentReady ? (
                      <div className="flex min-h-[70vh] items-center justify-center bg-[#0a0a0a]">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-accent" />
                      </div>
                    ) : (
                      <>
                    {homeStreamingPending && (
                      <div className="flex items-center justify-center gap-3 py-16 text-text-muted">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-accent" />
                        <span className="text-[14px]">Caricamento catalogo streaming…</span>
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
                        onPlay={handlePlay}
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
                    {top10Row && (
                      <NetflixTop10Row
                        title={top10Row.title}
                        items={top10Row.items}
                        onPlayStreaming={handlePlayStreaming}
                      />
                    )}
                    {(unifiedHomeRows.length > 0 || streamingError) && (
                      <div className="relative z-10 -mt-4 space-y-0.5 sm:-mt-5">
                        {unifiedHomeRows.map((row, i) => (
                            <MediaRow
                              key={row.key}
                              index={String(i + 1).padStart(2, "0")}
                              title={row.title}
                              subtitle={row.subtitle}
                              items={row.items}
                              onPlay={handlePlay}
                              onPlayStreaming={handlePlayStreaming}
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
                  activeNav !== "streaming" && (
                  <>
                    <div className="page-px pt-24 sm:pt-28">
                      <span className="font-display text-[11px] tabular-nums text-text-muted sm:text-xs">
                        —
                      </span>
                      <h2 className="font-display mt-2 text-3xl font-semibold tracking-[-0.03em] text-text-primary sm:text-4xl">
                        {sectionInfo?.title ?? activeNav}
                      </h2>
                      {sectionSubtitle && (
                        <p className="mt-2 text-[14px] text-text-secondary sm:text-[15px]">
                          {sectionSubtitle}
                          {syncingIndex && (
                            <span className="ml-2 text-text-muted">
                              · Aggiornamento catalogo…
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    <MediaGrid
                      items={sectionBrowseItems}
                      onPlay={handlePlay}
                      onPlayStreaming={handlePlayStreaming}
                      onOpenSeries={handleOpenSeries}
                      onToggleFavorite={toggleFavorite}
                      onToggleStreamingList={handleToggleStreamingList}
                      onEdit={
                        isParent ? (id) => setEditingId(id) : undefined
                      }
                    />
                  </>
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
    const timeout = window.setTimeout(() => setCatalogReady(true), 10_000);
    void prefetchBootCatalog().finally(() => {
      window.clearTimeout(timeout);
      setCatalogReady(true);
    });
    return () => window.clearTimeout(timeout);
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
              <AppContent />
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
      <ProfileProvider>
        <PreviewAudioProvider>
          <AppGate />
        </PreviewAudioProvider>
      </ProfileProvider>
    </CloudAccountProvider>
  );
}

export default App;
