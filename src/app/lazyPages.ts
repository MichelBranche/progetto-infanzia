import { lazy } from "react";

export const WatchPage = lazy(() =>
  import("../components/WatchPage").then((m) => ({ default: m.WatchPage })),
);
export const VideoPlayer = lazy(() =>
  import("../components/VideoPlayer").then((m) => ({ default: m.VideoPlayer })),
);
export const SettingsPage = lazy(() =>
  import("../components/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
export const ParentalActivityPage = lazy(() =>
  import("../components/ParentalActivityPage").then((m) => ({
    default: m.ParentalActivityPage,
  })),
);
export const DevConsolePage = lazy(() =>
  import("../components/DevConsolePage").then((m) => ({
    default: m.DevConsolePage,
  })),
);
export const FeedbackPage = lazy(() =>
  import("../components/FeedbackPage").then((m) => ({
    default: m.FeedbackPage,
  })),
);
export const InviteFriendsPage = lazy(() =>
  import("../components/InviteFriendsPage").then((m) => ({
    default: m.InviteFriendsPage,
  })),
);
export const ChatsPage = lazy(() =>
  import("../components/ChatsPage").then((m) => ({ default: m.ChatsPage })),
);
export const StreamingPage = lazy(() =>
  import("../components/StreamingPage").then((m) => ({ default: m.StreamingPage })),
);
export const AnimePage = lazy(() =>
  import("../components/AnimePage").then((m) => ({ default: m.AnimePage })),
);
export const MangaPage = lazy(() =>
  import("../components/MangaPage").then((m) => ({ default: m.MangaPage })),
);
export const MangaDetailPage = lazy(() =>
  import("../components/MangaDetailPage").then((m) => ({
    default: m.MangaDetailPage,
  })),
);
export const MangaReaderPage = lazy(() =>
  import("../components/MangaReaderPage").then((m) => ({
    default: m.MangaReaderPage,
  })),
);
export const BooksPage = lazy(() =>
  import("../components/BooksPage").then((m) => ({ default: m.BooksPage })),
);
export const BookDetailPage = lazy(() =>
  import("../components/BookDetailPage").then((m) => ({
    default: m.BookDetailPage,
  })),
);
export const BookReaderPage = lazy(() =>
  import("../components/BookReaderPage").then((m) => ({
    default: m.BookReaderPage,
  })),
);
export const SearchOverlay = lazy(() =>
  import("../components/SearchOverlay").then((m) => ({
    default: m.SearchOverlay,
  })),
);
export const AddonWatchPage = lazy(() =>
  import("../components/AddonWatchPage").then((m) => ({
    default: m.AddonWatchPage,
  })),
);
