import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  fetchAddonMeta,
  fetchScMeta,
  fetchScSeasonEpisodes,
  fetchSaturnMeta,
  fetchLoonexMeta,
  fetchYoutubeMeta,
  getStreamingWatchProgress,
  listStreamingTitleProgress,
  resolveAddonStreams,
  resolveScStream,
  resolveSaturnStream,
  resolveLoonexStream,
  resolveYoutubeStream,
  saveStreamingWatchProgress,
  resolveScPreview,
  resolveTorrentSource,
} from "../lib/addonsApi";
import { readPlayerAudioLanguage } from "../lib/playerAudioLanguage";
import type { PlayerStreamAudioLanguage } from "../lib/playerAudioLanguage";
import {
  metaVideoToMediaItem,
  metaVideosToMediaItems,
} from "../lib/streamingBrowse";
import type { TitleDetailEpisodeProgress } from "../lib/titleDetail";
import { stremioVideosToDetailEpisodes } from "../lib/titleDetail";
import type { AddonWatchTarget } from "../lib/streamingBrowse";
import { STREMIO_ADDONS_ENABLED, isBuiltinStreamingCatalog } from "../lib/features";
import { streamingListKey } from "../lib/myList";
import { useMyList } from "../lib/useMyList";
import type { PlayableStream, StremioMeta, StremioMetaPreview } from "../types/stremio";
import type { WatchPartySession } from "../types/watchParty";
import { VideoPlayer } from "./VideoPlayer";
import { YouTubePlayer, youtubeVideoIdFromStreamUrl } from "./YouTubePlayer";
import { StreamingTitlePage } from "./StreamingTitlePage";

import type { BrowseItem } from "../lib/browse";
import { nextEpisode } from "../lib/browse";
import { RelatedTitlesSection } from "./RelatedTitlesSection";

interface AddonWatchPageProps extends AddonWatchTarget {
  profileId: string;
  onBack: () => void;
  onRefreshContinue?: () => void | Promise<void>;
  relatedItems?: BrowseItem[];
  onOpenDetail?: (browse: BrowseItem) => void;
  onPlayRelated?: (id: string) => void;
  onPlayStreamingRelated?: (preview: StremioMetaPreview) => void;
  onOpenSeries?: (seriesKey: string) => void;
  onToggleFavorite?: (id: string) => void;
  onToggleStreamingList?: (preview: StremioMetaPreview) => void;
  onEdit?: (id: string) => void;
  watchPartySession?: WatchPartySession | null;
  onWatchPartySessionChange?: (session: WatchPartySession | null) => void;
}

function StreamPickModal({
  streamPick,
  resolving,
  error,
  onPick,
  onClose,
}: {
  streamPick: {
    videoId: string;
    videoTitle: string;
    streams: PlayableStream[];
  };
  resolving: boolean;
  error: string | null;
  onPick: (stream: PlayableStream) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-void p-5">
        <h3 className="text-[15px] font-medium text-text-primary">Scegli qualità</h3>
        {resolving && (
          <p className="mt-2 flex items-center gap-2 text-[12px] text-text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Avvio del torrent… (ricerca peer)
          </p>
        )}
        {error && <p className="mt-2 text-[12px] text-red-400/90">{error}</p>}
        <ul className="mt-3 max-h-[50vh] space-y-2 overflow-y-auto">
          {streamPick.streams.map((s, i) => (
            <li key={`${s.url || s.infoHash}-${i}`}>
              <button
                type="button"
                disabled={resolving}
                onClick={() => onPick(s)}
                className="w-full rounded-xl border border-white/[0.08] px-3 py-2.5 text-left text-[13px] hover:border-accent/30 disabled:opacity-50"
              >
                {s.name || s.description || `Stream ${i + 1}`}
                <span className="mt-0.5 block text-[11px] text-text-muted">
                  {s.addonName}
                  {s.needsDebrid ? " · Torrent" : s.isHls ? " · HLS" : " · Diretto"}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-full border border-white/10 py-2 text-[12px] text-text-muted"
        >
          Annulla
        </button>
      </div>
    </div>
  );
}

export function AddonWatchPage({
  profileId,
  contentType,
  metaId,
  videoId: initialVideoId,
  preferredVideoId: initialPreferredVideoId,
  slug,
  catalogPrefix,
  onBack,
  onRefreshContinue,
  relatedItems = [],
  onOpenDetail,
  onPlayRelated,
  onPlayStreamingRelated,
  onOpenSeries,
  onToggleFavorite,
  onToggleStreamingList,
  onEdit,
  watchPartySession,
  onWatchPartySessionChange,
}: AddonWatchPageProps) {
  const isSc = catalogPrefix === "sc" && !!slug;
  const isSaturn = catalogPrefix === "saturn" && !!slug;
  const isLoonex = catalogPrefix === "loonex" && !!slug;
  const isYoutube = catalogPrefix === "youtube" && !!slug;
  const isBuiltin = isSc || isSaturn || isLoonex || isYoutube;
  const [meta, setMeta] = useState<StremioMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamsLoading, setStreamsLoading] = useState(false);
  const [streamPick, setStreamPick] = useState<{
    videoId: string;
    videoTitle: string;
    streams: PlayableStream[];
  } | null>(null);
  const [playback, setPlayback] = useState<{
    stream: PlayableStream;
    videoId: string;
    videoTitle: string;
    watchPosition?: number;
    watchDuration?: number;
  } | null>(null);
  const [resolving, setResolving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [myListLoading, setMyListLoading] = useState(false);
  const [episodeProgress, setEpisodeProgress] = useState<
    Record<string, TitleDetailEpisodeProgress>
  >({});
  const { streamingListKeys, toggleStreaming } = useMyList(profileId);
  const initialAutoplayDoneRef = useRef(false);
  const userPlaybackStartedRef = useRef(false);
  const playbackGenerationRef = useRef(0);

  useEffect(() => {
    initialAutoplayDoneRef.current = false;
    userPlaybackStartedRef.current = false;
    playbackGenerationRef.current = 0;
  }, [metaId, slug, catalogPrefix, contentType, initialVideoId, initialPreferredVideoId]);

  const loadEpisodeProgress = useCallback(async () => {
    if (!isBuiltin || !slug || !meta) {
      setEpisodeProgress({});
      return;
    }
    try {
      const rows = await listStreamingTitleProgress(
        profileId,
        catalogPrefix ?? "sc",
        contentType,
        metaId,
        slug,
      );
      const map: Record<string, TitleDetailEpisodeProgress> = {};
      for (const row of rows) {
        map[row.videoId] = {
          watchPosition: row.positionSecs,
          watchDuration: row.durationSecs ?? undefined,
        };
      }
      setEpisodeProgress(map);
    } catch {
      // ignore
    }
  }, [isBuiltin, slug, meta, profileId, catalogPrefix, contentType, metaId]);

  const listPreview = useMemo((): StremioMetaPreview | null => {
    if (!meta) return null;
    return {
      id: metaId,
      type: contentType,
      name: meta.name,
      poster: meta.poster,
      description: meta.description,
      releaseInfo: meta.releaseInfo,
      catalogPrefix: catalogPrefix ?? "sc",
      slug,
    };
  }, [meta, metaId, contentType, catalogPrefix, slug]);

  const isInMyList = listPreview
    ? streamingListKeys.has(streamingListKey(listPreview))
    : false;

  const handleToggleMyList = useCallback(async () => {
    if (!listPreview) return;
    setMyListLoading(true);
    try {
      await toggleStreaming(listPreview);
    } finally {
      setMyListLoading(false);
    }
  }, [listPreview, toggleStreaming]);

  const resolveEpisodeStream = useCallback(
    async (videoId: string) => {
      if (!isBuiltin || !slug) return null;
      try {
        const stream = isSc
          ? await resolveScStream(metaId, slug, videoId, readPlayerAudioLanguage())
          : isLoonex
            ? await resolveLoonexStream(slug, videoId)
            : isYoutube
              ? await resolveYoutubeStream(slug, videoId)
              : await resolveSaturnStream(slug, videoId);
        return { url: stream.url, isHls: stream.isHls };
      } catch {
        return null;
      }
    },
    [isBuiltin, isSc, isLoonex, isYoutube, metaId, slug],
  );

  const playStream = useCallback(
    async (stream: PlayableStream, videoId: string, videoTitle: string) => {
      const loadProgress = async () => {
        if (!isBuiltin || !slug) {
          return { watchPosition: undefined, watchDuration: undefined };
        }
        try {
          const progress = await getStreamingWatchProgress(
            profileId,
            catalogPrefix ?? "sc",
            contentType,
            metaId,
            slug,
            videoId,
          );
          if (!progress) return { watchPosition: undefined, watchDuration: undefined };
          return {
            watchPosition: progress[0],
            watchDuration: progress[1] ?? undefined,
          };
        } catch {
          return { watchPosition: undefined, watchDuration: undefined };
        }
      };

      if (!stream.needsDebrid) {
        const resume =
          watchPartySession?.role === "guest"
            ? {
                watchPosition: watchPartySession.room.positionSecs,
                watchDuration: undefined,
              }
            : await loadProgress();
        setPlayback({ stream, videoId, videoTitle, ...resume });
        setStreamPick(null);
        return;
      }
      setResolving(true);
      setError(null);
      try {
        const resolved = await resolveTorrentSource(
          profileId,
          stream.infoHash ?? "",
          stream.fileIdx,
          stream.sources ?? [],
        );
        const resume =
          watchPartySession?.role === "guest"
            ? {
                watchPosition: watchPartySession.room.positionSecs,
                watchDuration: undefined,
              }
            : await loadProgress();
        setPlayback({ stream: resolved, videoId, videoTitle, ...resume });
        setStreamPick(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setResolving(false);
      }
    },
    [profileId, isBuiltin, catalogPrefix, slug, contentType, metaId, watchPartySession],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const data = isSc
          ? await fetchScMeta(metaId, slug!)
          : isLoonex
            ? await fetchLoonexMeta(slug!)
            : isYoutube
              ? await fetchYoutubeMeta(slug!)
              : isSaturn
                ? await fetchSaturnMeta(slug!)
                : await fetchAddonMeta(profileId, contentType, metaId);
        if (!cancelled) setMeta(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId, contentType, metaId, isSc, isSaturn, isLoonex, isYoutube, slug]);

  useEffect(() => {
    if (!meta || playback) return;
    void loadEpisodeProgress();
  }, [meta, playback, loadEpisodeProgress]);

  const seriesEpisodes = useMemo(
    () => (meta ? metaVideosToMediaItems(meta) : []),
    [meta],
  );

  const startPlayback = useCallback(
    async (videoId: string, videoTitle: string) => {
      if (!meta) return;
      const isMovie = meta.type === "movie";
      const episodeId = isMovie ? meta.id : videoId?.trim();
      const isMultiEpisodeSeries =
        (meta.type === "series" || meta.type === "channel") &&
        meta.videos.length > 1;
      if (isMultiEpisodeSeries && !episodeId) {
        setError("Seleziona un episodio dalla lista.");
        return;
      }

      const generation = ++playbackGenerationRef.current;
      userPlaybackStartedRef.current = true;
      setStreamsLoading(true);
      setStreamPick(null);
      setError(null);
      try {
        const audioLang = readPlayerAudioLanguage();
        const streams = isSc
          ? [
              await resolveScStream(
                metaId,
                slug!,
                isMovie ? undefined : episodeId,
                audioLang,
              ),
            ]
          : isLoonex
            ? [await resolveLoonexStream(slug!, episodeId)]
            : isYoutube
              ? [await resolveYoutubeStream(slug!, episodeId ?? meta.id)]
              : isSaturn
                ? [await resolveSaturnStream(slug!, episodeId)]
                : await resolveAddonStreams(profileId, meta.type, episodeId);
        if (generation !== playbackGenerationRef.current) return;
        if (streams.length === 0) {
          setError(
            "Nessuno stream riproducibile in app. Installa un addon con risorsa «stream» (URL HTTP/HLS).",
          );
          return;
        }
        const progressVideoId = isMovie ? meta.id : episodeId;
        if (streams.length === 1) {
          await playStream(streams[0], progressVideoId, videoTitle);
        } else {
          setStreamPick({ videoId: progressVideoId, videoTitle, streams });
        }
      } catch (err) {
        if (generation === playbackGenerationRef.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (generation === playbackGenerationRef.current) {
          setStreamsLoading(false);
        }
      }
    },
    [meta, profileId, playStream, isSc, isSaturn, isLoonex, isYoutube, metaId, slug],
  );

  const handleStreamAudioLanguage = useCallback(
    async (lang: PlayerStreamAudioLanguage) => {
      if (!isSc || !slug || !meta || !playback) return;
      const isMovie = meta.type === "movie";
      const episodeId = isMovie ? undefined : playback.videoId;
      const stream = await resolveScStream(metaId, slug, episodeId, lang);
      setPlayback((prev) => (prev ? { ...prev, stream } : prev));
    },
    [isSc, slug, meta, metaId, playback],
  );

  const startPreview = useCallback(async () => {
    if (!meta || !isSc || !slug) return;
    setPreviewLoading(true);
    setError(null);
    try {
      const stream = await resolveScPreview(metaId, slug);
      if (!stream) {
        setError("Trailer non disponibile per questo titolo.");
        return;
      }
      const trailerVideoId = meta.videos[0]?.id ?? metaId;
      await playStream(stream, trailerVideoId, `${meta.name} · Trailer`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewLoading(false);
    }
  }, [meta, isSc, slug, metaId, playStream]);

  const handleLoadSeason = useCallback(
    async (season: number) => {
      if (!isSc || !slug || !meta) return;
      const videos = await fetchScSeasonEpisodes(metaId, slug, season);
      if (videos.length > 0) {
        setMeta((prev) => {
          if (!prev) return prev;
          const byId = new Map(prev.videos.map((video) => [video.id, video]));
          for (const video of videos) {
            byId.set(video.id, video);
          }
          const merged = [...byId.values()].sort((a, b) => {
            const seasonA = a.season ?? 0;
            const seasonB = b.season ?? 0;
            if (seasonA !== seasonB) return seasonA - seasonB;
            return (a.episode ?? 0) - (b.episode ?? 0);
          });
          return { ...prev, videos: merged };
        });
      }
      return stremioVideosToDetailEpisodes(meta, videos, episodeProgress);
    },
    [isSc, slug, meta, metaId, episodeProgress],
  );

  useEffect(() => {
    if (
      !meta ||
      !initialVideoId ||
      loading ||
      initialAutoplayDoneRef.current ||
      userPlaybackStartedRef.current
    ) {
      return;
    }
    const isMovie = meta.type === "movie";
    const autoplayVideoId = isMovie
      ? (meta.videos[0]?.id ?? metaId)
      : initialVideoId;
    const video = meta.videos.find((v) => v.id === autoplayVideoId);
    const title = video?.title?.trim() || meta.name;
    initialAutoplayDoneRef.current = true;
    void startPlayback(autoplayVideoId, title);
  }, [meta, initialVideoId, metaId, loading, startPlayback]);

  if (!STREMIO_ADDONS_ENABLED && !isBuiltinStreamingCatalog(catalogPrefix)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-void px-8 text-center">
        <p className="max-w-md text-[15px] text-text-secondary">
          Gli addon Stremio sono disattivati. Usa i titoli Streaming Community
          dalla Home.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-white/15 px-4 py-2 text-[13px]"
        >
          Indietro
        </button>
      </div>
    );
  }

  if (playback && meta) {
    const youtubeVideoId = youtubeVideoIdFromStreamUrl(playback.stream.url);
    if (playback.stream.addonId === "youtube" && youtubeVideoId) {
      const followingEpisode = nextEpisode(seriesEpisodes, playback.videoId);
      const saveYoutubeProgress = async (videoId: string, episodeLabel?: string) => {
        if (!isBuiltin || !slug) return;
        try {
          await saveStreamingWatchProgress(profileId, {
            catalogPrefix: catalogPrefix ?? "youtube",
            contentType: meta.type,
            titleId: metaId,
            slug,
            videoId,
            titleName: meta.name,
            episodeLabel,
            poster: meta.poster,
            positionSecs: 1,
          });
        } catch {
          // ignore
        }
      };

      return (
        <YouTubePlayer
          videoId={youtubeVideoId}
          title={playback.videoTitle}
          nextEpisode={
            followingEpisode
              ? {
                  videoId: followingEpisode.id,
                  title: followingEpisode.title,
                  thumbnail: followingEpisode.posterUrl,
                }
              : undefined
          }
          onPlayNext={(videoId, videoTitle) => {
            void (async () => {
              await saveYoutubeProgress(
                playback.videoId,
                playback.videoTitle !== meta.name ? playback.videoTitle : undefined,
              );
              await startPlayback(videoId, videoTitle);
            })();
          }}
          onBack={async () => {
            await saveYoutubeProgress(
              playback.videoId,
              playback.videoTitle !== meta.name ? playback.videoTitle : undefined,
            );
            setPlayback(null);
            void loadEpisodeProgress();
            void onRefreshContinue?.();
          }}
        />
      );
    }

    const playbackMedia = metaVideoToMediaItem(
      meta,
      playback.videoId,
      playback.videoTitle,
    );
    if (playback.watchPosition != null) {
      playbackMedia.watchPosition = playback.watchPosition;
    }
    if (playback.watchDuration != null) {
      playbackMedia.watchDuration = playback.watchDuration;
    }
    const episodeLabel =
      playback.videoTitle !== meta.name ? playback.videoTitle : undefined;

    return (
      <VideoPlayer
        streamUrl={playback.stream.url}
        isHls={playback.stream.isHls}
        remotePlayback={{
          contentType: meta.type,
          videoId: playback.videoId,
          catalogPrefix: isBuiltin ? catalogPrefix : undefined,
          titleId: metaId,
          slug: slug ?? undefined,
          titleName: meta.name,
          episodeLabel,
          poster: meta.poster,
        }}
        media={playbackMedia}
        episodes={seriesEpisodes}
        onPlayEpisode={(videoId) => {
          const video = meta.videos.find((v) => v.id === videoId);
          void startPlayback(videoId, video?.title?.trim() || meta.name);
        }}
        watchPartySession={watchPartySession}
        onWatchPartySessionChange={onWatchPartySessionChange}
        onStreamAudioLanguageChange={
          isSc ? handleStreamAudioLanguage : undefined
        }
        onBack={async () => {
          if (watchPartySession) {
            onWatchPartySessionChange?.(null);
            await onBack();
            return;
          }
          setPlayback(null);
          void loadEpisodeProgress();
          await onRefreshContinue?.();
          if (initialVideoId) await onBack();
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-void">
        <Loader2 className="h-8 w-8 animate-spin text-text-muted" />
      </div>
    );
  }

  if (error && !meta) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-void px-8">
        <p className="max-w-md text-center text-[15px] text-red-300">{error}</p>
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-white/15 px-4 py-2 text-[13px]"
        >
          Indietro
        </button>
      </div>
    );
  }

  if (!meta) return null;

  return (
    <>
      <StreamingTitlePage
        meta={meta}
        episodeProgress={episodeProgress}
        preferredVideoId={initialPreferredVideoId}
        loading={streamsLoading || resolving}
        error={error}
        onBack={onBack}
        onPlay={(videoId, videoTitle) => void startPlayback(videoId, videoTitle)}
        onPlayPreview={
          isSc && meta.hasPreview ? () => void startPreview() : undefined
        }
        previewLoading={previewLoading}
        isInMyList={isInMyList}
        onToggleMyList={() => void handleToggleMyList()}
        myListLoading={myListLoading}
        resolveEpisodeStream={isBuiltin && !isYoutube ? resolveEpisodeStream : undefined}
        onLoadSeason={isSc ? handleLoadSeason : undefined}
        footer={
          relatedItems.length > 0 ? (
            <RelatedTitlesSection
              items={relatedItems}
              onPlay={onPlayRelated ?? (() => {})}
              onPlayStreaming={onPlayStreamingRelated}
              onOpenDetail={onOpenDetail}
              onOpenSeries={onOpenSeries}
              onToggleFavorite={onToggleFavorite}
              onToggleStreamingList={onToggleStreamingList}
              onEdit={onEdit}
            />
          ) : undefined
        }
      />
      {streamPick && (
        <StreamPickModal
          streamPick={streamPick}
          resolving={resolving}
          error={error}
          onPick={(s) =>
            void playStream(s, streamPick.videoId, streamPick.videoTitle)
          }
          onClose={() => setStreamPick(null)}
        />
      )}
    </>
  );
}
