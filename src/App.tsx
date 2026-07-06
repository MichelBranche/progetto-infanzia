import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStreamingSearch } from "./lib/useStreamingSearch";
import { LoadingScreen } from "./components/LoadingScreen";
import { prefetchBootCatalog } from "./lib/bootCatalog";
import { ProfileSelectScreen } from "./components/ProfileSelectScreen";
import { AppTopNav } from "./components/AppTopNav";
import { HeroBanner } from "./components/HeroBanner";
import { MediaRow } from "./components/MediaRow";
import { SectionBrowsePage } from "./components/SectionBrowsePage";
import { CartoniBrowsePage } from "./components/CartoniBrowsePage";
import { RowSkeleton } from "./components/RowSkeleton";
import { StreamHubRow } from "./components/StreamHubRow";
import { MangaPromoBanner } from "./components/MangaPromoBanner";
import { ProfilePage, type ProfileTab } from "./components/ProfilePage";
import { AppUpdaterProvider } from "./context/AppUpdaterContext";
import { ProfilePinModal } from "./components/ProfilePinModal";
import { LibraryProvider, useLibrary } from "./context/LibraryContext";
import { AddonsProvider, useAddons } from "./context/AddonsContext";
import { CloudAccountProvider, useCloudAccount } from "./context/CloudAccountContext";
import { usePresenceHeartbeat } from "./hooks/useFriendPresence";
import { NotificationProvider, useNotifications } from "./context/NotificationContext";
import { CloudFriendAlertsProvider, useCloudFriendAlertsContext } from "./context/CloudFriendAlertsContext";
import { ChatMessageAlertsProvider } from "./context/ChatMessageAlertsContext";
import { ProfileProvider, useProfile } from "./context/ProfileContext";
import {
  AppAccessProvider,
  useAppAccess,
} from "./context/AppAccessContext";
import { tryGrandfatherExistingInstall } from "./lib/appAccess";
import { AppAccessBootstrap, AppAccessScreen } from "./components/AppAccessScreen";
import { GuestUsageBanner } from "./components/GuestUsageBanner";
import { PreviewAudioProvider } from "./context/PreviewAudioContext";
import {
  ARCHIVIO_CARTONI_LOGO,
  isArchivioCartoniRow,
} from "./lib/brandAssets";
import { sectionMeta } from "./data/nav";
import type { BrowseItem } from "./lib/browse";
import type { MediaItem } from "./types/media";
import type { StremioMetaPreview } from "./types/stremio";
import type { AddonWatchTarget } from "./lib/streamingBrowse";
import {
  parseStreamingMediaId,
  previewToMediaItem,
  previewToWatchTarget,
} from "./lib/streamingBrowse";
import { useStreamingCatalogs } from "./lib/useStreamingCatalogs";
import { useMyList } from "./lib/useMyList";
import { markStreamingInMyList, mediaItemToStreamingPreview, streamingListKey } from "./lib/myList";
import { splitTop10Row } from "./lib/streamingRows";
import { STREMIO_ADDONS_ENABLED, isBuiltinStreamingCatalog } from "./lib/features";
import { isDevAdminEmail } from "./lib/devAdmin";
import {
  buildHeroStreamingPreviews,
  mergePreviewForHero,
} from "./lib/heroImage";
import {
  buildContinueBrowseItems,
  buildCartoniHomeRow,
  buildUnifiedHomeRows,
  buildRandomHeroItems,
  enrichStreamingPreview,
  insertCartoniHomeRow,
  mergedSectionBrowseItems,
} from "./lib/unifiedBrowse";
import {
  browseDetailAction,
  similarBrowseItems,
} from "./lib/browseDetail";
import type { WatchPartySession } from "./types/watchParty";
import type { MangaBrowseItem } from "./types/mangadex";
import { getMangaProgress } from "./lib/mangaProgress";

const WatchPage = lazy(() =>
  import("./components/WatchPage").then((m) => ({ default: m.WatchPage })),
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
const FeedbackPage = lazy(() =>
  import("./components/FeedbackPage").then((m) => ({
    default: m.FeedbackPage,
  })),
);
const InviteFriendsPage = lazy(() =>
  import("./components/InviteFriendsPage").then((m) => ({
    default: m.InviteFriendsPage,
  })),
);
const ChatsPage = lazy(() =>
  import("./components/ChatsPage").then((m) => ({ default: m.ChatsPage })),
);
const StreamingPage = lazy(() =>
  import("./components/StreamingPage").then((m) => ({ default: m.StreamingPage })),
);
const AnimePage = lazy(() =>
  import("./components/AnimePage").then((m) => ({ default: m.AnimePage })),
);
const MangaPage = lazy(() =>
  import("./components/MangaPage").then((m) => ({ default: m.MangaPage })),
);
const MangaDetailPage = lazy(() =>
  import("./components/MangaDetailPage").then((m) => ({ default: m.MangaDetailPage })),
);
const MangaReaderPage = lazy(() =>
  import("./components/MangaReaderPage").then((m) => ({ default: m.MangaReaderPage })),
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
  const { profile: cloudProfile, user, signOut } = useCloudAccount();
  const { isGuest, guestLimitReached, logoutAccess } = useAppAccess();
  const { notify } = useNotifications();
  const devMode = isDevAdminEmail(cloudProfile?.email);
  usePresenceHeartbeat(Boolean(cloudProfile));
  const { pendingCount: pendingFriendRequests, refreshFriendAlerts } =
    useCloudFriendAlertsContext();
  const {
    library,
    loading,
    searchQuery,
    setSearchQuery,
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
  const [addonWatch, setAddonWatch] = useState<AddonWatchTarget | null>(null);
  const [detailSimilar, setDetailSimilar] = useState<BrowseItem[]>([]);
  const [partyGuestSession, setPartyGuestSession] = useState<WatchPartySession | null>(null);
  const [mangaDetail, setMangaDetail] = useState<MangaBrowseItem | null>(null);
  const [mangaReader, setMangaReader] = useState<{
    mangaId: string;
    chapterId: string;
    mangaTitle: string;
    initialPage?: number;
  } | null>(null);
  const [heroItems, setHeroItems] = useState<MediaItem[]>([]);
  const prevActiveNavRef = useRef(activeNav);
  const cartoniCatalogRefreshRef = useRef(false);
  const mainScrollRef = useRef<HTMLElement>(null);
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
    refreshCatalog,
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
      const added = await toggleStreaming(preview);
      const key = streamingListKey(preview);
      setHeroItems((items) =>
        items.map((item) => {
          const heroPreview = mediaItemToStreamingPreview(item);
          if (!heroPreview || streamingListKey(heroPreview) !== key) {
            return item;
          }
          return { ...item, isFavorite: added };
        }),
      );
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
    if (!isParent && (activeNav === "settings" || activeNav === "activity")) {
      setActiveNav("home");
    }
  }, [isParent, activeNav]);

  useEffect(() => {
    const openChats = () => {
      setSearchOpen(false);
      setActiveNav("chats");
    };
    window.addEventListener("branchefy:open-chat", openChats);
    return () => window.removeEventListener("branchefy:open-chat", openChats);
  }, []);

  const ensureGuestCanPlay = useCallback(() => {
    if (isGuest && guestLimitReached) {
      notify({
        kind: "info",
        title: "Limite ospite raggiunto",
        message:
          "Hai usato le 2 ore giornaliere. Registrati dalle Impostazioni per continuare.",
      });
      return false;
    }
    return true;
  }, [isGuest, guestLimitReached, notify]);

  const handleLogout = useCallback(async () => {
    if (user) {
      try {
        await signOut();
      } catch {
        // ignore cloud sign-out errors
      }
    }
    clearProfile();
    logoutAccess();
  }, [user, signOut, clearProfile, logoutAccess]);

  if (!activeProfile) return null;

  const handlePlay = (id: string) => {
    if (!ensureGuestCanPlay()) return;
    const target = parseStreamingMediaId(id);
    if (!target) return;
    if (!STREMIO_ADDONS_ENABLED && !isBuiltinStreamingCatalog(target.catalogPrefix)) {
      return;
    }
    setAddonWatch({
      ...target,
      videoId: target.videoId,
    });
  };

  const handlePlayNow = (id: string) => {
    if (!ensureGuestCanPlay()) return;
    const target = parseStreamingMediaId(id);
    if (!target) return;
    if (!STREMIO_ADDONS_ENABLED && !isBuiltinStreamingCatalog(target.catalogPrefix)) {
      return;
    }
    setAddonWatch({
      ...target,
      videoId: target.videoId,
    });
  };

  const handleBackFromWatch = async () => {
    setWatchingId(null);
    setWatchAutoplay(false);
    setDetailSimilar([]);
    await refresh();
    await refreshStreamingContinue();
  };

  const handleNav = (id: string) => {
    if (id === "invite") {
      setSeriesKey(null);
      setMangaDetail(null);
      setMangaReader(null);
      setSearchOpen(false);
      setSearchQuery("");
      setActiveNav("invite");
      return;
    }
    if ((id === "add" || id === "manage" || id === "settings" || id === "activity") && !isParent) return;
    if (id === "dev" && !devMode) return;
    setSeriesKey(null);
    setMangaDetail(null);
    setMangaReader(null);
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


  const handleOpenManga = useCallback((item: MangaBrowseItem) => {
    setMangaReader(null);
    setMangaDetail(item);
  }, []);

  const handleReadMangaChapter = useCallback(
    (mangaId: string, chapterId: string, _chapterLabel: string | null) => {
      const progress = getMangaProgress(activeProfile.id, mangaId);
      const initialPage =
        progress?.chapterId === chapterId ? progress.page : 0;
      setMangaReader({
        mangaId,
        chapterId,
        mangaTitle: mangaDetail?.title ?? "Manga",
        initialPage,
      });
    },
    [activeProfile.id, mangaDetail?.title],
  );

  const handleMangaReaderChapterChange = useCallback(
    (chapterId: string, initialPage = 0) => {
      setMangaReader((prev) =>
        prev ? { ...prev, chapterId, initialPage } : null,
      );
    },
    [],
  );


  useEffect(() => {
    if (!watchingId && !addonWatch) {
      void refreshStreamingContinue();
    }
  }, [watchingId, addonWatch, refreshStreamingContinue]);

  useEffect(() => {
    if (activeNav === "home" && activeProfile?.id) {
      void refreshStreamingContinue();
    }
  }, [activeNav, activeProfile?.id, refreshStreamingContinue]);

  useEffect(() => {
    if (!loading && activeProfile?.id) {
      void refreshStreamingContinue();
    }
  }, [loading, activeProfile?.id, refreshStreamingContinue]);

  const heroStreamingPreviews = useMemo(
    () =>
      buildHeroStreamingPreviews(
        streamingPreviews,
        catalogIndex,
        streamingRows,
      ),
    [streamingPreviews, catalogIndex, streamingRows],
  );

  useEffect(() => {
    const enteredHome =
      activeNav === "home" && prevActiveNavRef.current !== "home";
    prevActiveNavRef.current = activeNav;

    if (activeNav !== "home" || loading) return;
    if (heroStreamingPreviews.length === 0) {
      return;
    }

    setHeroItems((current) => {
      if (!enteredHome && current.length > 0) return current;
      return buildRandomHeroItems(
        [],
        heroStreamingPreviews,
        (preview) =>
          previewToMediaItem(
            enrichListedPreview(
              mergePreviewForHero(preview, catalogIndex),
            ),
          ),
        8,
      );
    });
  }, [
    activeNav,
    library?.items,
    heroStreamingPreviews,
    catalogIndex,
    enrichListedPreview,
    loading,
  ]);

  const myListCount = useMemo(
    () => streamingList.length,
    [streamingList.length],
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
    () => splitTop10Row(streamingRows, streamingPreviews),
    [streamingRows, streamingPreviews],
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

  const continueHomeRow = useMemo(() => {
    const items = buildContinueBrowseItems(
      library?.collections ?? [],
      streamingContinue,
      library?.items ?? [],
    );
    if (items.length === 0) return null;
    return {
      key: "continue",
      title: "Continua a guardare",
      subtitle: "Riprendi da dove eri rimasto · Locale e streaming",
      items: applyMyListToBrowseItems(items),
    };
  }, [
    library?.collections,
    library?.items,
    streamingContinue,
    applyMyListToBrowseItems,
  ]);

  const unifiedHomeRows = useMemo(() => {
    const rows = buildUnifiedHomeRows(
      library?.collections ?? [],
      streamingRowsWithoutTop10,
      streamingContinue,
      library?.items ?? [],
      streamingList.map(withMyListFlags),
      streamingPreviews,
      { mergeStreaming: true, includeContinue: false },
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

  const cartoniHomeRow = useMemo(() => {
    const localCartoni =
      library?.collections.find((collection) => collection.id === "cartoni")
        ?.items ??
      (library?.items ?? []).filter((item) => item.mediaType === "cartone");
    const row = buildCartoniHomeRow(
      localCartoni,
      streamingPreviews.map(withMyListFlags),
      streamingRowsWithoutTop10,
    );
    if (!row) return null;
    return {
      ...row,
      items: applyMyListToBrowseItems(row.items),
    };
  }, [
    library?.collections,
    library?.items,
    streamingPreviews,
    streamingRowsWithoutTop10,
    applyMyListToBrowseItems,
    withMyListFlags,
  ]);

  const homeCatalogRows = useMemo(() => {
    if (!cartoniHomeRow) return unifiedHomeRows;
    return insertCartoniHomeRow(
      unifiedHomeRows,
      cartoniHomeRow,
      isArchivioCartoniRow,
    );
  }, [unifiedHomeRows, cartoniHomeRow]);

  const homeContentReady = !loading;
  const homeStreamingPending =
    streamingLoading &&
    streamingRows.length === 0 &&
    catalogIndex.length === 0 &&
    unifiedHomeRows.length === 0 &&
    !cartoniHomeRow &&
    !continueHomeRow;

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
    if (continueHomeRow) {
      for (const item of continueHomeRow.items) push(item);
    }
    for (const row of homeCatalogRows) {
      for (const item of row.items) push(item);
    }
    return [...byId.values()];
  }, [sectionBrowseItems, continueHomeRow, homeCatalogRows]);

  const handleOpenBrowseDetail = useCallback(
    (browse: BrowseItem, pool?: BrowseItem[]) => {
      setDetailSimilar(similarBrowseItems(browse, pool ?? browsePool));
      const action = browseDetailAction(browse);
      if (!action) return;
      if (action.type === "watch") {
        if (!ensureGuestCanPlay()) return;
        setWatchAutoplay(false);
        setWatchingId(action.mediaId);
        return;
      }
      if (action.type === "series") {
        setSeriesKey(action.seriesKey);
        return;
      }
      if (!ensureGuestCanPlay()) return;
      setAddonWatch(action.target);
    },
    [browsePool, ensureGuestCanPlay],
  );

  const handleStartAddonWatch = useCallback(
    (target: AddonWatchTarget) => {
      if (!ensureGuestCanPlay()) return;
      setAddonWatch(target);
    },
    [ensureGuestCanPlay],
  );

  const handleOpenSeries = useCallback((key: string) => {
    setSeriesKey(key);
  }, []);

  useEffect(() => {
    if (activeNav !== "home" || !activeProfile?.id) return;
    const el = mainScrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }, [activeProfile?.id, activeNav]);

  useEffect(() => {
    if (activeNav !== "cartoni") {
      cartoniCatalogRefreshRef.current = false;
      return;
    }
    if (cartoniCatalogRefreshRef.current || syncingIndex) return;
    const loonexCount = streamingPreviews.filter(
      (preview) => preview.catalogPrefix === "loonex",
    ).length;
    if (loonexCount < 120) {
      cartoniCatalogRefreshRef.current = true;
      void refreshCatalog();
    }
  }, [activeNav, streamingPreviews, syncingIndex, refreshCatalog]);

  const handlePlayStreaming = (preview: StremioMetaPreview) => {
    if (!ensureGuestCanPlay()) return;
    if (!STREMIO_ADDONS_ENABLED && !isBuiltinStreamingCatalog(preview.catalogPrefix)) {
      return;
    }
    const target = previewToWatchTarget(preview);
    if (
      (target.catalogPrefix === "sc" ||
        target.catalogPrefix === "saturn" ||
        target.catalogPrefix === "loonex" ||
        target.catalogPrefix === "youtube") &&
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
          onToggleStreamingList={handleToggleStreamingList}
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

  const sectionInfo = sectionMeta[activeNav];

  return (
    <motion.div
      className="relative flex h-full min-h-0 flex-col bg-void"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="noise-overlay pointer-events-none fixed inset-0 z-0 opacity-[0.25]" />

      <AppTopNav
        activeId={searchOpen ? "search" : activeNav}
        profile={activeProfile}
        devMode={devMode}
        onNavigate={handleNav}
        badgeCounts={sidebarBadges}
        alertDots={sidebarAlertDots}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenSearch={handleOpenSearch}
        onCloseSearch={handleCloseSearch}
        searchActive={searchOpen}
        onSwitchProfile={clearProfile}
        onLogout={() => void handleLogout()}
        scrollContainerRef={mainScrollRef}
        immersive={
          activeNav === "home" && !seriesKey && !searchOpen
        }
      />

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <GuestUsageBanner onUpgrade={() => handleNav("settings")} />

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
          onToggleStreamingList={handleToggleStreamingList}
          enrichStreamingPreview={enrichListedPreview}
          />
        </SuspenseRoute>

        <main
          ref={mainScrollRef}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scroll-smooth"
        >
          {loading ? (
            <div className="flex h-full items-center justify-center pt-20">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-accent" />
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={seriesKey ?? activeNav}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              >
                {!(activeNav === "home" && !seriesKey) && (
                  <div
                    className="shrink-0"
                    style={{ height: "var(--app-nav-height)" }}
                    aria-hidden
                  />
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

                {!seriesKey && activeNav === "manga" && !mangaDetail && (
                  <SuspenseRoute>
                    <MangaPage
                      profileId={activeProfile.id}
                      onOpenManga={handleOpenManga}
                      allowAdult={isParent}
                    />
                  </SuspenseRoute>
                )}

                {!seriesKey && activeNav === "manga" && mangaDetail && !mangaReader && (
                  <SuspenseRoute>
                    <MangaDetailPage
                      mangaId={mangaDetail.id}
                      profileId={activeProfile.id}
                      initialItem={mangaDetail}
                      allowAdult={isParent}
                      onBack={() => setMangaDetail(null)}
                      onReadChapter={handleReadMangaChapter}
                    />
                  </SuspenseRoute>
                )}

                {!seriesKey && activeNav === "streaming" && STREMIO_ADDONS_ENABLED && (
                  <SuspenseRoute>
                    <StreamingPage
                    profileId={activeProfile.id}
                    onStartWatch={handleStartAddonWatch}
                    />
                  </SuspenseRoute>
                )}

                {!seriesKey && activeNav === "settings" && isParent && (
                  <SuspenseRoute>
                    <SettingsPage profileId={activeProfile.id} />
                  </SuspenseRoute>
                )}

                {!seriesKey && activeNav === "profile" && (
                  <ProfilePage
                    profile={activeProfile}
                    profileId={activeProfile.id}
                    activeTab={profileTab}
                    onTabChange={setProfileTab}
                    streamingList={streamingList}
                    streamingListKeys={streamingListKeys}
                    onPlayStreaming={handlePlayStreaming}
                    onToggleStreamingList={handleToggleStreamingList}
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

                {!seriesKey && activeNav === "feedback" && (
                  <SuspenseRoute>
                    <FeedbackPage
                      profile={activeProfile}
                      activeNav={activeNav}
                      onOpenSettings={
                        isParent ? () => setActiveNav("settings") : undefined
                      }
                    />
                  </SuspenseRoute>
                )}

                {!seriesKey && activeNav === "invite" && (
                  <SuspenseRoute>
                    <InviteFriendsPage
                      profileId={activeProfile.id}
                      onOpenFriends={() => {
                        setProfileTab("friends");
                        setActiveNav("profile");
                      }}
                    />
                  </SuspenseRoute>
                )}

                {!seriesKey && activeNav === "chats" && (
                  <SuspenseRoute>
                    <ChatsPage />
                  </SuspenseRoute>
                )}

                {!seriesKey && activeNav === "home" && (
                  <>
                    {!homeContentReady && !continueHomeRow ? (
                      <div className="pb-16">
                        <div className="h-[100svh] min-h-[560px] shimmer-bg" />
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
                    {heroItems.length > 0 && (
                      <HeroBanner
                        fullPage
                        items={heroItems}
                        scrollContainerRef={mainScrollRef}
                        onPlay={handlePlayNow}
                        onOpenDetail={handleOpenBrowseDetail}
                        onOpenSeries={(media) => {
                          if (media.seriesTitle) {
                            handleOpenSeries(
                              `${media.mediaType}::${media.seriesTitle}`,
                            );
                          }
                        }}
                        onToggleStreamingList={handleToggleStreamingList}
                      />
                    )}
                    <div className="relative bg-void">
                    {continueHomeRow && (
                      <div className="relative">
                        <MediaRow
                          key={continueHomeRow.key}
                          index="01"
                          title={continueHomeRow.title}
                          subtitle={continueHomeRow.subtitle}
                          items={continueHomeRow.items}
                          animateEntrance
                          onPlay={handlePlayNow}
                          onPlayStreaming={handlePlayStreaming}
                          onOpenSeries={handleOpenSeries}
                          onToggleStreamingList={handleToggleStreamingList}
                        />
                      </div>
                    )}
                    <StreamHubRow onNavigate={handleNav} />
                    <MangaPromoBanner onExplore={() => handleNav("manga")} />
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
                    {(homeCatalogRows.length > 0 || streamingError) && (
                      <div className="relative space-y-0.5 overflow-visible">
                        {homeCatalogRows.map((row, i) => (
                            <MediaRow
                              key={row.key}
                              index={String(i + 1).padStart(2, "0")}
                              title={row.title}
                              titleLogo={
                                isArchivioCartoniRow(row.key, row.title)
                                  ? ARCHIVIO_CARTONI_LOGO
                                  : undefined
                              }
                              subtitle={row.subtitle}
                              items={row.items}
                              animateEntrance
                              onPlay={handlePlayNow}
                              onPlayStreaming={handlePlayStreaming}
                              onOpenDetail={handleOpenBrowseDetail}
                              onOpenSeries={handleOpenSeries}
                              onToggleStreamingList={handleToggleStreamingList}
                              actionLabel={
                                row.key === "favorites"
                                  ? "Vedi tutto"
                                  : row.key === "home-cartoni"
                                    ? "Esplora"
                                    : undefined
                              }
                              onActionClick={
                                row.key === "favorites"
                                  ? () => {
                                      setProfileTab("list");
                                      setActiveNav("profile");
                                    }
                                  : row.key === "home-cartoni"
                                    ? () => handleNav("cartoni")
                                    : undefined
                              }
                            />
                          ))}
                      </div>
                    )}

                    {hasStreaming &&
                      streamingError &&
                      homeCatalogRows.length === 0 && (
                        <p className="page-px py-8 text-center text-[13px] text-text-muted">
                          {streamingError}
                        </p>
                      )}
                    </div>
                      </>
                    )}
                  </>
                )}

                {!seriesKey &&
                  activeNav === "cartoni" && (
                  <SuspenseRoute>
                    <CartoniBrowsePage
                      title={sectionInfo?.title ?? "Cartoni"}
                      subtitle={sectionBrowseSubtitle}
                      syncing={syncingIndex}
                      loading={streamingLoading && sectionBrowseItems.length === 0}
                      items={sectionBrowseItems}
                      onPlay={handlePlayNow}
                      onPlayStreaming={handlePlayStreaming}
                      onOpenDetail={handleOpenBrowseDetail}
                      onOpenSeries={handleOpenSeries}
                      onRefreshCatalog={() => void refreshCatalog()}
                    />
                  </SuspenseRoute>
                )}

                {!seriesKey &&
                  activeNav !== "home" &&
                  activeNav !== "anime" &&
                  activeNav !== "manga" &&
                  activeNav !== "cartoni" &&
                  activeNav !== "profile" &&
                  activeNav !== "add" &&
                  activeNav !== "manage" &&
                  activeNav !== "settings" &&
                  activeNav !== "streaming" &&
                  activeNav !== "activity" &&
                  activeNav !== "dev" &&
                  activeNav !== "feedback" &&
                  activeNav !== "invite" &&
                  activeNav !== "chats" && (
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
                    onToggleStreamingList={handleToggleStreamingList}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>

      {mangaReader && (
        <SuspenseRoute>
          <MangaReaderPage
            mangaId={mangaReader.mangaId}
            chapterId={mangaReader.chapterId}
            mangaTitle={mangaReader.mangaTitle}
            profileId={activeProfile.id}
            initialPage={mangaReader.initialPage}
            allowAdult={isParent}
            onBack={() => setMangaReader(null)}
            onChapterChange={handleMangaReaderChapterChange}
          />
        </SuspenseRoute>
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
    profiles,
    loading: profilesLoading,
  } = useProfile();
  const { setupComplete, loading: accessLoading, syncFromStorage } = useAppAccess();

  useEffect(() => {
    void prefetchBootCatalog().finally(() => setCatalogReady(true));
  }, []);

  useEffect(() => {
    if (!profilesLoading && profiles.length > 0) {
      tryGrandfatherExistingInstall(true);
      syncFromStorage();
    }
  }, [profilesLoading, profiles.length, syncFromStorage]);

  const bootDone = bootPhase === "done";
  const gateReady = !profilesLoading && !accessLoading;
  const showAccess =
    gateReady &&
    bootDone &&
    !activeProfile &&
    !pendingProfile &&
    !setupComplete;
  const showProfileSelect =
    gateReady &&
    bootDone &&
    !activeProfile &&
    !pendingProfile &&
    !showAccess;

  return (
    <>
      <AppAccessBootstrap />
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

      {showAccess && <AppAccessScreen />}

      {showProfileSelect && <ProfileSelectScreen />}

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
                <ChatMessageAlertsProvider>
                  <AppContent />
                </ChatMessageAlertsProvider>
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
      <AppAccessProvider>
        <NotificationProvider>
          <ProfileProvider>
            <PreviewAudioProvider>
              <AppGate />
            </PreviewAudioProvider>
          </ProfileProvider>
        </NotificationProvider>
      </AppAccessProvider>
    </CloudAccountProvider>
  );
}

export default App;
