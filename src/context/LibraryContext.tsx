import {

  createContext,

  useCallback,

  useContext,

  useEffect,

  useMemo,

  useState,

  type ReactNode,

} from "react";

import {

  fetchLibrary,

  scanLibrary,

  searchMedia,

  toggleFavorite as apiToggleFavorite,

} from "../lib/api";

import { fetchSettings } from "../lib/settingsApi";

import type { Library, MediaItem } from "../types/media";



interface LibraryContextValue {

  library: Library | null;

  loading: boolean;

  error: string | null;

  searchQuery: string;

  setSearchQuery: (q: string) => void;

  searchResults: MediaItem[];

  subscribedServices: string[];

  refresh: () => Promise<void>;

  rescan: () => Promise<void>;

  scanning: boolean;

  toggleFavorite: (mediaId: string) => Promise<void>;

  getItemsBySection: (section: string) => MediaItem[];

}



const LibraryContext = createContext<LibraryContextValue | null>(null);



export function LibraryProvider({

  profileId,

  children,

}: {

  profileId: string;

  children: ReactNode;

}) {

  const [library, setLibrary] = useState<Library | null>(null);

  const [loading, setLoading] = useState(true);

  const [scanning, setScanning] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");

  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);

  const [subscribedServices, setSubscribedServices] = useState<string[]>([]);



  const refresh = useCallback(async () => {

    setLoading(true);

    setError(null);

    try {

      const data = await fetchLibrary(profileId);

      setLibrary(data);

      try {

        const settings = await fetchSettings();

        setSubscribedServices(settings.subscribedServices);

        localStorage.setItem(

          "branchefy-intro-sound",

          String(settings.introSoundEnabled),

        );

      } catch {

        // impostazioni opzionali al primo avvio

      }

    } catch (e) {

      setError(e instanceof Error ? e.message : String(e));

    } finally {

      setLoading(false);

    }

  }, [profileId]);



  const rescan = useCallback(async () => {

    setScanning(true);

    setError(null);

    try {

      await scanLibrary();

      await refresh();

    } catch (e) {

      setError(e instanceof Error ? e.message : String(e));

    } finally {

      setScanning(false);

    }

  }, [refresh]);



  useEffect(() => {

    refresh();

  }, [refresh]);



  useEffect(() => {

    const q = searchQuery.trim();

    if (!q) {

      setSearchResults([]);

      return;

    }



    const timer = setTimeout(async () => {

      try {

        const results = await searchMedia(profileId, q);

        setSearchResults(results);

      } catch {

        setSearchResults([]);

      }

    }, 250);



    return () => clearTimeout(timer);

  }, [searchQuery, profileId]);



  const toggleFavorite = useCallback(

    async (mediaId: string) => {

      await apiToggleFavorite(profileId, mediaId);

      await refresh();

    },

    [profileId, refresh],

  );



  const getItemsBySection = useCallback(

    (section: string): MediaItem[] => {

      if (!library) return [];



      switch (section) {

        case "film":

          return library.items.filter((i) => i.mediaType === "film");

        case "cartoni":

          return library.items.filter((i) => i.mediaType === "cartone");

        case "serie":

          return library.items.filter((i) => i.mediaType === "serie");

        case "capsula":

          return library.items.filter(

            (i) => i.year !== undefined && i.year < 2005,

          );

        case "search":

          return searchResults;

        default:

          return library.items;

      }

    },

    [library, searchResults],

  );



  const value = useMemo(

    () => ({

      library,

      loading,

      error,

      searchQuery,

      setSearchQuery,

      searchResults,

      subscribedServices,

      refresh,

      rescan,

      scanning,

      toggleFavorite,

      getItemsBySection,

    }),

    [

      library,

      loading,

      error,

      searchQuery,

      searchResults,

      subscribedServices,

      refresh,

      rescan,

      scanning,

      toggleFavorite,

      getItemsBySection,

    ],

  );



  return (

    <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>

  );

}



export function useLibrary() {

  const ctx = useContext(LibraryContext);

  if (!ctx) throw new Error("useLibrary must be used within LibraryProvider");

  return ctx;

}


