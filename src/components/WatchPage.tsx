import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchMedia, fetchStreamInfo } from "../lib/api";
import { useProfile } from "../context/ProfileContext";
import { useLibrary } from "../context/LibraryContext";
import { usePreviewAudio } from "../context/PreviewAudioContext";
import { canPlayMedia } from "../lib/parentalApi";
import { getSeriesEpisodes } from "../lib/browse";
import {
  localEpisodesForMedia,
  titleDetailFromMediaItem,
} from "../lib/titleDetail";
import { isStreamingMediaId } from "../lib/streamingBrowse";
import { mediaItemToStreamingPreview, streamingListKey } from "../lib/myList";
import { useMyList } from "../lib/useMyList";
import type { MediaItem } from "../types/media";
import type { BrowseItem } from "../lib/browse";
import type { StremioMetaPreview } from "../types/stremio";
import { TitleDetailPage } from "./TitleDetailPage";
import { RelatedTitlesSection } from "./RelatedTitlesSection";
import { VideoPlayer } from "./VideoPlayer";

interface WatchPageProps {
  mediaId: string;
  autoplay?: boolean;
  relatedItems?: BrowseItem[];
  onBack: () => void;
  onPlayEpisode: (id: string) => void;
  onOpenDetail?: (browse: BrowseItem) => void;
  onPlayStreaming?: (preview: StremioMetaPreview) => void;
  onOpenSeries?: (seriesKey: string) => void;
  onToggleStreamingList?: (preview: StremioMetaPreview) => void;
}

export function WatchPage({
  mediaId,
  autoplay = false,
  relatedItems = [],
  onBack,
  onPlayEpisode,
  onOpenDetail,
  onPlayStreaming,
  onOpenSeries,
  onToggleStreamingList,
}: WatchPageProps) {
  const { activeProfile } = useProfile();
  const { library, toggleFavorite } = useLibrary();
  const { streamingListKeys, toggleStreaming } = useMyList(activeProfile?.id ?? "");
  const { setPlaybackActive } = usePreviewAudio();
  const [phase, setPhase] = useState<"detail" | "playing">(
    autoplay ? "playing" : "detail",
  );
  const [media, setMedia] = useState<MediaItem | null>(null);
  const [loadingMedia, setLoadingMedia] = useState(true);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [startingPlayback, setStartingPlayback] = useState(false);
  const [myListLoading, setMyListLoading] = useState(false);

  useEffect(() => {
    setPhase(autoplay ? "playing" : "detail");
  }, [mediaId, autoplay]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!activeProfile) return;
      setLoadingMedia(true);
      setError(null);
      setMedia(null);

      try {
        const fromLibrary = library?.items.find((item) => item.id === mediaId);
        const item = fromLibrary ?? (await fetchMedia(activeProfile.id, mediaId));
        if (!cancelled) {
          setMedia(item);
          setLoadingMedia(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Contenuto non trovato");
          setLoadingMedia(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mediaId, activeProfile?.id, library?.items]);

  const detail = useMemo(() => {
    if (!media) return null;
    const libraryItems = library?.items ?? [];
    const episodes = localEpisodesForMedia(media, libraryItems);
    return titleDetailFromMediaItem(media, episodes);
  }, [media, library?.items]);

  const isInMyList = useMemo(() => {
    if (!media) return false;
    if (isStreamingMediaId(media.id)) {
      const preview = mediaItemToStreamingPreview(media);
      return preview ? streamingListKeys.has(streamingListKey(preview)) : false;
    }
    return media.isFavorite;
  }, [media, streamingListKeys]);

  const handleToggleMyList = useCallback(async () => {
    if (!media) return;
    setMyListLoading(true);
    try {
      if (isStreamingMediaId(media.id)) {
        const preview = mediaItemToStreamingPreview(media);
        if (preview) await toggleStreaming(preview);
      } else {
        await toggleFavorite(media.id);
        setMedia((current) =>
          current ? { ...current, isFavorite: !current.isFavorite } : current,
        );
      }
    } finally {
      setMyListLoading(false);
    }
  }, [media, toggleFavorite, toggleStreaming]);

  const startPlayback = useCallback(
    async (episodeId: string) => {
      if (!activeProfile) return;
      setStartingPlayback(true);
      setBlocked(null);
      setError(null);

      try {
        const playCheck = await canPlayMedia(activeProfile.id, episodeId);
        if (!playCheck.allowed) {
          setBlocked(playCheck.reason ?? "Visione non consentita");
          return;
        }

        const info = await fetchStreamInfo(activeProfile.id, episodeId);
        setStreamUrl(info.url);
        setMedia(info.media);
        setPhase("playing");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Errore di riproduzione");
      } finally {
        setStartingPlayback(false);
      }
    },
    [activeProfile?.id],
  );

  useEffect(() => {
    if (phase !== "playing" || streamUrl || !autoplay || !activeProfile) return;
    void startPlayback(mediaId);
  }, [phase, streamUrl, autoplay, mediaId, activeProfile, startPlayback]);

  useEffect(() => {
    setPlaybackActive(phase === "playing");
    return () => setPlaybackActive(false);
  }, [phase, setPlaybackActive]);

  if (loadingMedia) {
    return (
      <div className="flex h-full items-center justify-center bg-void">
        <Loader2 className="h-8 w-8 animate-spin text-text-muted" />
      </div>
    );
  }

  if (error && !media) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-void px-8">
        <p className="text-text-secondary">{error}</p>
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-white/10 px-5 py-2 text-sm text-text-primary hover:bg-white/5"
        >
          Torna indietro
        </button>
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-void px-8 text-center">
        <p className="max-w-md text-[15px] text-text-secondary">{blocked}</p>
        <button
          type="button"
          onClick={() => setBlocked(null)}
          className="rounded-full border border-white/10 px-5 py-2 text-sm text-text-primary hover:bg-white/5"
        >
          Torna indietro
        </button>
      </div>
    );
  }

  if (phase === "detail" && detail) {
    return (
      <TitleDetailPage
        detail={detail}
        loading={startingPlayback}
        error={error}
        onBack={onBack}
        onPlay={(episodeId) => void startPlayback(episodeId)}
        isInMyList={isInMyList}
        onToggleMyList={() => void handleToggleMyList()}
        myListLoading={myListLoading}
        footer={
          relatedItems.length > 0 ? (
            <RelatedTitlesSection
              items={relatedItems}
              onPlay={(id) => void startPlayback(id)}
              onPlayStreaming={onPlayStreaming}
              onOpenDetail={onOpenDetail}
              onOpenSeries={onOpenSeries}
              onToggleFavorite={toggleFavorite}
              onToggleStreamingList={onToggleStreamingList}
            />
          ) : undefined
        }
      />
    );
  }

  if (phase === "playing" && !streamUrl) {
    return (
      <div className="flex h-full items-center justify-center bg-void">
        <Loader2 className="h-8 w-8 animate-spin text-text-muted" />
      </div>
    );
  }

  if (phase === "playing" && streamUrl && media) {
    const episodes =
      media.seriesTitle && library
        ? getSeriesEpisodes(library.items, {
            mediaType: media.mediaType,
            seriesTitle: media.seriesTitle,
          })
        : [];

    return (
      <VideoPlayer
        streamUrl={streamUrl}
        media={media}
        episodes={episodes}
        onBack={() => {
          if (autoplay) {
            void onBack();
            return;
          }
          setPhase("detail");
          setStreamUrl(null);
        }}
        onPlayEpisode={onPlayEpisode}
      />
    );
  }

  return null;
}
