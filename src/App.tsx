import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense, startTransition, type ReactNode } from "react";
import { useStreamingSearch } from "./lib/useStreamingSearch";
import { LoadingScreen } from "./components/LoadingScreen";
import {
  getBootCatalogCache,
  hasUsableCatalog,
  waitForUsableBootCatalog,
} from "./lib/bootCatalog";
import { prefetchBootFriends } from "./lib/bootFriends";
import { useDevBackendGate } from "./lib/devBackendGate";
import { DevBackendOfflineScreen } from "./components/DevBackendOfflineScreen";
import { ProfileSelectScreen } from "./components/ProfileSelectScreen";
import { AppTopNav } from "./components/AppTopNav";
import { AppMobileNavBar } from "./components/AppMobileNavBar";
import { LiquidBackground } from "./components/LiquidBackground";
import { HomeHeroBackdrop } from "./components/HomeHeroBackdrop";
import { BrowseAmbientSetup } from "./components/BrowseAmbientSetup";
import { HeroAmbientProvider, useHeroAmbientControls } from "./context/HeroAmbientContext";
import { HomeKeepAliveView } from "./components/HomeKeepAliveView";
import { SectionBrowsePage } from "./components/SectionBrowsePage";
import { CartoniBrowsePage } from "./components/CartoniBrowsePage";
import { ProfilePage, type ProfileTab } from "./components/ProfilePage";
import { FriendProfilePage } from "./components/FriendProfilePage";
import type { FriendProfileTarget } from "./components/chat/FriendProfileSheet";
import { AppUpdaterProvider } from "./context/AppUpdaterContext";
import { WebEssentialUpdateBanner } from "./components/WebEssentialUpdateBanner";
import { GlobalBroadcastModal } from "./components/GlobalBroadcastModal";
import { ProfilePinModal } from "./components/ProfilePinModal";
import { LibraryProvider, useLibrary } from "./context/LibraryContext";
import { AddonsProvider, useAddons } from "./context/AddonsContext";
import { CloudAccountProvider, useCloudAccount } from "./context/CloudAccountContext";
import { PosterQualityProvider } from "./context/PosterQualityContext";
import { usePresenceHeartbeat } from "./hooks/useFriendPresence";
import { NotificationProvider, useNotifications } from "./context/NotificationContext";
import { CloudFriendAlertsProvider, useCloudFriendAlertsContext } from "./context/CloudFriendAlertsContext";
import { ChatMessageAlertsProvider } from "./context/ChatMessageAlertsContext";
import { ChatPopupProvider } from "./context/ChatPopupContext";
import { FriendsMenuProvider } from "./context/FriendsMenuContext";
import { MobileDeviceProvider, useCompactShell } from "./context/MobileDeviceContext";
import { IS_TAURI_SHELL } from "./lib/tauriShell";
import { homePlatformPromoVariant } from "./lib/platformPromo";
import { ProfileProvider, useProfile } from "./context/ProfileContext";
import {
  AppAccessProvider,
  useAppAccess,
} from "./context/AppAccessContext";
import { tryGrandfatherExistingInstall } from "./lib/appAccess";
import { isWebShell } from "./lib/runtimeInvoke";
import { AppAccessBootstrap, AppAccessScreen } from "./components/AppAccessScreen";
import { EmailConfirmedPage } from "./components/EmailConfirmedPage";
import { WebAppInstallPage } from "./components/WebAppInstallPage";
import { isEmailConfirmedPath } from "./lib/authRoutes";
import { isWebAppInstallPath } from "./lib/webAppRoutes";
import { GuestUsageWidget } from "./components/GuestUsageWidget";
import { GuestHotSinglesToast } from "./components/GuestHotSinglesToast";
import { GuestLimitBlockedScreen } from "./components/GuestLimitBlockedScreen";
import { PreviewAudioProvider } from "./context/PreviewAudioContext";
import {
  isArchivioCartoniRow,
} from "./lib/brandAssets";
import { sectionMeta } from "./data/nav";
import { pathForNav, parseLocationPath } from "./lib/webUrlSync";
import type { BrowseItem } from "./lib/browse";
import type { MediaItem } from "./types/media";
import type { StremioMetaPreview } from "./types/stremio";
import type { AddonWatchTarget } from "./lib/streamingBrowse";
import {
  parseStreamingMediaId,
  previewToMediaItem,
  previewToWatchTarget,
  dedupeStreamingPreviews,
} from "./lib/streamingBrowse";
import { useStreamingCatalogs } from "./lib/useStreamingCatalogs";
import { useMyList } from "./lib/useMyList";
import { markStreamingInMyList, mediaItemToStreamingPreview, streamingListKey } from "./lib/myList";
import { splitTop10Row } from "./lib/streamingRows";
import { STREMIO_ADDONS_ENABLED, isBuiltinStreamingCatalog } from "./lib/features";
import { isDevAdminEmail } from "./lib/devAdmin";
import {
  buildHeroStreamingPreviews,
  enrichHeroPreviewsWithLogos,
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
import { useWatchPartyInviteAlerts } from "./hooks/useWatchPartyInviteAlerts";
import { WatchPartyHostProvider } from "./context/WatchPartyHostContext";
import { joinCloudWatchParty } from "./lib/cloudWatchParty";
import { ensureWatchPartyChat } from "./lib/cloudChat";
import type { WatchPartySession } from "./types/watchParty";
import type { MangaBrowseItem } from "./types/mangadex";
import type { WelibBook } from "./types/welib";
import { FRIEND_REQUESTS_EVENT } from "./lib/friendRequestsNavigation";
import {
  consumePendingWatchPartyInvite,
  WATCH_PARTY_JOIN_EVENT,
} from "./lib/watchPartyInviteNavigation";
import { guestSessionFromInvitePayload } from "./lib/watchPartyInviteChatMessage";
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
const BooksPage = lazy(() =>
  import("./components/BooksPage").then((m) => ({ default: m.BooksPage })),
);
const BookDetailPage = lazy(() =>
  import("./components/BookDetailPage").then((m) => ({ default: m.BookDetailPage })),
);
const BookReaderPage = lazy(() =>
  import("./components/BookReaderPage").then((m) => ({ default: m.BookReaderPage })),
);
const SearchOverlay = lazy(() =>
  import("./components/SearchOverlay").then((m) => ({ default: m.SearchOverlay })),
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

const APP_FRAME_CLASS =
  "relative flex h-full min-h-0 flex-col lordflix-shell lordflix-app-frame";

function AppFrame({ children }: { children: ReactNode }) {
  return <div className={APP_FRAME_CLASS}>{children}</div>;
}

function RouteFrame({
  children,
}: {
  routeKey?: string;
  children: ReactNode;
}) {
  // Niente remount su cambio sezione: HomeKeepAliveSlot deve restare nel DOM
  // (web e desktop) cosi' scroll/ritorno home restano istantanei.
  return <>{children}</>;
}

/** Spegne backdrop hero fuori home (e sotto overlay watch). */
function TauriHeroAmbientBridge({
  activeNav,
  seriesKey,
  overlayOpen,
}: {
  activeNav: string;
  seriesKey: string | null;
  overlayOpen: boolean;
}) {
  const { setActive, setBackdropUrl } = useHeroAmbientControls();

  useEffect(() => {
    if (!IS_TAURI_SHELL) return;
    const onHome = activeNav === "home" && !seriesKey && !overlayOpen;
    if (onHome) {
      setActive(true);
      return;
    }
    setActive(false);
    setBackdropUrl(null);
  }, [activeNav, seriesKey, overlayOpen, setActive, setBackdropUrl]);

  return null;
}

function seedHeroItemsFromBoot(): MediaItem[] {
  const boot = getBootCatalogCache();
  if (!hasUsableCatalog(boot)) return [];
  const previews = buildHeroStreamingPreviews(
    boot!.index,
    boot!.index,
    boot!.rows,
  );
  if (previews.length === 0) return [];
  return buildRandomHeroItems(
    [],
    previews,
    (preview) =>
      previewToMediaItem(
        enrichStreamingPreview(mergePreviewForHero(preview, boot!.index)),
      ),
    8,
  );
}

function AppContent({
  onHomeReady,
  deferAmbient = false,
}: {
  onHomeReady?: () => void;
  /** Evita un secondo WebGL sotto il boot loader (altrimenti l'aurora si congela). */
  deferAmbient?: boolean;
}) {
  const { isCompactShell } = useCompactShell();
  const platformPromoVariant = homePlatformPromoVariant(isCompactShell);
  const { activeProfile, clearProfile, isParent } = useProfile();
  const { profile: cloudProfile, user, signOut } = useCloudAccount();
  const { isGuest, guestAccessBlocked, logoutAccess } = useAppAccess();
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

  const [activeNav, setActiveNav] = useState(() => {
    if (!isWebShell()) return "home";
    const parsed = parseLocationPath(window.location.pathname);
    return parsed && !parsed.title ? parsed.activeNav : "home";
  });
  const [profileTab, setProfileTab] = useState<ProfileTab>("watched");
  const [searchOpen, setSearchOpen] = useState(false);
  const [watchingId, setWatchingId] = useState<string | null>(null);
  const [watchAutoplay, setWatchAutoplay] = useState(false);
  const [seriesKey, setSeriesKey] = useState<string | null>(null);
  const [addonWatch, setAddonWatch] = useState<AddonWatchTarget | null>(() => {
    if (!isWebShell()) return null;
    return parseLocationPath(window.location.pathname)?.title ?? null;
  });
  const [detailSimilar, setDetailSimilar] = useState<BrowseItem[]>([]);
  const [partyGuestSession, setPartyGuestSession] = useState<WatchPartySession | null>(null);
  const [friendProfile, setFriendProfile] = useState<FriendProfileTarget | null>(null);
  const handleJoinWatchPartyFromInvite = useCallback(
    async (session: WatchPartySession) => {
      if (session.relay === "cloud") {
        try {
          const room = await joinCloudWatchParty(session.room.code);
          if (!room) {
            notify({
              kind: "info",
              title: "Stanza non trovata",
              message:
                "La stanza potrebbe essere chiusa. Chiedi un nuovo invito all'host.",
            });
            return;
          }
          try {
            await ensureWatchPartyChat(room.code);
          } catch {
            // join ok anche senza chat immediata
          }
          setPartyGuestSession({ role: "guest", room, relay: "cloud" });
          return;
        } catch (err) {
          notify({
            kind: "info",
            title: "Impossibile unirsi",
            message: err instanceof Error ? err.message : String(err),
          });
          return;
        }
      }
      setPartyGuestSession(session);
    },
    [notify],
  );

  useWatchPartyInviteAlerts(handleJoinWatchPartyFromInvite);
  const [mangaDetail, setMangaDetail] = useState<MangaBrowseItem | null>(null);
  const [mangaReader, setMangaReader] = useState<{
    mangaId: string;
    chapterId: string;
    mangaTitle: string;
    initialPage?: number;
  } | null>(null);
  const [bookDetail, setBookDetail] = useState<WelibBook | null>(null);
  const [bookReader, setBookReader] = useState<{
    book: WelibBook;
    kind: "read" | "listen";
  } | null>(null);
  const [heroItems, setHeroItems] = useState<MediaItem[]>(seedHeroItemsFromBoot);
  const homeReadyReportedRef = useRef(false);
  const prevActiveNavRef = useRef(activeNav);
  const firstUrlSyncRef = useRef(true);
  const homeEntranceDoneRef = useRef(false);
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
    didYouMean: scSearchDidYouMean,
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
    if (activeNav !== "home") return;
    // Dopo la prima visita, niente stagger al rientro (costa frame).
    const timer = window.setTimeout(() => {
      homeEntranceDoneRef.current = true;
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [activeNav]);

  // Deep link web: riflette "sezione + titolo aperto" nell'URL. Il primo giro
  // normalizza il path (replaceState, niente entry in cronologia); i successivi
  // usano pushState così il tasto Indietro del browser funziona. Solo web app.
  useEffect(() => {
    if (!isWebShell()) return;
    const desired = pathForNav(activeNav, addonWatch);
    if (desired == null) return;
    const current = window.location.pathname;
    if (desired !== current) {
      if (firstUrlSyncRef.current) {
        window.history.replaceState(window.history.state, "", desired);
      } else {
        window.history.pushState(window.history.state, "", desired);
      }
    }
    firstUrlSyncRef.current = false;
  }, [activeNav, addonWatch]);

  // Indietro/Avanti del browser: ricostruisce la vista dal path e chiude gli
  // overlay non rappresentati nell'URL, così si torna sempre a uno stato pulito.
  useEffect(() => {
    if (!isWebShell()) return;
    const onPopState = () => {
      const parsed = parseLocationPath(window.location.pathname);
      if (!parsed) return;
      setSearchOpen(false);
      setSearchQuery("");
      setSeriesKey(null);
      setMangaDetail(null);
      setMangaReader(null);
      setBookDetail(null);
      setBookReader(null);
      setWatchingId(null);
      setFriendProfile(null);
      if (parsed.title) {
        setAddonWatch(parsed.title);
      } else {
        setAddonWatch(null);
        setActiveNav(parsed.activeNav);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const openChats = () => {
      setSearchOpen(false);
      setActiveNav("chats");
    };
    const openFriendRequests = () => {
      setSeriesKey(null);
      setMangaDetail(null);
      setMangaReader(null);
      setBookDetail(null);
      setBookReader(null);
      setSearchOpen(false);
      setSearchQuery("");
      setProfileTab("friends");
      setActiveNav("profile");
    };
    const joinWatchPartyFromChat = () => {
      const payload = consumePendingWatchPartyInvite();
      if (!payload) return;
      void handleJoinWatchPartyFromInvite(guestSessionFromInvitePayload(payload));
    };
    window.addEventListener("branchefy:open-chat", openChats);
    window.addEventListener(FRIEND_REQUESTS_EVENT, openFriendRequests);
    window.addEventListener(WATCH_PARTY_JOIN_EVENT, joinWatchPartyFromChat);
    return () => {
      window.removeEventListener("branchefy:open-chat", openChats);
      window.removeEventListener(FRIEND_REQUESTS_EVENT, openFriendRequests);
      window.removeEventListener(WATCH_PARTY_JOIN_EVENT, joinWatchPartyFromChat);
    };
  }, [handleJoinWatchPartyFromInvite]);

  const handleGuestRegister = useCallback(() => {
    clearProfile();
    logoutAccess();
  }, [clearProfile, logoutAccess]);

  const ensureGuestCanPlay = useCallback(() => {
    if (isGuest && guestAccessBlocked) {
      notify({
        kind: "info",
        title: "Tempo ospite esaurito",
        message:
          "Hai finito l'ora di prova. Crea un account per continuare subito.",
      });
      return false;
    }
    return true;
  }, [isGuest, guestAccessBlocked, notify]);

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

  const handlePlay = useCallback((id: string) => {
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
  }, [ensureGuestCanPlay]);

  const handlePlayNow = useCallback((id: string) => {
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
  }, [ensureGuestCanPlay]);

  const handleBackFromWatch = useCallback(() => {
    setWatchingId(null);
    setWatchAutoplay(false);
    setDetailSimilar([]);
    void refresh();
    void refreshStreamingContinue();
  }, [refresh, refreshStreamingContinue]);

  const handleNav = (id: string) => {
    if (id === "invite") {
      setSeriesKey(null);
      setMangaDetail(null);
      setMangaReader(null);
      setBookDetail(null);
      setBookReader(null);
      setSearchOpen(false);
      setSearchQuery("");
      startTransition(() => setActiveNav("invite"));
      return;
    }
    if ((id === "add" || id === "manage" || id === "settings" || id === "activity") && !isParent) return;
    if (id === "dev" && !devMode) return;
    setSeriesKey(null);
    setMangaDetail(null);
    setMangaReader(null);
    setBookDetail(null);
    setBookReader(null);
    if (id === "mylist") {
      setProfileTab("list");
      setSearchOpen(false);
      setSearchQuery("");
      startTransition(() => setActiveNav("profile"));
      return;
    }
    if (id === "friends") {
      setProfileTab("friends");
      setSearchOpen(false);
      setSearchQuery("");
      startTransition(() => setActiveNav("profile"));
      return;
    }
    if (id === "profile") {
      setProfileTab("watched");
    }
    if (id === "search") {
      setSearchOpen(true);
      startTransition(() => setActiveNav("search"));
      return;
    }
    setSearchOpen(false);
    setSearchQuery("");
    startTransition(() => setActiveNav(id));
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

  const handleOpenBook = useCallback((item: WelibBook) => {
    setBookReader(null);
    setBookDetail(item);
  }, []);

  const handleReadBook = useCallback((item: WelibBook) => {
    setBookReader({ book: item, kind: "read" });
  }, []);

  const handleListenBook = useCallback((item: WelibBook) => {
    setBookReader({ book: item, kind: "listen" });
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


  const continueRefreshScheduledRef = useRef(false);
  const scheduleContinueRefresh = useCallback(() => {
    if (continueRefreshScheduledRef.current) return;
    continueRefreshScheduledRef.current = true;
    queueMicrotask(() => {
      continueRefreshScheduledRef.current = false;
      void refreshStreamingContinue();
    });
  }, [refreshStreamingContinue]);

  useEffect(() => {
    if (!watchingId && !addonWatch) {
      scheduleContinueRefresh();
    }
  }, [watchingId, addonWatch, scheduleContinueRefresh]);

  useEffect(() => {
    if (activeNav !== "home" || !activeProfile?.id) return;
    // Dopo il paint del rientro: evita continue+re-render nello stesso frame.
    const timer = window.setTimeout(() => {
      scheduleContinueRefresh();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [activeNav, activeProfile?.id, scheduleContinueRefresh]);

  useEffect(() => {
    if (!loading && activeProfile?.id) {
      scheduleContinueRefresh();
    }
  }, [loading, activeProfile?.id, scheduleContinueRefresh]);

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
    prevActiveNavRef.current = activeNav;

    if (activeNav !== "home") return;
    if (heroStreamingPreviews.length === 0) return;

    let cancelled = false;

    const toHeroMedia = (preview: StremioMetaPreview) =>
      previewToMediaItem(
        enrichListedPreview(mergePreviewForHero(preview, catalogIndex)),
      );

    // Non ricostruire l'hero se e' gia' pronto (rientro sezione = freeze).
    setHeroItems((current) => {
      if (current.length > 0) return current;
      return buildRandomHeroItems(
        [],
        heroStreamingPreviews,
        toHeroMedia,
        8,
      );
    });

    // Arricchimento logo solo se l'hero e' ancora "povero" (niente background).
    void (async () => {
      await new Promise((r) => window.setTimeout(r, 80));
      if (cancelled) return;

      const pool = await enrichHeroPreviewsWithLogos(heroStreamingPreviews);
      if (cancelled || pool.length === 0) return;
      setHeroItems((current) => {
        if (current.length === 0) {
          return buildRandomHeroItems([], pool, toHeroMedia, 8);
        }
        // Gia' arricchito in un giro precedente: non reshuffle al rientro.
        if (current.some((item) => item.backgroundUrl || item.logoUrl)) {
          return current;
        }
        return buildRandomHeroItems([], pool, toHeroMedia, 8);
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeNav,
    library?.items,
    heroStreamingPreviews,
    catalogIndex,
    enrichListedPreview,
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
    () => splitTop10Row(streamingRows, catalogIndex),
    [streamingRows, catalogIndex],
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
    if (isGuest) return null;
    const posterCatalog = dedupeStreamingPreviews([
      ...catalogIndex,
      ...streamingRows.flatMap((row) => row.items),
    ]);
    const items = buildContinueBrowseItems(
      library?.collections ?? [],
      streamingContinue,
      library?.items ?? [],
      posterCatalog,
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
    catalogIndex,
    streamingRows,
    applyMyListToBrowseItems,
    isGuest,
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

  const homeCatalogRowsBeforeManga = useMemo(() => {
    const rows = homeCatalogRows;
    if (rows.length === 0) return rows;
    const splitAt = Math.min(
      rows.length,
      Math.max(3, Math.ceil(rows.length * 0.55)),
    );
    return rows.slice(0, splitAt);
  }, [homeCatalogRows]);

  const homeCatalogRowsAfterManga = useMemo(() => {
    const rows = homeCatalogRows;
    if (rows.length === 0) return rows;
    const splitAt = Math.min(
      rows.length,
      Math.max(3, Math.ceil(rows.length * 0.55)),
    );
    return rows.slice(splitAt);
  }, [homeCatalogRows]);

  const homeStreamingPending =
    streamingLoading &&
    streamingRows.length === 0 &&
    catalogIndex.length === 0 &&
    unifiedHomeRows.length === 0 &&
    !cartoniHomeRow &&
    !continueHomeRow;

  /** Home davvero usabile: hero + almeno due slider, niente skeleton di pending. */
  const homeSurfaceReady =
    !homeStreamingPending &&
    heroItems.length > 0 &&
    homeCatalogRows.length >= 2 &&
    streamingRows.length > 0;

  useEffect(() => {
    if (!homeSurfaceReady || homeReadyReportedRef.current) return;
    let cancelled = false;
    let settleTimer = 0;
    const start = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (cancelled) return;
        // Lascia partire il primo paint delle card prima di togliere il loader.
        settleTimer = window.setTimeout(() => {
          if (cancelled || homeReadyReportedRef.current) return;
          homeReadyReportedRef.current = true;
          onHomeReady?.();
        }, 500);
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(start);
      if (settleTimer) window.clearTimeout(settleTimer);
    };
  }, [homeSurfaceReady, onHomeReady]);

  // Fallback: non lasciare l'utente bloccato sul loader se il catalogo fallisce.
  useEffect(() => {
    if (homeReadyReportedRef.current) return;
    const timer = window.setTimeout(() => {
      if (homeReadyReportedRef.current) return;
      homeReadyReportedRef.current = true;
      onHomeReady?.();
    }, 16_000);
    return () => window.clearTimeout(timer);
  }, [onHomeReady]);

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
    if (activeNav === "film" || activeNav === "serie") return base;
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
    if (!IS_TAURI_SHELL) return;
    const el = mainScrollRef.current;
    if (el) el.scrollTop = 0;
  }, [activeNav, seriesKey]);

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

  const handlePlayStreaming = useCallback((preview: StremioMetaPreview) => {
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
  }, [ensureGuestCanPlay]);

  const watchOverlayOpen = Boolean(
    partyGuestSession || addonWatch || watchingId || friendProfile,
  );
  const homeAnimateEntrance = !homeEntranceDoneRef.current;

  const sectionInfo = sectionMeta[activeNav];

  return (
    <FriendsMenuProvider
      profileId={activeProfile.id}
      profileName={activeProfile.name}
      onNavigate={handleNav}
      onJoinWatchParty={(session) => {
        setPartyGuestSession(session);
      }}
    >
    <HeroAmbientProvider>
    <TauriHeroAmbientBridge
      activeNav={activeNav}
      seriesKey={seriesKey}
      overlayOpen={watchOverlayOpen}
    />
    <AppFrame>
      <BrowseAmbientSetup activeNav={activeNav} seriesKey={seriesKey} />
      {!deferAmbient && <LiquidBackground />}
      <HomeHeroBackdrop />
      <div className="noise-overlay pointer-events-none fixed inset-0 z-[2] opacity-[0.04]" />

      {/* Shell resta montata sotto gli overlay watch: ritorno istantaneo. */}
      <div
        className={watchOverlayOpen ? "pointer-events-none invisible" : undefined}
        aria-hidden={watchOverlayOpen || undefined}
      >
      <AppTopNav
        activeId={searchOpen ? "search" : activeNav}
        profile={activeProfile}
        devMode={devMode}
        onNavigate={handleNav}
        badgeCounts={sidebarBadges}
        alertDots={sidebarAlertDots}
        profileFriendAlertCount={pendingFriendRequests}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenSearch={handleOpenSearch}
        onCloseSearch={handleCloseSearch}
        searchActive={searchOpen}
        onSwitchProfile={() => {
          if (isGuest) handleGuestRegister();
          else clearProfile();
        }}
        onLogout={() => void handleLogout()}
      />
      </div>

      <AppMobileNavBar
        activeId={searchOpen ? "search" : activeNav}
        profile={activeProfile}
        devMode={devMode}
        onNavigate={handleNav}
        onOpenSearch={handleOpenSearch}
        hidden={searchOpen || watchOverlayOpen}
      />

      <div
        className={`relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${
          watchOverlayOpen ? "invisible pointer-events-none" : ""
        }`}
        aria-hidden={watchOverlayOpen || undefined}
      >
        <GuestUsageWidget onRegister={handleGuestRegister} />
        {isGuest && guestAccessBlocked && (
          <GuestLimitBlockedScreen onRegister={handleGuestRegister} />
        )}

        <SuspenseRoute>
          <SearchOverlay
          open={searchOpen}
          query={searchQuery}
          onClose={handleCloseSearch}
          localResults={searchResults}
          streamingResults={scSearchResults}
          streamingTotal={scSearchTotal}
          suggestions={searchSuggestions}
          didYouMean={scSearchDidYouMean}
          onApplySuggestion={(suggestion) => {
            setSearchQuery(suggestion.name);
          }}
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
          className={`lf-main-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden max-md:pb-[var(--mobile-nav-height)] ${
            searchOpen ? "invisible pointer-events-none" : ""
          } ${
            activeNav === "home" && !seriesKey ? "lf-home-scroll" : ""
          } ${
            (activeNav === "film" || activeNav === "serie") && !seriesKey
              ? "lf-section-scroll"
              : ""
          }`}
        >
          <RouteFrame routeKey={seriesKey ?? activeNav}>
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
                    streamingRows={streamingRows}
                    continueItems={streamingContinue}
                    myListPreviews={streamingList}
                    catalogIndex={catalogIndex}
                    onPlay={handlePlayNow}
                    onPlayStreaming={handlePlayStreaming}
                    onOpenDetail={handleOpenBrowseDetail}
                    onToggleStreamingList={handleToggleStreamingList}
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

                {!seriesKey && activeNav === "libri" && !bookDetail && (
                  <SuspenseRoute>
                    <BooksPage onOpenBook={handleOpenBook} />
                  </SuspenseRoute>
                )}

                {!seriesKey && activeNav === "libri" && bookDetail && !bookReader && (
                  <SuspenseRoute>
                    <BookDetailPage
                      book={bookDetail}
                      onBack={() => setBookDetail(null)}
                      onRead={handleReadBook}
                      onListen={handleListenBook}
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
                  <div className={IS_TAURI_SHELL ? "relative z-[3]" : undefined}>
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
                      onOpenFriendProfile={setFriendProfile}
                      pendingFriendRequests={pendingFriendRequests}
                    />
                  </div>
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

                {!seriesKey && (
                  <HomeKeepAliveView
                    show={activeNav === "home"}
                    heroItems={heroItems}
                    homeStreamingPending={homeStreamingPending}
                    continueHomeRow={continueHomeRow}
                    top10Row={top10Row}
                    homeCatalogRows={homeCatalogRows}
                    homeCatalogRowsBeforeManga={homeCatalogRowsBeforeManga}
                    homeCatalogRowsAfterManga={homeCatalogRowsAfterManga}
                    streamingError={streamingError}
                    hasStreaming={hasStreaming}
                    platformPromoVariant={platformPromoVariant}
                    animateEntrance={homeAnimateEntrance}
                    scrollContainerRef={mainScrollRef}
                    onPlay={handlePlayNow}
                    onPlayStreaming={handlePlayStreaming}
                    onOpenDetail={handleOpenBrowseDetail}
                    onOpenSeries={handleOpenSeries}
                    onToggleStreamingList={handleToggleStreamingList}
                    onOpenMyList={() => {
                      setProfileTab("list");
                      startTransition(() => setActiveNav("profile"));
                    }}
                    onOpenCartoni={() => handleNav("cartoni")}
                    onOpenManga={() => handleNav("manga")}
                  />
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
                  activeNav !== "libri" &&
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
                    streamingRows={streamingRowsWithoutTop10}
                    catalogIndex={catalogIndex}
                    onPlay={handlePlayNow}
                    onPlayStreaming={handlePlayStreaming}
                    onOpenDetail={handleOpenBrowseDetail}
                    onOpenSeries={handleOpenSeries}
                    onToggleStreamingList={handleToggleStreamingList}
                  />
                )}
            </RouteFrame>
        </main>
      </div>

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
              profileId={activeProfile.id}
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
            profileId={activeProfile.id}
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
    </AppFrame>
    </HeroAmbientProvider>
    </FriendsMenuProvider>
  );
}

function AppGate() {
  const [bootPhase, setBootPhase] = useState<"intro" | "preparing" | "done">("intro");
  const [catalogReady, setCatalogReady] = useState(false);
  const [homeReady, setHomeReady] = useState(false);
  const { profile: cloudProfile } = useCloudAccount();
  const {
    activeProfile,
    pendingProfile,
    completePinUnlock,
    cancelPinUnlock,
    verifyPin,
    profiles,
    loading: profilesLoading,
    enterGuestSession,
  } = useProfile();
  const { setupComplete, loading: accessLoading, syncFromStorage, mode, isGuest } = useAppAccess();
  const { backendOnline, checking, checkBackend } = useDevBackendGate();

  useEffect(() => {
    void checkBackend();
  }, [checkBackend]);

  useEffect(() => {
    let cancelled = false;
    void waitForUsableBootCatalog().finally(() => {
      if (!cancelled) setCatalogReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!cloudProfile) return;
    void prefetchBootFriends();
  }, [cloudProfile]);

  useEffect(() => {
    setHomeReady(false);
  }, [activeProfile?.id]);

  useEffect(() => {
    if (!isWebShell() && !profilesLoading && profiles.length > 0) {
      tryGrandfatherExistingInstall(true);
      syncFromStorage();
    }
  }, [profilesLoading, profiles.length, syncFromStorage]);

  const bootDone = bootPhase === "done";
  const guestAutoPath = setupComplete && mode === "guest";

  // Guest: entra in sessione già in preparing, così la home può idratarsi sotto il loader.
  useEffect(() => {
    if (bootPhase !== "preparing") return;
    if (!guestAutoPath) return;
    if (activeProfile || pendingProfile) return;
    enterGuestSession();
  }, [
    bootPhase,
    guestAutoPath,
    activeProfile,
    pendingProfile,
    enterGuestSession,
  ]);

  // Path classico guest dopo boot (fallback).
  useEffect(() => {
    if (!bootDone || !guestAutoPath) return;
    if (!activeProfile && !pendingProfile) {
      enterGuestSession();
    }
  }, [bootDone, guestAutoPath, activeProfile, pendingProfile, enterGuestSession]);

  /**
   * Dopo l'intro:
   * - guest: resta in preparing finché catalogo + homepage sono pronti
   * - altrimenti: sblocca al catalogo usabile (poi profile select)
   */
  const bootUnlockReady =
    catalogReady &&
    (guestAutoPath ? Boolean(activeProfile) && homeReady : true);

  /** Loader visibile finché non c'è una home pronta dietro (guest o post-profilo). */
  const awaitingHome = Boolean(activeProfile) && !homeReady;
  const showBootLoader = !bootDone || awaitingHome;

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
    !showAccess &&
    mode !== "guest";

  const handleHomeReady = useCallback(() => {
    setHomeReady(true);
  }, []);

  if (bootDone && backendOnline === false) {
    return (
      <>
        <AppAccessBootstrap />
        <DevBackendOfflineScreen
          checking={checking}
          onRetry={() => void checkBackend()}
        />
      </>
    );
  }

  const mountAppShell =
    Boolean(activeProfile) &&
    (bootDone || (bootPhase === "preparing" && guestAutoPath));

  return (
    <>
      <AppAccessBootstrap />
      {showBootLoader ? (
        <LoadingScreen
          key={bootDone && awaitingHome ? "home-loader" : "boot-loader"}
          skipIntro={bootDone && awaitingHome}
          preparing={bootPhase === "preparing" || (bootDone && awaitingHome)}
          ready={bootDone && awaitingHome ? homeReady : bootUnlockReady}
          onIntroComplete={() => {
            if (!(bootDone && awaitingHome)) setBootPhase("preparing");
          }}
          onComplete={() => {
            if (bootDone && awaitingHome) {
              setHomeReady(true);
              return;
            }
            setBootPhase("done");
          }}
        />
      ) : null}

      {/* Niente wrapper fixed/invisible: spezzava h-full e bloccava lo scroll. */}
      {mountAppShell && activeProfile && (
        <LibraryProvider profileId={activeProfile.id}>
          <AddonsProvider profileId={activeProfile.id}>
            <AppUpdaterProvider>
              {isWebShell() && <WebEssentialUpdateBanner />}
              <CloudFriendAlertsProvider>
                <ChatMessageAlertsProvider>
                  <ChatPopupProvider>
                    <WatchPartyHostProvider>
                      {isGuest && bootDone && homeReady && (
                        <GuestHotSinglesToast />
                      )}
                      <AppContent
                        onHomeReady={handleHomeReady}
                        deferAmbient={showBootLoader}
                      />
                    </WatchPartyHostProvider>
                  </ChatPopupProvider>
                </ChatMessageAlertsProvider>
              </CloudFriendAlertsProvider>
            </AppUpdaterProvider>
          </AddonsProvider>
        </LibraryProvider>
      )}

      {bootDone && homeReady && <GlobalBroadcastModal />}

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
    </>
  );
}

function App() {
  if (
    typeof window !== "undefined" &&
    isEmailConfirmedPath(window.location.pathname)
  ) {
    return <EmailConfirmedPage />;
  }

  if (
    typeof window !== "undefined" &&
    isWebAppInstallPath(window.location.pathname)
  ) {
    return <WebAppInstallPage />;
  }

  return (
    <CloudAccountProvider>
      <PosterQualityProvider>
        <AppAccessProvider>
          <NotificationProvider>
            <MobileDeviceProvider>
              <ProfileProvider>
                <PreviewAudioProvider>
                  <AppGate />
                </PreviewAudioProvider>
              </ProfileProvider>
            </MobileDeviceProvider>
          </NotificationProvider>
        </AppAccessProvider>
      </PosterQualityProvider>
    </CloudAccountProvider>
  );
}

export default App;
